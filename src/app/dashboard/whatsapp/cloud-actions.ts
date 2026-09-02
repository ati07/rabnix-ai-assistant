"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { whatsappConnections, type CloudApiConfig } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";
import { canUseWhatsApp, WHATSAPP_LOCKED_MESSAGE } from "@/lib/billing/subscription";

export type ActionResult = { ok: true } | { ok: false; error: string };

const configSchema = z.object({
  phoneNumberId: z.string().trim().min(1, "Phone number ID is required."),
  wabaId: z.string().trim().min(1, "WhatsApp Business Account ID is required."),
  verifyToken: z
    .string()
    .trim()
    .min(6, "Use a verify token of at least 6 characters."),
  /** Empty means "keep the existing token" on update. */
  accessToken: z.string().trim().optional().or(z.literal("")),
});

export type CloudApiInput = z.input<typeof configSchema>;

/**
 * Create or update the tenant's Cloud API connection. The access token is
 * encrypted at rest; on update an empty token keeps the stored one.
 */
export async function saveCloudApiConfig(
  payload: CloudApiInput,
): Promise<ActionResult> {
  const tenant = await requireTenant();

  // WhatsApp is Pro-only (and trial). Basic and locked tenants can't connect it.
  if (!(await canUseWhatsApp(tenant.id))) {
    return { ok: false, error: WHATSAPP_LOCKED_MESSAGE };
  }

  if (!isEncryptionConfigured()) {
    return {
      ok: false,
      error: "Server is missing ENCRYPTION_KEY — cannot store the access token securely.",
    };
  }

  const parsed = configSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { phoneNumberId, wabaId, verifyToken, accessToken } = parsed.data;

  const existing = await db.query.whatsappConnections.findFirst({
    where: and(
      eq(whatsappConnections.tenantId, tenant.id),
      eq(whatsappConnections.channelType, "cloud_api"),
    ),
  });

  // Resolve the access token: new one if provided, else reuse the stored cipher.
  let accessTokenCipher: string;
  if (accessToken) {
    accessTokenCipher = encryptSecret(accessToken);
  } else if (existing?.cloudApiConfig?.accessTokenCipher) {
    accessTokenCipher = existing.cloudApiConfig.accessTokenCipher;
  } else {
    return { ok: false, error: "An access token is required." };
  }

  const config: CloudApiConfig = {
    phoneNumberId,
    wabaId,
    verifyToken,
    accessTokenCipher,
  };

  if (existing) {
    await db
      .update(whatsappConnections)
      .set({ cloudApiConfig: config, phoneNumber: phoneNumberId })
      .where(eq(whatsappConnections.id, existing.id));
  } else {
    await db.insert(whatsappConnections).values({
      tenantId: tenant.id,
      channelType: "cloud_api",
      status: "disconnected",
      phoneNumber: phoneNumberId,
      cloudApiConfig: config,
    });
  }

  revalidatePath("/dashboard/whatsapp");
  return { ok: true };
}

/** Remove the tenant's Cloud API connection. */
export async function disconnectCloudApi(): Promise<ActionResult> {
  const tenant = await requireTenant();
  await db
    .delete(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.tenantId, tenant.id),
        eq(whatsappConnections.channelType, "cloud_api"),
      ),
    );
  revalidatePath("/dashboard/whatsapp");
  return { ok: true };
}
