import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "Payment cancelled by the buyer. Nothing was charged." });
}
