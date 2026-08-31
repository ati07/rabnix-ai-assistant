import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, subscriptions, tenants } from "@/lib/db/schema";
import {
  entitlementsFor,
  type BillingCycle,
  type Entitlements,
  type PaidTier,
  type PlanId,
} from "@/lib/billing/plans";
import type { RazorpaySubscription } from "@/lib/billing/razorpay";
import { requireMembership, type Membership } from "@/lib/tenant";

export type Subscription = typeof subscriptions.$inferSelect;

/**
 * Razorpay statuses that grant access while the paid period is still current.
 * `created` (subscription made, mandate not yet authorized) is intentionally
 * excluded — access begins only once the mandate is authenticated/active.
 */
const ACCESS_STATUSES = new Set(["authenticated", "active", "pending"]);

/** The tenant's subscription row, or null when it has never had one. */
export async function getSubscription(
  tenantId: string,
): Promise<Subscription | null> {
  return (
    (await db.query.subscriptions.findFirst({
      where: eq(subscriptions.tenantId, tenantId),
    })) ?? null
  );
}

/** Whether a paid subscription row currently grants access to its tier. */
function subscriptionActive(sub: Subscription | null): sub is Subscription {
  if (!sub || sub.plan === "free") return false;
  if (sub.lifetime) return true; // never expires
  if (!ACCESS_STATUSES.has(sub.status)) return false;
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() <= Date.now()) {
    return false;
  }
  return true;
}

/** Whether the tenant is still inside its 7-day free trial. */
export function isTrialing(trialEndsAt: Date | null | undefined): boolean {
  return Boolean(trialEndsAt && trialEndsAt.getTime() > Date.now());
}

/**
 * The plan a tenant is *effectively* on right now — the single source of truth
 * for gating. A live paid subscription (basic/pro, incl. lifetime) wins; failing
 * that, an unexpired trial grants full Pro; otherwise the tenant is locked to the
 * restricted Free tier until they pay.
 */
export function effectivePlan(
  sub: Subscription | null,
  trialEndsAt: Date | null | undefined,
): PlanId {
  if (subscriptionActive(sub)) return sub.plan as PlanId;
  if (isTrialing(trialEndsAt)) return "pro";
  return "free";
}

/** The tenant's trial deadline (or null if the tenant no longer exists). */
async function getTrialEndsAt(tenantId: string): Promise<Date | null> {
  const t = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { trialEndsAt: true },
  });
  return t?.trialEndsAt ?? null;
}

/** Entitlements for the tenant's effective plan. */
export async function getEntitlements(tenantId: string): Promise<Entitlements> {
  const [sub, trialEndsAt] = await Promise.all([
    getSubscription(tenantId),
    getTrialEndsAt(tenantId),
  ]);
  return entitlementsFor(effectivePlan(sub, trialEndsAt));
}

/**
 * Whether the tenant may connect a WhatsApp channel right now — true on Pro
 * (paid or lifetime) and during the trial; false on Basic and once locked. The
 * gate the Basic-vs-Pro split hinges on.
 */
export async function canUseWhatsApp(tenantId: string): Promise<boolean> {
  return (await getEntitlements(tenantId)).whatsapp;
}

export const WHATSAPP_LOCKED_MESSAGE =
  "WhatsApp is a Pro feature. Upgrade to Pro (or buy Lifetime) to connect WhatsApp.";

/** Convenience: is the tenant on an active Pro plan (or Pro trial) right now? */
export async function isProActive(tenantId: string): Promise<boolean> {
  const [sub, trialEndsAt] = await Promise.all([
    getSubscription(tenantId),
    getTrialEndsAt(tenantId),
  ]);
  return effectivePlan(sub, trialEndsAt) === "pro";
}

/**
 * True when the tenant has room for another knowledge document under its plan's
 * `maxKnowledgeDocs`. Pro (Infinity) always passes without a count query.
 */
export async function canAddDocument(tenantId: string): Promise<boolean> {
  const ent = await getEntitlements(tenantId);
  if (ent.maxKnowledgeDocs === Infinity) return true;
  const [row] = await db
    .select({ n: count() })
    .from(documents)
    .where(eq(documents.tenantId, tenantId));
  return (row?.n ?? 0) < ent.maxKnowledgeDocs;
}

export const KNOWLEDGE_LIMIT_MESSAGE =
  "You've reached your plan's knowledge limit. Upgrade to Pro for unlimited documents.";

export interface BillingState {
  plan: PlanId; // the plan the row claims (may be paid-but-lapsed)
  effectivePlan: PlanId; // what actually applies right now
  status: string;
  billingCycle: BillingCycle | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  razorpaySubscriptionId: string | null;
  /** A paid subscription (recurring or lifetime) is granting access right now. */
  subscribed: boolean;
  /** One-time Lifetime purchase — Pro forever, no renewal/cancel. */
  lifetime: boolean;
  /** Inside the 7-day free trial right now. */
  trialing: boolean;
  /** Trial deadline, whether or not it has passed. */
  trialEndsAt: Date | null;
}

