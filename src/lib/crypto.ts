import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { env } from "@/lib/env";

/**
 * Symmetric encryption for secrets stored at rest (e.g. tenant WhatsApp Cloud
 * API access tokens). AES-256-GCM with a key derived from `ENCRYPTION_KEY`.
 *
 * Output format: `v1:<iv>:<authTag>:<ciphertext>` (each part base64). The
 * version prefix leaves room to rotate the scheme later.
 */

const SCHEME = "v1";
const IV_BYTES = 12; // GCM standard nonce length
const STATIC_SALT = "rabnix-secret-box:v1";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (!env.ENCRYPTION_KEY) {
    throw new Error(
      "ENCRYPTION_KEY is not set — cannot encrypt/decrypt stored secrets.",
    );
  }
  if (!cachedKey) {
    cachedKey = scryptSync(env.ENCRYPTION_KEY, STATIC_SALT, 32);
  }
  return cachedKey;
}

/** Encrypt a UTF-8 string. Returns an opaque, self-describing token. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    SCHEME,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

/** Decrypt a token produced by {@link encryptSecret}. Throws if tampered. */
export function decryptSecret(token: string): string {
  const [scheme, ivB64, tagB64, ctB64] = token.split(":");
  if (scheme !== SCHEME || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Malformed ciphertext.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Whether secret encryption is available (used to gate Cloud API setup). */
export function isEncryptionConfigured(): boolean {
  return Boolean(env.ENCRYPTION_KEY);
}
