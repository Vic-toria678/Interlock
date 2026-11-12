import { NextResponse } from "next/server";
import { mandate } from "../../../lib/interlock/state";

export async function GET() {
  return NextResponse.json({ mandate });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ok = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000000;
  if (!ok(b.perOrderCapCents) || !ok(b.weeklyCapCents) || !ok(b.approvalAboveCents)) {
    return NextResponse.json({ error: "Invalid amounts" }, { status: 400 });
  }
  const cats = Array.isArray(b.allowedCategories)
    ? (b.allowedCategories as unknown[]).filter((c): c is string => typeof c === "string")
    : [];
  mandate.perOrderCapCents = b.perOrderCapCents as number;
  mandate.weeklyCapCents = b.weeklyCapCents as number;
  mandate.approvalAboveCents = b.approvalAboveCents as number;
  mandate.allowedCategories = cats;
  return NextResponse.json({ mandate });
}
