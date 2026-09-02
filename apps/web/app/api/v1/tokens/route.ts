import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, isResponse, requireSession } from "@/lib/api";
import { requireRole } from "@/lib/authorization";
import { database, newId } from "@/lib/db";
import { createApiToken, tokenScopes } from "@/lib/tokens";

const tokenSchema = z.object({ name: z.string().trim().min(1).max(100), scopes: z.array(z.enum(tokenScopes)).min(1).max(tokenScopes.length) });

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const tokens = await database()`
    SELECT id, name, token_prefix, scopes, created_at, last_used_at, revoked_at FROM api_tokens
    WHERE organization_id = ${session.organizationId} ORDER BY created_at DESC
  `;
  return NextResponse.json({ tokens });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const denied = await requireRole(session, ["owner", "admin"]);
  if (denied) return denied;
  const parsed = tokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Token name and one or more valid scopes are required.");
  const generated = createApiToken();
  const id = newId();
  await database()`
    INSERT INTO api_tokens (id, organization_id, name, token_prefix, token_hash, scopes)
    VALUES (${id}, ${session.organizationId}, ${parsed.data.name}, ${generated.prefix}, ${generated.hash}, ${parsed.data.scopes})
  `;
  return NextResponse.json({ token: { id, name: parsed.data.name, prefix: generated.prefix, scopes: parsed.data.scopes, value: generated.plaintext } }, { status: 201 });
}
