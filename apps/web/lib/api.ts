import { NextResponse } from "next/server";

import { currentSession, type Session } from "./session";

export async function requireSession(): Promise<Session | NextResponse> {
  const session = await currentSession();
  return session ?? NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}
