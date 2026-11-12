import { NextResponse } from "next/server";
import { store, mandate, DEFAULT_MANDATE } from "../../../lib/interlock/state";

export async function POST() {
  store.spentCents = 0;
  store.pending.clear();
  store.audit.length = 0;
  Object.assign(mandate, DEFAULT_MANDATE, { allowedCategories: [...DEFAULT_MANDATE.allowedCategories] });
  return NextResponse.json({ ok: true });
}
