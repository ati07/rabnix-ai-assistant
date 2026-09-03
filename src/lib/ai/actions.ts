import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  appointments,
  businessConfig,
  conversations,
  customers,
  notifications,
  reminders,
  staff,
  tenants,
  users,
  type ServiceItem,
} from "@/lib/db/schema";
import {
  DEFAULT_DURATION_MINUTES,
  formatInZone,
  parseDate,
  parseDurationMinutes,
  parseHhMm,
  weekdayKeyInZone,
  zonedTimeToUtc,
} from "@/lib/time";
import { scheduleLeadFollowups } from "@/lib/leads/followups";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { customerBookingEmail, ownerBookingEmail } from "@/lib/email/booking";
import type { LlmToolResult, ToolExecutor, ToolInvocation } from "./provider";
import { searchKnowledge } from "./rag";

type BusinessConfig = typeof businessConfig.$inferSelect;

type Customer = typeof customers.$inferSelect;

/** Everything a tool needs to act on behalf of one conversation. */
export interface ToolContext {
  tenantId: string;
  conversationId: string;
  /** Customer's WhatsApp number / channel id (E.164, or web session id). */
  customerId: string;
  customerName?: string | null;
  /** Which channel this conversation is on (drives reminder delivery). */
  channel?: "baileys" | "cloud_api" | "web";
  /** The tenant's business config (timezone, services, hours). */
  config: BusinessConfig | null;
}

/** How many free slots to offer at most. */
const MAX_SLOTS = 6;
/** Postgres unique-violation SQLSTATE (double-booked slot). */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Build the real tool executor for one conversation.
 *
 * Replaces the Phase 2 stubs: knowledge search, CRM read/write, availability +
 * booking, staff notifications, customer reminders, and human handoff — all
 * tenant-scoped via {@link ToolContext}.
 */
export function makeToolExecutor(ctx: ToolContext): ToolExecutor {
  return async (call: ToolInvocation): Promise<LlmToolResult> => {
    try {
      switch (call.name) {
        case "search_knowledge":
          return await doSearchKnowledge(ctx, call.input);
        case "get_customer":
          return await doGetCustomer(ctx);
        case "update_customer":
          return await doUpdateCustomer(ctx, call.input);
        case "check_availability":
          return await doCheckAvailability(ctx, call.input);
        case "book_appointment":
          return await doBookAppointment(ctx, call.input);
        case "notify_staff":
          return await doNotifyStaff(ctx, call.input);
        case "schedule_reminder":
          return await doScheduleReminder(ctx, call.input);
        case "escalate_to_human":
          return await doEscalate(ctx, call.input);
        default:
          return {
            content: `Unknown action "${call.name}".`,
            isError: true,
          };
      }
    } catch (err) {
      console.error(`[tool:${call.name}] failed:`, err);
      return {
        content: `The "${call.name}" action hit an unexpected error. Tell the customer a team member will follow up.`,
        isError: true,
      };
    }
  };
}

