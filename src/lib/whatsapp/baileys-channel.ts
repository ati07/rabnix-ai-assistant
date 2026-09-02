import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  type WAMessage,
  type WASocket,
} from "baileys";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappConnections } from "@/lib/db/schema";
import { createDbAuthState } from "./db-auth-state";
import { silentLogger } from "./logger";
import type {
  ChannelHandlers,
  ConnectionStatus,
  InboundWAMessage,
  WhatsAppChannel,
} from "./channel";

/**
 * Unofficial WhatsApp transport via Baileys.
 *
 * One instance owns one tenant's socket. It persists auth to Postgres, emits a
 * QR string on first link, auto-reconnects on transient drops, and routes
 * inbound text messages to the supplied `onMessage` handler.
 */
export class BaileysChannel implements WhatsAppChannel {
  readonly tenantId: string;
  private readonly connectionId: string;
  private readonly handlers: ChannelHandlers;
  private sock: WASocket | null = null;
  private stopped = false;

  constructor(opts: {
    tenantId: string;
    connectionId: string;
    handlers: ChannelHandlers;
  }) {
    this.tenantId = opts.tenantId;
    this.connectionId = opts.connectionId;
    this.handlers = opts.handlers;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.setStatus("connecting");

    const { state, saveCreds, clear } = await createDbAuthState(this.connectionId);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: silentLogger,
      // We render the QR ourselves via the connection.update event.
      printQRInTerminal: false,
      markOnlineOnConnect: false,
    });
    this.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Persist the QR so the dashboard can render it in-browser.
        await db
          .update(whatsappConnections)
          .set({ status: "needs_qr", qrCode: qr })
          .where(eq(whatsappConnections.id, this.connectionId));
        await this.handlers.onStatus?.("needs_qr");
        await this.handlers.onQR?.(qr);
      }

      if (connection === "open") {
        await this.onOpen();
      } else if (connection === "close") {
        await this.onClose(lastDisconnect?.error, clear);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const m of messages) {
        const inbound = extractInbound(m);
        if (inbound) {
          try {
            await this.handlers.onMessage(inbound);
          } catch (err) {
            console.error(
              `[baileys] onMessage failed for tenant ${this.tenantId}:`,
              err,
            );
          }
        }
      }
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    try {
      this.sock?.end(undefined);
    } catch {
      // best-effort close
    }
    this.sock = null;
  }

  async sendText(to: string, text: string): Promise<void> {
    if (!this.sock) throw new Error("Channel is not connected.");
    await this.sock.sendMessage(toJid(to), { text });
  }

  private async onOpen() {
    await db
      .update(whatsappConnections)
      .set({
        status: "connected",
        qrCode: null,
        phoneNumber: this.sock?.user?.id?.split(":")[0],
        displayName: this.sock?.user?.name,
        lastConnectedAt: new Date(),
      })
      .where(eq(whatsappConnections.id, this.connectionId));
    await this.handlers.onStatus?.("connected");
  }

  private async onClose(error: unknown, clear: () => Promise<void>) {
    // Baileys wraps the reason in a Boom error: `error.output.statusCode`.
    const statusCode = (
      error as { output?: { statusCode?: number } } | undefined
    )?.output?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;

    if (loggedOut) {
      // Session is dead — wipe creds so the next start shows a fresh QR.
      await clear();
      await db
        .update(whatsappConnections)
        .set({ status: "disconnected", qrCode: null })
        .where(eq(whatsappConnections.id, this.connectionId));
      await this.handlers.onStatus?.("disconnected");
      return;
    }

    await this.setStatus("connecting");
    if (!this.stopped) {
      // Transient drop — reconnect with the stored session.
      setTimeout(() => {
        if (!this.stopped) void this.start();
      }, 2000);
    }
  }

  private async setStatus(status: ConnectionStatus) {
    await db
      .update(whatsappConnections)
      .set({ status })
      .where(eq(whatsappConnections.id, this.connectionId));
    await this.handlers.onStatus?.(status);
  }
}

/** Extract a plain-text inbound message, or null for non-text/irrelevant ones. */
function extractInbound(m: WAMessage): InboundWAMessage | null {
  const jid = m.key.remoteJid;
  if (!jid || m.key.fromMe) return null;
  // Ignore groups, newsletters, and status broadcasts — DMs only.
  if (
    jid.endsWith("@g.us") ||
    jid.endsWith("@newsletter") ||
    jid === "status@broadcast"
  ) {
    return null;
  }

  const msg = m.message;
  if (!msg) return null;

  const text =
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption;

  if (!text || !text.trim()) return null;

  return {
    from: numberFromJid(jid),
    text: text.trim(),
    pushName: m.pushName ?? undefined,
    externalId: m.key.id ?? undefined,
  };
}

function numberFromJid(jid: string): string {
  return jid.split("@")[0].split(":")[0];
}

function toJid(number: string): string {
  const clean = number.replace(/[^0-9]/g, "");
  return `${clean}@s.whatsapp.net`;
}
