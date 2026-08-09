import { readFileSync } from "node:fs";
import { createDecipheriv, scryptSync } from "node:crypto";

/**
 * Shared helpers for the WhatsApp Cloud API diagnostic scripts.
 *
 * These scripts talk to Meta's Graph API and the local Postgres DB to debug the
 * Cloud API bring-up. They read `.env` at the repo root directly (so they run
 * without the app's build), decrypt the stored access token IN MEMORY, and
 * **never print secret values**. Keep that contract.
 *
 * Run from the repo root, e.g.:  node scripts/whatsapp-diagnostics/health.mjs
 */

/** Parse the repo-root .env into a plain object (skips comments/blank lines). */
export function loadEnv(path = "./.env") {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
}

/**
 * Decrypt a `v1:<iv>:<tag>:<ct>` token produced by src/lib/crypto.ts
 * (AES-256-GCM, scrypt key from ENCRYPTION_KEY + static salt).
 */
export function decryptToken(token, keyStr) {
  const [, iv, tag, ct] = token.split(":");
  const key = scryptSync(keyStr, "rabnix-secret-box:v1", 32);
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

/**
 * Load the single Cloud API connection + decrypted token from the DB.
 * Returns { sql, cfg, token, base } — caller must `await sql.end()` when done.
 */
export async function loadCloudApiContext() {
  const env = loadEnv();
  const { default: postgres } = await import("postgres");
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const ver = env.WHATSAPP_API_VERSION || "v21.0";
  const [row] = await sql`
    select cloud_api_config as cfg from whatsapp_connections
    where channel_type = 'cloud_api' limit 1`;
  if (!row) {
    await sql.end();
    throw new Error("No cloud_api connection found in whatsapp_connections.");
  }
  const cfg = row.cfg;
  const token = decryptToken(cfg.accessTokenCipher, env.ENCRYPTION_KEY);
  return { sql, cfg, token, base: `https://graph.facebook.com/${ver}` };
}
