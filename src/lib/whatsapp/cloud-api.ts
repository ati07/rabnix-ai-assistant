import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappConnections, type CloudApiConfig } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { InboundWAMessage } from "./channel";

/**
 * Official WhatsApp Cloud API transport.
 *
 * Unlike Baileys, Cloud API has no persistent socket: inbound arrives via Meta
 * webhooks (handled in the app route) and outbound is a stateless Graph call.
 * So this module is a set of pure-ish functions rather than a channel object —
 * it can run in a serverless route handler or in the worker's scheduler.
 */

const GRAPH_BASE = "https://graph.facebook.com";

type ConnectionRow = typeof whatsappConnections.$inferSelect;

/** Load a tenant's Cloud API connection, if configured. */
export async function getCloudConnection(
  tenantId: string,
): Promise<ConnectionRow | null> {
  const row = await db.query.whatsappConnections.findFirst({
    where: and(
      eq(whatsappConnections.tenantId, tenantId),
      eq(whatsappConnections.channelType, "cloud_api"),
    ),
  });
  return row ?? null;
}

/** Find the Cloud API connection whose inbound webhooks target `phoneNumberId`. */
export async function findConnectionByPhoneNumberId(
  phoneNumberId: string,
): Promise<ConnectionRow | null> {
  const row = await db.query.whatsappConnections.findFirst({
    where: and(
      eq(whatsappConnections.channelType, "cloud_api"),
      sql`${whatsappConnections.cloudApiConfig} ->> 'phoneNumberId' = ${phoneNumberId}`,
    ),
  });
  return row ?? null;
}

/** Find the Cloud API connection matching a webhook-verification token. */
export async function findConnectionByVerifyToken(
  verifyToken: string,
): Promise<ConnectionRow | null> {
  const row = await db.query.whatsappConnections.findFirst({
    where: and(
      eq(whatsappConnections.channelType, "cloud_api"),
      sql`${whatsappConnections.cloudApiConfig} ->> 'verifyToken' = ${verifyToken}`,
    ),
  });
  return row ?? null;
}

/** Send a plain-text message via the Graph API using a tenant's config. */
export async function sendCloudApiText(
  config: CloudApiConfig,
  to: string,
  text: string,
): Promise<void> {
  const token = decryptSecret(config.accessTokenCipher);
  const url = `${GRAPH_BASE}/${env.WHATSAPP_API_VERSION}/${config.phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/[^0-9]/g, ""),
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Graph API responded ${res.status}: ${detail.slice(0, 300)}`);
  }
}

/**
 * Send to a tenant by id (used by the reminder scheduler). Throws if the tenant
 * has no Cloud API connection so the caller can retry / mark failed.
 */
export async function sendCloudApiToTenant(
  tenantId: string,
  to: string,
  text: string,
): Promise<void> {
  const conn = await getCloudConnection(tenantId);
  if (!conn?.cloudApiConfig) {
    throw new Error(`tenant ${tenantId} has no Cloud API connection`);
  }
  await sendCloudApiText(conn.cloudApiConfig, to, text);
}

// ── Webhook parsing ─────────────────────────────────────────────────────────

/** A parsed webhook change: which number it targeted + its text messages. */
export interface ParsedWebhookChange {
  phoneNumberId: string;
  messages: InboundWAMessage[];
}

/**
 * Extract inbound text messages from a Cloud API webhook body. Ignores status
 * receipts, non-text types, and malformed shapes. Groups by phone_number_id so
 * the caller can resolve the owning tenant.
 */
export function parseWebhookChanges(body: unknown): ParsedWebhookChange[] {
  const out: ParsedWebhookChange[] = [];
  const entries = (body as WebhookBody | undefined)?.entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId || !Array.isArray(value?.messages)) continue;

      // Map wa_id → profile name for pushName enrichment.
      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);
      }

      const messages: InboundWAMessage[] = [];
      for (const m of value.messages ?? []) {
        if (m.type !== "text" || !m.text?.body?.trim()) continue;
        messages.push({
          from: m.from,
          text: m.text.body.trim(),
          pushName: names.get(m.from),
          externalId: m.id,
        });
      }
      if (messages.length > 0) out.push({ phoneNumberId, messages });
    }
  }
  return out;
}

/**
 * Verify a webhook's `X-Hub-Signature-256` against META_APP_SECRET.
 *
 * Fail-open only in non-production (so local dev works without the secret). In
 * production a missing secret or signature is rejected — otherwise anyone who
 * knows the public webhook URL could inject fake inbound messages (LLM cost,
 * spam conversations, bogus bookings). `env.ts` already refuses to boot in
 * production without META_APP_SECRET, so the fail-open branch is dev-only.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!env.META_APP_SECRET) {
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", env.META_APP_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── Webhook payload shapes (only the fields we read) ─────────────────────────

interface WebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          from: string;
          id: string;
          type: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}
