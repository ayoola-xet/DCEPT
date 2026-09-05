import assert from "node:assert/strict";
import test from "node:test";

import { decrypt, encrypt } from "./crypto.ts";
import { resolveTargetRequestUrl } from "./public-run.ts";
import { validateTargetUrl } from "./target-url.ts";

test("hosted target validation rejects non-public addresses", () => {
  for (const endpoint of [
    "http://example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://169.254.169.254",
    "https://[::1]",
    "https://[fc00::1]",
    "https://[::ffff:127.0.0.1]",
  ]) {
    assert.notEqual(validateTargetUrl(endpoint), null, endpoint);
  }
  assert.equal(validateTargetUrl("https://8.8.8.8/rpc"), null);
});

test("HTTP action paths cannot change the target host", () => {
  assert.equal(
    resolveTargetRequestUrl("/status", "https://rpc.example/base").href,
    "https://rpc.example/status",
  );
  assert.throws(
    () => resolveTargetRequestUrl("//attacker.example/path", "https://rpc.example"),
    /cannot change the target host/,
  );
  assert.throws(
    () => resolveTargetRequestUrl("/\\attacker.example/path", "https://rpc.example"),
    /cannot change the target host/,
  );
});

test("encrypted target values require a complete AES-GCM tag", () => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const encrypted = encrypt("target credential");
  assert.equal(decrypt(encrypted), "target credential");

  const value = JSON.parse(encrypted) as { tag: string };
  value.tag = Buffer.from(value.tag, "base64").subarray(0, 8).toString("base64");
  assert.throws(() => decrypt(JSON.stringify(value)), /parameters are invalid/);
});
