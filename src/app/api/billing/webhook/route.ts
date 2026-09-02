import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingEvents } from "@/lib/db/schema";
import {
  tierForPlanId,
  verifyWebhookSignature,
  type RazorpaySubscription,
} from "@/lib/billing/razorpay";
import {
  getTenantOwnerContact,
  patchByRazorpayId,
  upsertSubscription,
} from "@/lib/billing/subscription";
import { sendPaymentFailedEmail } from "@/lib/email/billing";
import type { PaidTier } from "@/lib/billing/plans";

export const runtime = "nodejs";

/**
 * Razorpay webhook (public — Razorpay calls this).
 *
 * Verifies the HMAC signature, dedupes by delivery id (so retries are no-ops),
 * and syncs subscription state. We always ack 2xx after a valid signature so
 * Razorpay doesn't keep retrying; failures are logged and swallowed.
 *
 * Configure in Razorpay Dashboard → Settings → Webhooks with the
 * `subscription.*` events and the same secret as RAZORPAY_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    console.warn("[billing-webhook] rejected: invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const event = body.event ?? "unknown";
  const sub = body.payload?.subscription?.entity ?? null;
  // Prefer Razorpay's delivery id for idempotency; fall back to a stable key.
  const eventId =
    req.headers.get("x-razorpay-event-id") ??
    `${event}:${sub?.id ?? "na"}:${body.created_at ?? ""}`;

  // Idempotency: only the first delivery of an id gets processed.
  const inserted = await db
    .insert(billingEvents)
    .values({ eventId, type: event, payload: body })
    .onConflictDoNothing({ target: billingEvents.eventId })
    .returning({ id: billingEvents.id });

  if (inserted.length === 0) {
    return new Response("Duplicate", { status: 200 });
  }

  try {
    if (sub && event.startsWith("subscription.")) {
      await applySubscription(event, sub, inserted[0].id);
    } else {
      console.log("[billing-webhook] ignoring event:", event);
    }
  } catch (err) {
    console.error("[billing-webhook] processing failed:", event, err);
  }

  return new Response("ok", { status: 200 });
}

/** Sync one subscription entity into our DB, recording the tenant on the event. */
async function applySubscription(
  event: string,
  sub: RazorpaySubscription,
  eventRowId: string,
): Promise<void> {
  const cancelling =
    event === "subscription.cancelled" || sub.status === "cancelled";

  // We stamp notes.tenant_id when creating the subscription, so webhooks can
  // resolve the tenant even before our row exists. Fall back to updating the
  // existing row by Razorpay id.
  const tenantId = sub.notes?.tenant_id;
  let touchedTenant: string | null = null;

  if (tenantId) {
    // Resolve our tier: prefer the note we stamped at creation, else reverse-map
    // the Razorpay plan id, else assume Pro (safest — grants, never over-charges).
    const noteTier = sub.notes?.tier;
    const tier: PaidTier =
      noteTier === "basic" || noteTier === "pro"
        ? noteTier
        : tierForPlanId(sub.plan_id) ?? "pro";
    await upsertSubscription({
      tenantId,
      tier,
      sub,
      customerId: sub.customer_id ?? null,
      cancelAtPeriodEnd: cancelling,
    });
    touchedTenant = tenantId;
  } else {
    touchedTenant = await patchByRazorpayId(sub.id, {
      status: sub.status,
      currentPeriodEnd: sub.current_end ?? null,
      cancelAtPeriodEnd: cancelling,
    });
  }

  if (touchedTenant) {
    await db
      .update(billingEvents)
      .set({ tenantId: touchedTenant })
      .where(eq(billingEvents.id, eventRowId));

    // Dunning: a charge failed. `subscription.pending` = Razorpay will retry;
    // `subscription.halted` = retries exhausted, access paused. Webhook dedup
    // means one email per distinct event (i.e. per retry Razorpay sends).
    const halted = event === "subscription.halted" || sub.status === "halted";
    if (event === "subscription.pending" || halted) {
      await notifyPaymentFailure(touchedTenant, halted);
    }
  }
}

/** Email the tenant owner that their payment failed. Best-effort; never throws. */
async function notifyPaymentFailure(
  tenantId: string,
  halted: boolean,
): Promise<void> {
  try {
    const contact = await getTenantOwnerContact(tenantId);
    if (!contact) return;
    await sendPaymentFailedEmail({
      to: contact.email,
      name: contact.name,
      tenantName: contact.tenantName,
      halted,
    });
  } catch (err) {
    console.error("[billing-webhook] dunning email failed:", err);
  }
}

interface RazorpayWebhookBody {
  event?: string;
  created_at?: number;
  payload?: {
    subscription?: { entity?: RazorpaySubscription };
  };
}
