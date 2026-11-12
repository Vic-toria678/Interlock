import { NextResponse } from "next/server";
import { store } from "../../../lib/interlock/state";

export async function GET() {
  return NextResponse.json({ spentCents: store.spentCents, audit: store.audit });
}
