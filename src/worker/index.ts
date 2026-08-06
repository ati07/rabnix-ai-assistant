import "dotenv/config";
import qrcode from "qrcode-terminal";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, whatsappConnections } from "@/lib/db/schema";
import { handleIncomingMessage } from "@/lib/ai/brain";
import { BaileysChannel } from "@/lib/whatsapp/baileys-channel";
import type { Tenant } from "@/lib/tenant";

/**
 * Standalone WhatsApp worker (the second deployable).
 *
 * Baileys needs a long-lived socket + session state, which can't live in
 * serverless route handlers — so this process holds one Baileys connection per
 * tenant, routes inbound messages through the channel-agnostic brain, and sends
 * the AI's reply back over WhatsApp. It shares the same Postgres as the app.
 *
 * Run with:  npm run worker
 */

const POLL_INTERVAL_MS = 30_000;

/** tenantId → running channel. */
const channels = new Map<string, BaileysChannel>();

async function main() {
  console.log("[worker] starting WhatsApp worker…");

  await syncTenants();
  const timer = setInterval(() => {
    void syncTenants();
  }, POLL_INTERVAL_MS);

  const shutdown = async () => {
    console.log("\n[worker] shutting down…");
    clearInterval(timer);
    await Promise.all([...channels.values()].map((c) => c.stop()));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(
    "[worker] ready. Waiting for tenants — create a workspace in the app if you haven't.",
  );
}

/** Start channels for any tenants we aren't already running. */
async function syncTenants() {
  const rows = await db.select().from(tenants);
  for (const tenant of rows) {
    if (!channels.has(tenant.id)) {
      try {
        await startTenant(tenant);
      } catch (err) {
        console.error(`[worker] failed to start tenant ${tenant.slug}:`, err);
      }
    }
  }
}

async function startTenant(tenant: Tenant) {
  const connectionId = await ensureConnection(tenant.id);

  const channel = new BaileysChannel({
    tenantId: tenant.id,
    connectionId,
    handlers: {
      onMessage: async (msg) => {
        console.log(`[${tenant.slug}] ← ${msg.from}: ${msg.text}`);
        const result = await handleIncomingMessage(tenant, {
          from: msg.from,
          text: msg.text,
          channel: "baileys",
          customerName: msg.pushName,
          externalId: msg.externalId,
        });
        if (result.reply) {
          await channel.sendText(msg.from, result.reply);
          console.log(`[${tenant.slug}] → ${msg.from}: ${result.reply}`);
        }
      },
      onQR: (qr) => {
        console.log(
          `\n[${tenant.slug}] Scan this QR in WhatsApp → Linked devices:\n`,
        );
        qrcode.generate(qr, { small: true });
      },
      onStatus: (status) => {
        console.log(`[${tenant.slug}] connection: ${status}`);
      },
    },
  });

  channels.set(tenant.id, channel);
  await channel.start();
}

/** Find or create this tenant's Baileys connection row; return its id. */
async function ensureConnection(tenantId: string): Promise<string> {
  const existing = await db.query.whatsappConnections.findFirst({
    where: and(
      eq(whatsappConnections.tenantId, tenantId),
      eq(whatsappConnections.channelType, "baileys"),
    ),
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(whatsappConnections)
    .values({ tenantId, channelType: "baileys", status: "disconnected" })
    .returning({ id: whatsappConnections.id });
  return created.id;
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
