import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type EncryptedValue = { ciphertext: string; iv: string; tag: string; version: 1 };

function key(): Buffer {
  const value = process.env.ENCRYPTION_KEY;
  if (!value) throw new Error("ENCRYPTION_KEY is required.");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32) throw new Error("ENCRYPTION_KEY must contain 32 bytes encoded with base64.");
  return decoded;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const value: EncryptedValue = { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), version: 1 };
  return JSON.stringify(value);
}

export function decrypt(serialized: string): string {
  const value = JSON.parse(serialized) as Partial<EncryptedValue>;
  if (value.version !== 1) throw new Error("Encrypted value version is not supported.");
  if (typeof value.iv !== "string" || typeof value.tag !== "string" || typeof value.ciphertext !== "string") {
    throw new Error("Encrypted value is invalid.");
  }
  const iv = Buffer.from(value.iv, "base64");
  const tag = Buffer.from(value.tag, "base64");
  const ciphertext = Buffer.from(value.ciphertext, "base64");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Encrypted value parameters are invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