// ── Knowledge ──────────────────────────────────────────────────────────────
async function doSearchKnowledge(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<LlmToolResult> {
  const query = String(input.query ?? "").trim();
  if (!query) return { content: "No search query was provided." };
  const results = await searchKnowledge(ctx.tenantId, query, { limit: 5 });
  if (results.length === 0) {
    return {
      content:
        "No relevant information found in the knowledge base. Answer from your configured information, or offer to connect a human.",
    };
  }
  return {
    content: results.map((r, i) => `[${i + 1}] ${r.content}`).join("\n\n"),
  };
}

// ── CRM ──────────────────────────────────────────────────────────────────
/** Find-or-create this conversation's customer, refreshing last-seen. */
async function ensureCustomer(ctx: ToolContext) {
  await db
    .insert(customers)
    .values({
      tenantId: ctx.tenantId,
      phone: ctx.customerId,
      name: ctx.customerName ?? undefined,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [customers.tenantId, customers.phone],
      set: { lastSeenAt: new Date() },
    });

  const row = await db.query.customers.findFirst({
    where: and(
      eq(customers.tenantId, ctx.tenantId),
      eq(customers.phone, ctx.customerId),
    ),
  });
  if (!row) throw new Error("Failed to load customer after upsert.");
  return row;
}

async function doGetCustomer(ctx: ToolContext): Promise<LlmToolResult> {
  const c = await ensureCustomer(ctx);
  return {
    content: JSON.stringify({
      found: true,
      name: c.name ?? null,
      email: c.email ?? null,
      tags: c.tags ?? [],
      notes: c.notes ?? null,
    }),
  };
}

async function doUpdateCustomer(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<LlmToolResult> {
  const c = await ensureCustomer(ctx);
  const name = optionalString(input.name);
  const email = optionalString(input.email);
  const phone = optionalString(input.phone);
  const note = optionalString(input.notes);

  const set: Partial<typeof customers.$inferInsert> = {};
  if (name) set.name = name;
  if (email) set.email = email;
  // The `phone` column is this customer's identity/dedup key (their WhatsApp
  // number, or a web session id) — never overwrite it. A phone the visitor
  // volunteers is a contact detail, so stash it in customFields instead.
  if (phone) {
    set.customFields = { ...(c.customFields ?? {}), contactPhone: phone };
  }
  if (note) {
    const stamp = new Date().toISOString().slice(0, 10);
    set.notes = c.notes ? `${c.notes}\n[${stamp}] ${note}` : `[${stamp}] ${note}`;
  }
  // Record where this lead first came from (once).
  if (!c.source && ctx.channel) {
    set.source = ctx.channel === "web" ? "web" : "whatsapp";
  }

  if (Object.keys(set).length === 0) {
    return { content: "Nothing to update — no new details were provided." };
  }

  await db.update(customers).set(set).where(eq(customers.id, c.id));

  // Capturing a name/email is the "lead captured" signal — kick off the tenant's
  // automated follow-up sequence (idempotent; no-op if disabled/unreachable).
  if ((name || email) && ctx.config) {
    try {
      const updated = await db.query.customers.findFirst({
        where: eq(customers.id, c.id),
      });
      if (updated) {
        await scheduleLeadFollowups({
          tenantId: ctx.tenantId,
          customer: updated,
          channel: ctx.channel,
          config: ctx.config,
        });
      }
    } catch (err) {
      // Never fail the CRM save because follow-up scheduling hiccuped.
      console.error("[update_customer] scheduling follow-ups failed:", err);
    }
  }

  return { content: "Customer details saved." };
}

// ── Availability + booking ─────────────────────────────────────────────────
function findService(
  config: BusinessConfig | null,
  serviceName: string,
): ServiceItem | null {
  const services = config?.services ?? [];
  const wanted = serviceName.trim().toLowerCase();
  return (
    services.find((s) => s.name.trim().toLowerCase() === wanted) ??
    services.find((s) => s.name.trim().toLowerCase().includes(wanted)) ??
    null
  );
}

async function doCheckAvailability(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<LlmToolResult> {
  const config = ctx.config;
  if (!config) {
    return { content: "Booking is not configured for this business yet." };
  }
  const serviceName = String(input.serviceName ?? "").trim();
  const dateStr = String(input.date ?? "").trim();
  const staffName = optionalString(input.staffName);

  const parsed = parseDate(dateStr);
  if (!parsed) {
    return {
      content: "The date must be in YYYY-MM-DD format. Ask the customer for a valid date.",
      isError: true,
    };
  }

  const service = findService(config, serviceName);
  const durationMin = service
    ? parseDurationMinutes(service.duration)
    : DEFAULT_DURATION_MINUTES;

  const tz = config.timezone || "UTC";
  // Weekday of the requested date at noon (avoids DST edge at midnight).
  const noon = zonedTimeToUtc(parsed.year, parsed.month, parsed.day, 12, 0, tz);
  const dayKey = weekdayKeyInZone(noon, tz);
  const ranges = config.hours?.[dayKey] ?? [];
  if (ranges.length === 0) {
    return {
      content: `The business is closed on that day (${dayKey}). Offer another date.`,
    };
  }

  // Resolve an optional requested staff member.
  const staffRow = staffName ? await findStaff(ctx.tenantId, staffName) : null;

  // Existing appointments on that date (tenant-local day window).
  const dayStart = zonedTimeToUtc(parsed.year, parsed.month, parsed.day, 0, 0, tz);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const booked = await db
    .select({
      startAt: appointments.startAt,
      endAt: appointments.endAt,
      staffId: appointments.staffId,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, ctx.tenantId),
        gte(appointments.startAt, dayStart),
        lte(appointments.startAt, dayEnd),
        ne(appointments.status, "cancelled"),
        ne(appointments.status, "no_show"),
      ),
    );

  const now = new Date();
  const free: { startAt: string; label: string }[] = [];

  for (const [open, close] of ranges) {
    const openMin = parseHhMm(open);
    const closeMin = parseHhMm(close);
    if (openMin == null || closeMin == null) continue;

    for (let t = openMin; t + durationMin <= closeMin; t += durationMin) {
      const slotStart = zonedTimeToUtc(
        parsed.year,
        parsed.month,
        parsed.day,
        Math.floor(t / 60),
        t % 60,
        tz,
      );
      const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);
      if (slotStart <= now) continue; // no past slots

      const clash = booked.some((b) => {
        // If a specific staff member was requested, only their bookings block.
        if (staffRow && b.staffId !== staffRow.id) return false;
        return slotStart < b.endAt && b.startAt < slotEnd;
      });
      if (clash) continue;

      free.push({ startAt: slotStart.toISOString(), label: formatInZone(slotStart, tz) });
      if (free.length >= MAX_SLOTS) break;
    }
    if (free.length >= MAX_SLOTS) break;
  }

  if (free.length === 0) {
    return {
      content: `No open ${durationMin}-minute slots on ${dateStr}. Offer another date.`,
    };
  }

  return {
    content: JSON.stringify({
      service: service?.name ?? serviceName,
      durationMinutes: durationMin,
      staff: staffRow?.name ?? null,
      slots: free,
      note: "Offer these times to the customer. To book, call book_appointment with the exact startAt.",
    }),
  };
}

async function doBookAppointment(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<LlmToolResult> {
  const config = ctx.config;
  const serviceName = String(input.serviceName ?? "").trim();
  const startAtRaw = String(input.startAt ?? "").trim();
  const staffName = optionalString(input.staffName);
  const notes = optionalString(input.notes);

  const startAt = new Date(startAtRaw);
  if (Number.isNaN(startAt.getTime())) {
    return {
      content: "startAt is not a valid datetime. Re-check availability and use an exact slot's startAt.",
      isError: true,
    };
  }
  if (startAt <= new Date()) {
    return { content: "That time is in the past. Offer a future slot.", isError: true };
  }

  const service = findService(config, serviceName);
  const durationMin = service
    ? parseDurationMinutes(service.duration)
    : DEFAULT_DURATION_MINUTES;
  const endAt = new Date(startAt.getTime() + durationMin * 60000);

  const customer = await ensureCustomer(ctx);
  const staffRow = staffName ? await findStaff(ctx.tenantId, staffName) : null;

  // Idempotency: a customer can't be in two places at once, so an existing
  // non-cancelled appointment at the same start time IS this booking. Return it
  // instead of inserting a duplicate row (and firing a duplicate notification)
  // when the model calls book_appointment more than once.
  const existing = await db.query.appointments.findFirst({
    where: and(
      eq(appointments.tenantId, ctx.tenantId),
      eq(appointments.customerId, customer.id),
      eq(appointments.startAt, startAt),
      ne(appointments.status, "cancelled"),
    ),
  });
  if (existing) {
    const tz = config?.timezone || "UTC";
    return {
      content: JSON.stringify({
        booked: true,
        appointmentId: existing.id,
        service: existing.serviceName,
        when: formatInZone(existing.startAt, tz),
        staff: staffRow?.name ?? null,
        alreadyBooked: true,
        note: "This appointment is already booked — do NOT book again. Just confirm it to the customer.",
      }),
    };
  }

  try {
    const [appt] = await db
      .insert(appointments)
      .values({
        tenantId: ctx.tenantId,
        customerId: customer.id,
        staffId: staffRow?.id ?? null,
        serviceName: service?.name ?? serviceName,
        startAt,
        endAt,
        status: "scheduled",
        source: "ai",
        notes,
      })
      .returning({ id: appointments.id });

    const tz = config?.timezone || "UTC";
    const when = formatInZone(startAt, tz);

    await notifyStaff(ctx.tenantId, {
      type: "booking",
      title: "New booking",
      body: `${customer.name ?? ctx.customerId} booked ${service?.name ?? serviceName} for ${when}${staffRow ? ` with ${staffRow.name}` : ""}.`,
      meta: { appointmentId: appt.id },
    });

    // Confirmation emails — one to the customer (if we have their email), one to
    // the business owner. Sent immediately (best-effort); a mail failure never
    // fails the booking itself.
    const emailed = await sendBookingEmails(ctx, {
      customer,
      serviceName: service?.name ?? serviceName,
      when,
      staffName: staffRow?.name ?? null,
    });

    return {
      content: JSON.stringify({
        booked: true,
        appointmentId: appt.id,
        service: service?.name ?? serviceName,
        when,
        staff: staffRow?.name ?? null,
        confirmationEmailSent: emailed.customerEmailed,
        note: customer.email
          ? undefined
          : "Booked, but we have no email on file to send this customer a confirmation. Ask for their email and save it with update_customer so we can email them the details.",
      }),
    };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        content:
          "That slot was just taken. Call check_availability again and offer the customer a different time.",
        isError: true,
      };
    }
    throw err;
  }
}

