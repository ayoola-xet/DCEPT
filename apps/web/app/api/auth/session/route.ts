import { NextResponse } from "next/server";

import { currentSession } from "@/lib/session";

export async function GET() {
  const session = await currentSession();
  return NextResponse.json({ session });
}
