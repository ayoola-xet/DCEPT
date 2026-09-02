import { NextResponse } from "next/server";

import { database } from "./db";
import type { Identity } from "./api";
import type { TokenScope } from "./tokens";

type Role = "owner" | "admin" | "member" | "viewer";

export async function requireRole(session: Identity, allowed: Role[]): Promise<NextResponse | null> {
  if ("tokenScopes" in session) return NextResponse.json({ error: "API tokens cannot manage organization membership or API tokens." }, { status: 403 });
  const rows = await database()`
    SELECT role FROM memberships WHERE organization_id = ${session.organizationId} AND user_id = ${session.userId} LIMIT 1
  `;
  const role = rows[0]?.role as Role | undefined;
  if (!role) return NextResponse.json({ error: "Organization access was removed." }, { status: 403 });
  if (!allowed.includes(role)) return NextResponse.json({ error: "This role cannot change organization data." }, { status: 403 });
  return null;
}

export async function requireAccess(session: Identity, scope: TokenScope, allowedRoles: Role[]): Promise<NextResponse | null> {
  if ("tokenScopes" in session) {
    return session.tokenScopes.includes(scope) ? null : NextResponse.json({ error: "API token does not have the required scope." }, { status: 403 });
  }
  return requireRole(session, allowedRoles);
}
