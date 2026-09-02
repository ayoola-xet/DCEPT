import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const nonceCookie = "glamprobe_nonce";

export async function POST() {
  const nonce = randomBytes(16).toString("hex");
  (await cookies()).set(nonceCookie, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 300,
  });
  return Response.json({ nonce });
}

export { nonceCookie };
