import { NextResponse } from "next/server";

import { database } from "./db";
import { currentSession, type Session } from "./session";
import { tokenHash, type TokenScope } from "./tokens";

export type Identity = Session | { organizationId: string; userId: null; walletAddress: null; tokenScopes: TokenScope[]; tokenId: string };

export async function requireSession(request?: Request): Promise<Identity | NextResponse> {
  const authorization = request?.headers.get("authorization");
  if (authorization?.startsWith("Bearer gp_")) {
    const token = authorization.slice("Bearer ".length);
    const rows = await database()`
      SELECT id, organization_id, scopes FROM api_tokens WHERE token_hash = ${tokenHash(token)} AND revoked_at IS NULL LIMIT 1
    `;
    if (!rows[0]) return NextResponse.json({ error: "Invalid API token." }, { status: 401 });
    await database()`UPDATE api_tokens SET last_used_at = NOW() WHERE id = ${rows[0].id as string}`;
    return { tokenId: rows[0].id as string, organizationId: rows[0].organization_id as string, userId: null, walletAddress: null, tokenScopes: rows[0].scopes as TokenScope[] };
  }
  const session = await currentSession();
  return session ?? NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function hasScope(identity: Identity, scope: TokenScope): boolean {
  return !("tokenScopes" in identity) || identity.tokenScopes.includes(scope);
}
