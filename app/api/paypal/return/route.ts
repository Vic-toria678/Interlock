import { NextResponse } from "next/server";
import { store } from "../../../../lib/interlock/state";
import { captureOrder } from "../../../../lib/paypal";

export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get("token");
  const pending = orderId ? store.pending.get(orderId) : undefined;

  if (!orderId || !pending) {
    return NextResponse.json(
      { error: "Unknown order. Interlock only captures orders it approved itself." },
      { status: 400 }
    );
  }
  if (pending.status === "captured") {
    return NextResponse.redirect(new URL(`/?paid=${orderId}`, req.url));
  }

  try {
    const cap = await captureOrder(orderId);
    if (cap.status === "COMPLETED") {
      pending.status = "captured";
      store.spentCents += pending.amountCents;
      store.audit.push({
        at: new Date().toISOString(),
        proposal: {
          itemId: pending.itemId,
          quantity: pending.quantity,
          amountCents: pending.amountCents,
          currency: "USD",
        },
        verdict: "paid",
        checks: [],
        note: `Payment captured (order ${orderId}).`,
      });
      return NextResponse.redirect(new URL(`/?paid=${orderId}`, req.url));
    }
    return NextResponse.json({ orderId, status: cap.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Capture failed" }, { status: 502 });
  }
}
