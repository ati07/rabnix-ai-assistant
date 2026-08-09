import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { webChatConfigs } from "@/lib/db/schema";

export type WebChatConfig = typeof webChatConfigs.$inferSelect;

/**
 * Web chat widget config helpers.
 *
 * The widget is a `web` channel resolved by a per-tenant, rotatable `publicKey`
 * (never the tenant UUID) so internal ids never leak into customer sites. All
 * public `/api/chat/[key]` routes look the tenant up via {@link findByPublicKey};
 * the dashboard uses {@link getOrCreateForTenant} / {@link updateWebChatConfig}.
 */

/** Generate a fresh, URL-safe public key (non-secret, but unguessable). */
function generatePublicKey(): string {
  // 24 bytes → 48 hex chars. Prefixed so keys are recognisable in logs/snippets.
  return `wc_${randomBytes(24).toString("hex")}`;
}

/** Resolve a tenant's web chat config by its public key (or null). */
export async function findByPublicKey(
  publicKey: string,
): Promise<WebChatConfig | null> {
  if (!publicKey) return null;
  const row = await db.query.webChatConfigs.findFirst({
    where: eq(webChatConfigs.publicKey, publicKey),
  });
  return row ?? null;
}

/**
 * Return the tenant's web chat config, lazily creating a row (disabled, with a
 * fresh public key) on first access. Idempotent under the unique tenant index.
 */
export async function getOrCreateForTenant(
  tenantId: string,
): Promise<WebChatConfig> {
  const existing = await db.query.webChatConfigs.findFirst({
    where: eq(webChatConfigs.tenantId, tenantId),
  });
  if (existing) return existing;

  await db
    .insert(webChatConfigs)
    .values({ tenantId, publicKey: generatePublicKey() })
    .onConflictDoNothing();

  const row = await db.query.webChatConfigs.findFirst({
    where: eq(webChatConfigs.tenantId, tenantId),
  });
  if (!row) throw new Error("Failed to create web chat config.");
  return row;
}

export type WebChatConfigUpdate = {
  enabled: boolean;
  greeting: string;
  themeColor: string;
  launcherLabel: string;
  allowedOrigins: string[];
};

/** Update the tenant's widget settings. Ensures a row exists first. */
export async function updateWebChatConfig(
  tenantId: string,
  patch: WebChatConfigUpdate,
): Promise<WebChatConfig> {
  await getOrCreateForTenant(tenantId);

  const [row] = await db
    .update(webChatConfigs)
    .set({
      enabled: patch.enabled,
      greeting: patch.greeting,
      themeColor: patch.themeColor,
      launcherLabel: patch.launcherLabel,
      allowedOrigins: patch.allowedOrigins,
      updatedAt: new Date(),
    })
    .where(eq(webChatConfigs.tenantId, tenantId))
    .returning();

  return row;
}

/** Rotate the public key, invalidating any previously-embedded snippet. */
export async function rotatePublicKey(tenantId: string): Promise<WebChatConfig> {
  await getOrCreateForTenant(tenantId);

  const [row] = await db
    .update(webChatConfigs)
    .set({ publicKey: generatePublicKey(), updatedAt: new Date() })
    .where(eq(webChatConfigs.tenantId, tenantId))
    .returning();

  return row;
}

/**
 * Check a request Origin against the config's allow-list.
 * Empty allow-list = allow any embedding site (the default).
 */
export function isOriginAllowed(
  config: Pick<WebChatConfig, "allowedOrigins">,
  origin: string | null,
): boolean {
  if (!config.allowedOrigins.length) return true;
  if (!origin) return false;
  return config.allowedOrigins.includes(origin);
}
