import { NextResponse } from "next/server";

import { database } from "./db";
import type { Session } from "./session";

type Role = "owner" | "admin" | "member" | "viewer";

export async function requireRole(session: Session, allowed: Role[]): Promise<NextResponse | null> {
  const rows = await database()`
    SELECT role FROM memberships WHERE organization_id = ${session.organizationId} AND user_id = ${session.userId} LIMIT 1
  `;
  const role = rows[0]?.role as Role | undefined;
  if (!role) return NextResponse.json({ error: "Organization access was removed." }, { status: 403 });
  if (!allowed.includes(role)) return NextResponse.json({ error: "This role cannot change organization data." }, { status: 403 });
  return null;
}
