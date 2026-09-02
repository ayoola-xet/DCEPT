import { neon } from "@neondatabase/serverless";

export function database() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }
  return neon(connectionString);
}

export function newId(): string {
  return crypto.randomUUID();
}
