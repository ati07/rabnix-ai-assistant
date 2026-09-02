"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { businessConfig } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";

const timeTuple = z.tuple([z.string(), z.string()]);

const configSchema = z.object({
  businessType: z.enum([
    "clinic",
    "real_estate",
    "school",
    "shop",
    "restaurant",
    "other",
  ]),
  displayName: z.string().trim().min(1, "Business name is required").max(120),
  timezone: z.string().trim().min(1).max(64),
  persona: z.string().max(4000).optional().default(""),
  hours: z.record(z.string(), z.array(timeTuple)).default({}),
  services: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        description: z.string().max(1000).optional().default(""),
        price: z.string().max(80).optional().default(""),
        duration: z.string().max(80).optional().default(""),
      }),
    )
    .max(100)
    .default([]),
  faqs: z
    .array(
      z.object({
        q: z.string().trim().min(1).max(500),
        a: z.string().trim().min(1).max(2000),
      }),
    )
    .max(200)
    .default([]),
  policies: z.string().max(4000).optional().default(""),
  languages: z.array(z.string().trim().min(1).max(16)).max(20).default(["en"]),
  systemPromptOverride: z.string().max(8000).optional().default(""),
  llmProvider: z.enum(["gemini", "anthropic", "openai"]),
  llmModel: z.string().trim().max(120).optional().default(""),
  autoReplyEnabled: z.boolean(),
  leadCaptureEnabled: z.boolean(),
  leadFollowups: z
    .object({
      enabled: z.boolean(),
      steps: z
        .array(
          z.object({
            afterHours: z.number().min(0).max(8760),
            message: z.string().trim().min(1).max(2000),
          }),
        )
        .max(10)
        .default([]),
    })
    .default({ enabled: false, steps: [] }),
});

export type BusinessConfigInput = z.input<typeof configSchema>;

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Persist the tenant's business configuration. The tenant is derived from the
 * session (never trusted from the client), and the payload is validated before
 * it touches the database.
 */
export async function saveBusinessConfig(
  payload: BusinessConfigInput,
): Promise<SaveResult> {
  const tenant = await requireTenant();

  const parsed = configSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid input" };
  }
  const data = parsed.data;

  await db
    .update(businessConfig)
    .set({
      businessType: data.businessType,
      displayName: data.displayName,
      timezone: data.timezone,
      persona: data.persona || null,
      hours: data.hours,
      services: data.services,
      faqs: data.faqs,
      policies: data.policies || null,
      languages: data.languages.length ? data.languages : ["en"],
      systemPromptOverride: data.systemPromptOverride || null,
      llmProvider: data.llmProvider,
      llmModel: data.llmModel || null,
      autoReplyEnabled: data.autoReplyEnabled,
      leadCaptureEnabled: data.leadCaptureEnabled,
      leadFollowups: data.leadFollowups,
      updatedAt: new Date(),
    })
    .where(eq(businessConfig.tenantId, tenant.id));

  revalidatePath("/dashboard/business");
  revalidatePath("/dashboard");
  return { ok: true };
}
