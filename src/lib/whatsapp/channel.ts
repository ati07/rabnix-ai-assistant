/**
 * Channel abstraction for WhatsApp.
 *
 * The brain is channel-agnostic; this interface is the seam that lets the
 * unofficial Baileys transport (now) and the official Cloud API (later) be used
 * interchangeably. A channel owns one tenant's connection: it emits inbound
 * customer messages and can send text replies.
 */

export interface InboundWAMessage {
  /** Customer WhatsApp number in E.164 (digits only, no `@s.whatsapp.net`). */
  from: string;
  /** Plain text body of the message. */
  text: string;
  /** WhatsApp push name (display name), if provided. */
  pushName?: string;
  /** Provider message id (wamid / Baileys key id) for dedup/receipts. */
  externalId?: string;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "needs_qr"
  | "connected"
  | "error";

export interface ChannelHandlers {
  /** Called for each inbound customer message. */
  onMessage: (msg: InboundWAMessage) => Promise<void> | void;
  /** Called when the connection status changes (for dashboard/state). */
  onStatus?: (status: ConnectionStatus) => Promise<void> | void;
  /** Called with a QR string that the user must scan to link the account. */
  onQR?: (qr: string) => Promise<void> | void;
}

export interface WhatsAppChannel {
  readonly tenantId: string;
  /** Open the connection (may surface a QR via `onQR`). */
  start(): Promise<void>;
  /** Close the connection without logging out. */
  stop(): Promise<void>;
  /** Send a text message to a customer (E.164, digits only). */
  sendText(to: string, text: string): Promise<void>;
}
