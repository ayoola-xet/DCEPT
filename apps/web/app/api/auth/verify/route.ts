import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { z } from "zod";

import { database, newId } from "@/lib/db";
import { createSession, sessionCookie } from "@/lib/session";

const bodySchema = z.object({ message: z.string().min(1), signature: z.string().min(1) });
const nonceCookie = "dcept_nonce";

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message and signature are required." }, { status: 400 });
  const nonce = (await cookies()).get(nonceCookie)?.value;
  if (!nonce) return NextResponse.json({ error: "The wallet sign-in request expired. Try again." }, { status: 401 });

  try {
    const message = new SiweMessage(parsed.data.message);
    const result = await message.verify({ signature: parsed.data.signature, nonce, domain: request.nextUrl.host });
    if (!result.success) return NextResponse.json({ error: "Wallet signature is invalid." }, { status: 401 });

    const walletAddress = message.address.toLowerCase();
    const sql = database();
    const existing = await sql`SELECT id FROM users WHERE wallet_address = ${walletAddress} LIMIT 1`;
    const userId = existing[0]?.id as string | undefined ?? newId();
    if (!existing[0]) await sql`INSERT INTO users (id, wallet_address) VALUES (${userId}, ${walletAddress})`;

    const membership = await sql`
      SELECT organization_id FROM memberships WHERE user_id = ${userId} ORDER BY created_at ASC LIMIT 1
    `;
    let organizationId = membership[0]?.organization_id as string | undefined;
    if (!organizationId) {
      organizationId = newId();
      const slug = `wallet-${walletAddress.slice(2, 10)}`;
      await sql`INSERT INTO organizations (id, name, slug) VALUES (${organizationId}, ${"Personal workspace"}, ${slug})`;
      await sql`INSERT INTO memberships (organization_id, user_id, role) VALUES (${organizationId}, ${userId}, 'owner')`;
    }

    const token = await createSession({ userId, organizationId, walletAddress });
    const response = NextResponse.json({ organizationId, walletAddress });
    response.cookies.set(sessionCookie.name, token, sessionCookie.options);
    response.cookies.delete(nonceCookie);
    return response;
  } catch {
    return NextResponse.json({ error: "Wallet sign-in failed." }, { status: 401 });
  }
}