/**
 * Send booking-confirmation emails immediately after a successful booking:
 * - the customer (only when we have an email on file — WhatsApp visitors rarely
 *   do until they share one; web visitors may have saved one via update_customer);
 * - the business owner (the account holder), always.
 *
 * Sent directly via Resend (like verification/billing emails), not queued, so
 * they arrive at once without depending on the worker. Best-effort: each send is
 * isolated, and a mail failure never fails the booking. Returns whether the
 * customer was actually emailed (surfaced to the model).
 */
async function sendBookingEmails(
  ctx: ToolContext,
  b: {
    customer: Customer;
    serviceName: string;
    when: string;
    staffName: string | null;
  },
): Promise<{ customerEmailed: boolean }> {
  if (!isEmailConfigured()) return { customerEmailed: false };

  const businessName = ctx.config?.displayName?.trim() || "your business";
  let customerEmailed = false;

  const customerEmail = b.customer.email?.trim();
  if (customerEmail) {
    const mail = customerBookingEmail({
      businessName,
      customerName: b.customer.name,
      serviceName: b.serviceName,
      when: b.when,
      staffName: b.staffName,
    });
    try {
      await sendEmail({ to: customerEmail, ...mail });
      customerEmailed = true;
    } catch (err) {
      console.error("[book_appointment] customer confirmation email failed:", err);
    }
  }

  const owner = await getTenantOwnerEmail(ctx.tenantId);
  // Skip the owner notification when the owner IS the customer (same address) —
  // e.g. a solo operator booking themselves — so they don't get two emails. In
  // real use owner and customer are different people and both are sent.
  const sameAsCustomer =
    !!owner && !!customerEmail && owner.toLowerCase() === customerEmail.toLowerCase();
  if (owner && !sameAsCustomer) {
    // A real reachable number: the volunteered contact phone, or — on WhatsApp
    // channels only — the conversation id (which IS their number). On `web` the
    // phone column is an anonymous session id, so never show it.
    const contactPhone =
      (b.customer.customFields?.contactPhone as string | undefined)?.trim() ||
      (ctx.channel !== "web" ? b.customer.phone : undefined);
    const mail = ownerBookingEmail({
      businessName,
      customerName: b.customer.name || contactPhone || "A customer",
      customerContact: b.customer.email?.trim() || contactPhone || null,
      serviceName: b.serviceName,
      when: b.when,
      staffName: b.staffName,
    });
    try {
      await sendEmail({ to: owner, ...mail });
    } catch (err) {
      console.error("[book_appointment] owner booking email failed:", err);
    }
  }

  return { customerEmailed };
}

