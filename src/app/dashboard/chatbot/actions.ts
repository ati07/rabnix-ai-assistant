"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/tenant";
import {
  rotatePublicKey,
  updateWebChatConfig,
} from "@/lib/chat/web-config";

const settingsSchema = z.object({
  enabled: z.boolean(),
  greeting: z.string().trim().min(1, "Greeting is required").max(500),
  themeColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #4f46e5"),
  launcherLabel: z.string().trim().min(1, "Label is required").max(60),
  allowedOrigins: z
    .array(z.string().trim().url("Each origin must be a URL").max(200))
    .max(20)
    .default([]),
});

export type WebChatSettingsInput = z.input<typeof settingsSchema>;

export type ActionResult =
  | { ok: true; publicKey?: string }
  | { ok: false; error: string };

/**
 * Persist the tenant's web chat widget settings. Tenant is derived from the
 * session (never trusted from the client); input is validated before it hits
 * the database. Origins are normalised to bare origins (scheme + host + port).
 */
export async function saveWebChatConfig(
  payload: WebChatSettingsInput,
): Promise<ActionResult> {
  const tenant = await requireTenant();

  const parsed = settingsSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid input",
    };
  }
  const data = parsed.data;

  const origins = Array.from(
    new Set(data.allowedOrigins.map((o) => new URL(o).origin)),
  );

  await updateWebChatConfig(tenant.id, {
    enabled: data.enabled,
    greeting: data.greeting,
    themeColor: data.themeColor,
    launcherLabel: data.launcherLabel,
    allowedOrigins: origins,
  });

  revalidatePath("/dashboard/chatbot");
  return { ok: true };
}

/** Rotate the widget's public key. Any previously-embedded snippet stops working. */
export async function rotateWebChatKey(): Promise<ActionResult> {
  const tenant = await requireTenant();
  const row = await rotatePublicKey(tenant.id);
  revalidatePath("/dashboard/chatbot");
  return { ok: true, publicKey: row.publicKey };
}
