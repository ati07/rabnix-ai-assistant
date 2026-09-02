import { createHash, randomBytes } from "node:crypto";

/**
 * Opaque token helpers shared by auth sessions, password resets, and team
 * invites. We hand out a high-entropy random token and only ever persist its
 * SHA-256 hash, so a database leak can't be replayed against the app.
 */

/** A URL-safe 256-bit random token (the secret to hand to the user). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Deterministic SHA-256 hash (hex) used as the stored/lookup key for a token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
