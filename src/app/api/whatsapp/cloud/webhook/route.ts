import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, whatsappConnections } from "@/lib/db/schema";
import { handleIncomingMessage } from "@/lib/ai/brain";
import {
  findConnectionByPhoneNumberId,
  findConnectionByVerifyToken,
  parseWebhookChanges,
  sendCloudApiText,
  verifyWebhookSignature,
} from "@/lib/whatsapp/cloud-api";

export const runtime = "nodejs";

/**
 * WhatsApp Cloud API webhook (public — Meta calls this).
 *
 * GET  — verification handshake. Echoes `hub.challenge` when `hub.verify_token`
 *        matches a tenant's configured token (per-tenant tokens on one URL).
 * POST — inbound messages. Verifies the signature, routes each message to the
 *        owning tenant by phone_number_id, runs the brain, and replies.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new Response("Bad Request", { status: 400 });
  }

  const conn = await findConnectionByVerifyToken(token);
  if (!conn) return new Response("Forbidden", { status: 403 });

  await db
    .update(whatsappConnections)
    .set({ status: "connected", lastConnectedAt: new Date() })
    .where(eq(whatsappConnections.id, conn.id));

  return new Response(challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

export async function POST(req: Request) {
  const raw = await req.text();

  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // Always ack 200 so Meta doesn't retry; process best-effort and log failures.
  try {
    for (const change of parseWebhookChanges(body)) {
      const conn = await findConnectionByPhoneNumberId(change.phoneNumberId);
      if (!conn?.cloudApiConfig) continue;

      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, conn.tenantId),
      });
      if (!tenant) continue;

      for (const msg of change.messages) {
        try {
          const result = await handleIncomingMessage(tenant, {
            from: msg.from,
            text: msg.text,
            channel: "cloud_api",
            customerName: msg.pushName,
            externalId: msg.externalId,
          });
          if (result.reply) {
            await sendCloudApiText(conn.cloudApiConfig, msg.from, result.reply);
          }
        } catch (err) {
          console.error("[cloud-webhook] message handling failed:", err);
        }
      }
    }
  } catch (err) {
    console.error("[cloud-webhook] processing failed:", err);
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}
