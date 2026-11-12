import { NextResponse } from "next/server";
import { CATALOG } from "../../../lib/interlock/catalog";
import { evaluate } from "../../../lib/interlock/interlock";
import { store, mandate } from "../../../lib/interlock/state";
import { createOrder } from "../../../lib/paypal";
import type { Proposal } from "../../../lib/interlock/types";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const proposal: Proposal = {
    itemId: String(body.itemId ?? ""),
    quantity: Number(body.quantity),
    amountCents: Number(body.amountCents),
    currency: String(body.currency ?? ""),
  };
  const userApproved = body.userApproved === true;

  const decision = evaluate(proposal, mandate, CATALOG, store.spentCents);
  const log = (note: string) =>
    store.audit.push({
      at: new Date().toISOString(),
      proposal,
      verdict: decision.verdict,
      checks: decision.checks,
      note,
    });

  if (decision.verdict === "block") {
    log("Blocked by the interlock. PayPal was never called.");
    return NextResponse.json({ decision, paypalCalled: false }, { status: 403 });
  }
  if (decision.verdict === "needs_approval" && !userApproved) {
    log("Waiting for the user to confirm. PayPal was not called.");
    return NextResponse.json({ decision, paypalCalled: false }, { status: 202 });
  }

  // The amount comes from the trusted catalog, never from the agent's claim.
  const item = CATALOG[proposal.itemId];
  const amountCents = item.priceCents * proposal.quantity;
  const origin = new URL(req.url).origin;

  try {
    const order = await createOrder({
      amountCents,
      description: `${item.title} x${proposal.quantity}`,
      referenceId: item.id,
      returnUrl: `${origin}/api/paypal/return`,
      cancelUrl: `${origin}/api/paypal/cancel`,
    });
    if (!order.approveUrl) throw new Error("PayPal did not return an approval link");
    store.pending.set(order.orderId, {
      orderId: order.orderId,
      itemId: item.id,
      quantity: proposal.quantity,
      amountCents,
      status: "pending",
    });
    log(`PayPal order ${order.orderId} created. Waiting for the buyer to approve at PayPal.`);
    return NextResponse.json({
      decision,
      paypalCalled: true,
      orderId: order.orderId,
      approveUrl: order.approveUrl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PayPal error";
    log(`PayPal error: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
