import { createHash, randomBytes } from "node:crypto";

export const tokenScopes = ["runs:read", "runs:write", "scenarios:read", "scenarios:write", "targets:read", "targets:write"] as const;
export type TokenScope = typeof tokenScopes[number];

export function createApiToken(): { plaintext: string; prefix: string; hash: string } {
  const plaintext = `gp_${randomBytes(32).toString("base64url")}`;
  return { plaintext, prefix: plaintext.slice(0, 12), hash: tokenHash(plaintext) };
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
