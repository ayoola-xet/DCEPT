import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { badRequest, isResponse, requireSession } from "@/lib/api";
import { requireRole } from "@/lib/authorization";
import { encrypt } from "@/lib/crypto";
import { database, newId } from "@/lib/db";

const targetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  endpointUrl: z.url({ protocol: /^https?:$/ }),
  headers: z.record(z.string().max(200), z.string().max(4_000)).default({}),
});

export async function GET() {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const sql = database();
  const targets = await sql`
    SELECT id, name, created_at FROM targets WHERE organization_id = ${session.organizationId} ORDER BY created_at DESC
  `;
  return NextResponse.json({ targets });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (isResponse(session)) return session;
  const denied = await requireRole(session, ["owner", "admin", "member"]);
  if (denied) return denied;
  const parsed = targetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("Target name, HTTPS endpoint URL, and string headers are required.");

  const id = newId();
  const sql = database();
  try {
    await sql`
      INSERT INTO targets (id, organization_id, name, endpoint_ciphertext, headers_ciphertext)
      VALUES (${id}, ${session.organizationId}, ${parsed.data.name}, ${encrypt(parsed.data.endpointUrl)}, ${encrypt(JSON.stringify(parsed.data.headers))})
    `;
    await sql`
      INSERT INTO audit_events (id, organization_id, user_id, event_type, metadata)
      VALUES (${newId()}, ${session.organizationId}, ${session.userId}, 'target.created', ${JSON.stringify({ targetId: id, name: parsed.data.name })}::jsonb)
    `;
    return NextResponse.json({ target: { id, name: parsed.data.name } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Target name already exists or could not be saved." }, { status: 409 });
  }
}
