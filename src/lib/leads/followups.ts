import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessConfig, customers, reminders } from "@/lib/db/schema";

type Customer = typeof customers.$inferSelect;
type BusinessConfig = typeof businessConfig.$inferSelect;

/** Reminder rows produced by a lead follow-up sequence carry this `kind`. */
export const LEAD_FOLLOWUP_KIND = "lead_followup";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Schedule a tenant's automated follow-up sequence for one captured lead.
 *
 * Idempotent + best-effort: does nothing when the sequence is disabled/empty,
 * when the lead already has pending follow-ups queued, or when there is no way
 * to reach them. Delivery channel is chosen per lead:
 *   - email if we have one (works on every channel, incl. anonymous web chat);
 *   - otherwise WhatsApp for WhatsApp-origin leads (best-effort — cold sends
 *     outside the 24h window need approved templates, which aren't built yet).
 *
 * Each step becomes a `pending` {@link reminders} row the worker's scheduler
 * delivers, tagged with `kind = "lead_followup"` + `customerId` so
 * {@link cancelLeadFollowups} can stop the sequence once the lead re-engages.
 */
export async function scheduleLeadFollowups(args: {
  tenantId: string;
  customer: Customer;
  channel?: "baileys" | "cloud_api" | "web";
  config: BusinessConfig;
}): Promise<void> {
  const { tenantId, customer, channel, config } = args;

  const followups = config.leadFollowups;
  if (!followups?.enabled) return;
  const steps = (followups.steps ?? []).filter(
    (s) => s.message?.trim() && Number.isFinite(s.afterHours),
  );
  if (steps.length === 0) return;

  // Pick a delivery channel + recipient for this lead.
  const email = customer.email?.trim();
  const isWhatsApp = channel === "baileys" || channel === "cloud_api";
  let deliver: { channel: "email" | "whatsapp"; to: string } | null = null;
  if (email) {
    deliver = { channel: "email", to: email };
  } else if (isWhatsApp && customer.phone?.trim()) {
    deliver = { channel: "whatsapp", to: customer.phone.trim() };
  }
  if (!deliver) return; // unreachable (e.g. anonymous web visitor, no email yet)

  // Don't stack sequences: skip if this lead already has follow-ups queued.
  const existing = await db.query.reminders.findFirst({
    where: and(
      eq(reminders.customerId, customer.id),
      eq(reminders.kind, LEAD_FOLLOWUP_KIND),
      eq(reminders.status, "pending"),
    ),
  });
  if (existing) return;

  const now = Date.now();
  const subject = `Following up from ${config.displayName}`;

  const rows = steps.map((step) => ({
    tenantId,
    customerId: customer.id,
    kind: LEAD_FOLLOWUP_KIND,
    target: "customer" as const,
    channel: deliver.channel,
    sendAt: new Date(now + Math.max(0, step.afterHours) * HOUR_MS),
    payload:
      deliver.channel === "email"
        ? { to: deliver.to, subject, message: step.message.trim() }
        : { to: deliver.to, message: step.message.trim() },
  }));

  await db.insert(reminders).values(rows);
}

/**
 * Cancel a lead's remaining follow-up nudges (they re-engaged, converted, or
 * were lost). Flips only this customer's `pending` `lead_followup` rows to
 * `cancelled`; already-sent rows are untouched.
 */
export async function cancelLeadFollowups(
  tenantId: string,
  customerId: string,
): Promise<void> {
  await db
    .update(reminders)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(reminders.tenantId, tenantId),
        eq(reminders.customerId, customerId),
        eq(reminders.kind, LEAD_FOLLOWUP_KIND),
        eq(reminders.status, "pending"),
      ),
    );
}
