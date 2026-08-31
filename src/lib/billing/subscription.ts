import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, subscriptions } from "@/lib/db/schema";
import {
  entitlementsFor,
  type BillingCycle,
  type Entitlements,
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

/**
 * The plan a tenant is *effectively* on right now. Pro only while a Pro
 * subscription is in an access-granting status and its paid period hasn't
 * lapsed; otherwise Free. This is the single source of truth for gating.
 */
export function effectivePlan(sub: Subscription | null): PlanId {
  if (!sub || sub.plan !== "pro") return "free";
  if (!ACCESS_STATUSES.has(sub.status)) return "free";
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() <= Date.now()) {
    return "free";
  }
  return "pro";
}

/** Entitlements for the tenant's effective plan. */
export async function getEntitlements(tenantId: string): Promise<Entitlements> {
  const sub = await getSubscription(tenantId);
  return entitlementsFor(effectivePlan(sub));
}

/** Convenience: is the tenant on an active Pro plan right now? */
export async function isProActive(tenantId: string): Promise<boolean> {
  return effectivePlan(await getSubscription(tenantId)) === "pro";
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
  plan: PlanId; // the plan the row claims (may be Pro-but-lapsed)
  effectivePlan: PlanId; // what actually applies right now
  status: string;
  billingCycle: BillingCycle | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  razorpaySubscriptionId: string | null;
}

/** Everything the billing UI needs about a tenant's current plan. */
export async function getBillingState(tenantId: string): Promise<BillingState> {
  const sub = await getSubscription(tenantId);
  return {
    plan: (sub?.plan as PlanId) ?? "free",
    effectivePlan: effectivePlan(sub),
    status: sub?.status ?? "inactive",
    billingCycle: (sub?.billingCycle as BillingCycle | null) ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    razorpaySubscriptionId: sub?.razorpaySubscriptionId ?? null,
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
  sub: RazorpaySubscription;
  cycle?: BillingCycle;
  customerId?: string | null;
  cancelAtPeriodEnd?: boolean;
}): Promise<void> {
  const { tenantId, sub } = input;
  const values = {
    tenantId,
    plan: "pro" as const,
    status: sub.status,
    billingCycle: input.cycle ?? null,
    razorpayCustomerId: input.customerId ?? sub.customer_id ?? null,
    razorpaySubscriptionId: sub.id,
    currentPeriodEnd: toDate(sub.current_end),
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
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
        ...(input.cycle ? { billingCycle: input.cycle } : {}),
        plan: "pro" as const,
        updatedAt: values.updatedAt,
      },
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
