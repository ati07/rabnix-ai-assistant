import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { reminders } from "@/lib/db/schema";

/**
 * Sends a WhatsApp message on behalf of a tenant. Supplied by the worker, which
 * owns the live Baileys sockets — keeps this scheduler channel-agnostic and
 * testable. Should throw if the tenant has no connected channel (the reminder
 * is then left pending and retried on the next tick).
 */
export type WhatsAppSender = (
  tenantId: string,
  to: string,
  message: string,
) => Promise<void>;

/**
 * Sends a transactional email. Supplied by the worker when an email provider is
 * configured; when omitted, email reminders are marked `failed` rather than
 * retried. Should throw on delivery failure so transient errors are retried.
 */
export type EmailSender = (msg: {
  to: string;
  subject: string;
  message: string;
}) => Promise<void>;

/** How many due reminders to process per tick. */
const BATCH = 50;

export interface DispatchResult {
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Deliver every reminder that is `pending` and due (`sendAt <= now`).
 *
 * - `whatsapp`: sent via the injected {@link WhatsAppSender}. Transient failures
 *   (no connected socket yet) leave the row pending so it retries next tick;
 *   malformed payloads are marked `failed`.
 * - `email`: sent via the injected {@link EmailSender} when supplied. Transient
 *   failures retry next tick; malformed payloads are marked `failed`. When no
 *   sender is supplied (no provider configured) the row is marked `failed` so
 *   it is visible rather than silently dropped.
 *
 * Safe to call on an interval; it only touches due rows and flips their status.
 */
export async function dispatchDueReminders(
  sendWhatsApp: WhatsAppSender,
  sendEmail?: EmailSender,
): Promise<DispatchResult> {
  const now = new Date();
  const due = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.status, "pending"), lte(reminders.sendAt, now)))
    .orderBy(asc(reminders.sendAt))
    .limit(BATCH);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of due) {
    const payload = (r.payload ?? {}) as {
      to?: string;
      subject?: string;
      message?: string;
    };
    const to = payload.to?.trim();
    const message = payload.message?.trim();

    if (r.channel === "email") {
      if (!sendEmail) {
        await markFailed(r.id, "email delivery not configured");
        failed++;
        continue;
      }
      if (!to || !message) {
        await markFailed(r.id, "missing recipient or message");
        failed++;
        continue;
      }
      try {
        await sendEmail({
          to,
          subject: payload.subject?.trim() || "Notification",
          message,
        });
        await db
          .update(reminders)
          .set({ status: "sent", sentAt: new Date() })
          .where(eq(reminders.id, r.id));
        sent++;
      } catch (err) {
        // Transient (provider hiccup) — leave pending, retry next tick.
        console.warn(
          `[scheduler] email reminder ${r.id} not delivered, will retry:`,
          err instanceof Error ? err.message : err,
        );
        skipped++;
      }
      continue;
    }

    if (r.channel !== "whatsapp" || !to || !message) {
      await markFailed(r.id, "missing recipient or message");
      failed++;
      continue;
    }

    try {
      await sendWhatsApp(r.tenantId, to, message);
      await db
        .update(reminders)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(reminders.id, r.id));
      sent++;
    } catch (err) {
      // Transient (e.g. channel not connected yet) — leave pending, retry later.
      console.warn(
        `[scheduler] reminder ${r.id} not delivered, will retry:`,
        err instanceof Error ? err.message : err,
      );
      skipped++;
    }
  }

  return { sent, failed, skipped };
}

async function markFailed(id: string, reason: string): Promise<void> {
  await db
    .update(reminders)
    .set({
      status: "failed",
      payload: { error: reason },
    })
    .where(eq(reminders.id, id));
}