/** Everything the billing UI needs about a tenant's current plan. */
export async function getBillingState(tenantId: string): Promise<BillingState> {
  const [sub, trialEndsAt] = await Promise.all([
    getSubscription(tenantId),
    getTrialEndsAt(tenantId),
  ]);
  return {
    plan: (sub?.plan as PlanId) ?? "free",
    effectivePlan: effectivePlan(sub, trialEndsAt),
    status: sub?.status ?? "inactive",
    billingCycle: (sub?.billingCycle as BillingCycle | null) ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    razorpaySubscriptionId: sub?.razorpaySubscriptionId ?? null,
    subscribed: subscriptionActive(sub),
    lifetime: sub?.lifetime ?? false,
    trialing: isTrialing(trialEndsAt),
    trialEndsAt,
  };
}

/**
 * Gate a server action behind an active Pro plan. Throws (owner or staff of a
 * Pro tenant both pass — the plan belongs to the tenant, not the user).
 */
export async function requirePro(): Promise<Membership> {
  const m = await requireMembership();
  if (!(await isProActive(m.tenant.id))) {
    throw new Error("This feature requires the Pro plan.");
  }
  return m;
}

/** Map a Razorpay unix-seconds timestamp to a Date (or null). */
function toDate(seconds: number | null | undefined): Date | null {
  return seconds ? new Date(seconds * 1000) : null;
}

/**
 * Upsert a tenant's subscription row from a Razorpay subscription object
 * (checkout time or webhook). Keyed by tenantId (one subscription per tenant).
 * `cancelAtPeriodEnd` is derived from the presence of a scheduled cancel or a
 * dead status.
 */
export async function upsertSubscription(input: {
  tenantId: string;
  tier: PaidTier;
  sub: RazorpaySubscription;
  cycle?: BillingCycle;
  customerId?: string | null;
  cancelAtPeriodEnd?: boolean;
}): Promise<void> {
  const { tenantId, tier, sub } = input;
  const values = {
    tenantId,
    plan: tier,
    status: sub.status,
    billingCycle: input.cycle ?? null,
    razorpayCustomerId: input.customerId ?? sub.customer_id ?? null,
    razorpaySubscriptionId: sub.id,
    currentPeriodEnd: toDate(sub.current_end),
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    // Moving to a recurring plan clears any prior lifetime flag.
    lifetime: false,
    updatedAt: new Date(),
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.tenantId,
      // Don't overwrite a stored cycle with null on webhook updates that lack it.
      set: {
        status: values.status,
        razorpaySubscriptionId: values.razorpaySubscriptionId,
        razorpayCustomerId: values.razorpayCustomerId,
        currentPeriodEnd: values.currentPeriodEnd,
        cancelAtPeriodEnd: values.cancelAtPeriodEnd,
        lifetime: false,
        ...(input.cycle ? { billingCycle: input.cycle } : {}),
        plan: tier,
        updatedAt: values.updatedAt,
      },
    });
}

/**
 * Record a one-time Lifetime purchase: Pro forever, no cycle/renewal. Stores the
 * Razorpay payment id (for reconciliation) in place of a subscription id and
 * clears any recurring fields. Called after /api/verify-payment confirms the
 * ₹20,000 order signature.
 */
export async function upsertLifetime(input: {
  tenantId: string;
  paymentId: string;
}): Promise<void> {
  const values = {
    tenantId: input.tenantId,
    plan: "pro" as const,
    status: "active",
    billingCycle: null,
    razorpaySubscriptionId: null,
    razorpayPaymentId: input.paymentId,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    lifetime: true,
    updatedAt: new Date(),
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.tenantId,
      set: values,
    });
}

/**
 * Update an existing subscription row identified by its Razorpay subscription id
 * (used by webhook events that only carry the subscription). No-op if we don't
 * have a matching row. Returns the tenantId we touched, if any.
 */
export async function patchByRazorpayId(
  razorpaySubscriptionId: string,
  patch: {
    status?: string;
    currentPeriodEnd?: number | null;
    cancelAtPeriodEnd?: boolean;
  },
): Promise<string | null> {
  const row = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.razorpaySubscriptionId, razorpaySubscriptionId),
  });
  if (!row) return null;

  await db
    .update(subscriptions)
    .set({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.currentPeriodEnd !== undefined
        ? { currentPeriodEnd: toDate(patch.currentPeriodEnd) }
        : {}),
      ...(patch.cancelAtPeriodEnd !== undefined
        ? { cancelAtPeriodEnd: patch.cancelAtPeriodEnd }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, row.id));
  return row.tenantId;
}