/**
 * The tenant owner's email (the account holder), for the booking notification.
 * Queried directly here rather than via the billing helper to keep the auth /
 * `next/headers` chain out of the worker's import graph.
 */
async function getTenantOwnerEmail(tenantId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: users.email })
    .from(tenants)
    .innerJoin(users, eq(users.id, tenants.ownerUserId))
    .where(eq(tenants.id, tenantId));
  return row?.email ?? null;
}

// ── Staff notifications ────────────────────────────────────────────────────
async function doNotifyStaff(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<LlmToolResult> {
  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  if (!title && !body) {
    return { content: "Nothing to notify — title and body were empty.", isError: true };
  }
  await notifyStaff(ctx.tenantId, {
    type: "alert",
    title: title || "Staff alert",
    body,
  });
  return { content: "The team has been notified." };
}

/**
 * Fan a staff notification out to every configured channel:
 * - dashboard: always — a durable {@link notifications} row for the app feed.
 * - whatsapp / email: enqueued as immediate {@link reminders} the worker's
 *   scheduler delivers (keeps outbound sending in the worker, not the brain).
 */
async function notifyStaff(
  tenantId: string,
  n: { type: string; title: string; body: string; meta?: Record<string, unknown> },
): Promise<void> {
  // Durable dashboard feed entry (tenant-wide; staffId null = everyone).
  await db.insert(notifications).values({
    tenantId,
    type: n.type,
    title: n.title,
    body: n.body,
    channel: "dashboard",
    meta: n.meta ?? {},
  });

  const team = await db.query.staff.findMany({
    where: eq(staff.tenantId, tenantId),
  });

  const text = n.body ? `🔔 ${n.title}\n${n.body}` : `🔔 ${n.title}`;
  const now = new Date();

  for (const member of team) {
    const wants = member.notifyChannels ?? ["dashboard"];
    if (wants.includes("whatsapp") && member.phone) {
      await db.insert(reminders).values({
        tenantId,
        target: "staff",
        channel: "whatsapp",
        sendAt: now,
        payload: { to: member.phone, message: text },
      });
    }
    if (wants.includes("email") && member.email) {
      await db.insert(reminders).values({
        tenantId,
        target: "staff",
        channel: "email",
        sendAt: now,
        payload: { to: member.email, subject: n.title, message: n.body },
      });
    }
  }
}

// ── Customer reminders ─────────────────────────────────────────────────────
async function doScheduleReminder(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<LlmToolResult> {
  const sendAtRaw = String(input.sendAt ?? "").trim();
  const message = String(input.message ?? "").trim();
  const appointmentId = optionalString(input.appointmentId);

  const sendAt = new Date(sendAtRaw);
  if (Number.isNaN(sendAt.getTime())) {
    return { content: "sendAt is not a valid datetime.", isError: true };
  }
  if (!message) {
    return { content: "A reminder message is required.", isError: true };
  }
  if (sendAt <= new Date()) {
    return { content: "That time is in the past — pick a future time.", isError: true };
  }

  const tz = ctx.config?.timezone || "UTC";

  // Web visitors are anonymous — there's no WhatsApp number to reach them on, so
  // reminders must go by email. Require an email on file before scheduling one.
  if (ctx.channel === "web") {
    const customer = await ensureCustomer(ctx);
    const email = customer.email?.trim();
    if (!email) {
      return {
        content:
          "This is a website chat visitor with no email on file, so a reminder can't be delivered yet. Ask the customer for their email, save it with update_customer, then schedule the reminder. Do NOT tell them a reminder is set until then, and never say you'll remind them on WhatsApp.",
      };
    }

    await db.insert(reminders).values({
      tenantId: ctx.tenantId,
      appointmentId: appointmentId ?? null,
      target: "customer",
      channel: "email",
      sendAt,
      payload: {
        to: email,
        subject: `Reminder from ${ctx.config?.displayName ?? "us"}`,
        message,
      },
    });

    return {
      content: `Reminder scheduled by email to ${email} for ${formatInZone(sendAt, tz)}.`,
    };
  }

  // WhatsApp channels: reach the customer at their number (the conversation id).
  await db.insert(reminders).values({
    tenantId: ctx.tenantId,
    appointmentId: appointmentId ?? null,
    target: "customer",
    channel: "whatsapp",
    sendAt,
    payload: { to: ctx.customerId, message },
  });

  return { content: `Reminder scheduled for ${formatInZone(sendAt, tz)}.` };
}

// ── Human handoff ──────────────────────────────────────────────────────────
async function doEscalate(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<LlmToolResult> {
  const reason = String(input.reason ?? "").trim() || "Customer needs a human.";

  await db
    .update(conversations)
    .set({ status: "needs_human" })
    .where(eq(conversations.id, ctx.conversationId));

  // Web visitors are anonymous — a team member can reply live in the chat while
  // the visitor is on the page, but once they leave there's no way to reach them
  // unless we captured an email. Surface whatever contact we have to staff.
  let contactLine = "";
  let webEmail: string | undefined;
  if (ctx.channel === "web") {
    const customer = await ensureCustomer(ctx);
    webEmail = customer.email?.trim() || undefined;
    contactLine = webEmail
      ? `\nFollow up by email: ${webEmail} (or reply live in the chat).`
      : "\nNo email on file — reply live in the chat now, or ask them for an email to follow up later.";
  }

  await notifyStaff(ctx.tenantId, {
    type: "handoff",
    title: "Conversation needs a human",
    body: `${ctx.customerName ?? ctx.customerId}: ${reason}${contactLine}`,
    meta: { conversationId: ctx.conversationId, channel: ctx.channel, email: webEmail ?? null },
  });

  if (ctx.channel === "web" && !webEmail) {
    return {
      content:
        "Escalated to the team. This is an anonymous website visitor, so ask for their email now (save it with update_customer) so the team can follow up if they leave the page — and tell them a team member will reply here in the chat shortly.",
    };
  }

  return {
    content:
      "Escalated to the team. Tell the customer a team member will follow up shortly" +
      (ctx.channel === "web" ? " — here in the chat, or by email." : "."),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
async function findStaff(tenantId: string, name: string) {
  const wanted = name.trim().toLowerCase();
  const team = await db.query.staff.findMany({
    where: eq(staff.tenantId, tenantId),
    orderBy: (s) => asc(s.name),
  });
  return (
    team.find((s) => s.name.trim().toLowerCase() === wanted) ??
    team.find((s) => s.name.trim().toLowerCase().includes(wanted)) ??
    null
  );
}

function optionalString(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 ? s : undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}
