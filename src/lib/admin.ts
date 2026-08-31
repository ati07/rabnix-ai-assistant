import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  conversations,
  documents,
  messages,
  staff,
  subscriptions,
  tenants,
  users,
} from "@/lib/db/schema";
import { effectivePlan, type Subscription } from "@/lib/billing/subscription";
import { PLANS, type BillingCycle, type PaidTier, type PlanId } from "@/lib/billing/plans";

/**
 * Platform-admin data helpers (the `/admin` god-view). These read across ALL
 * tenants and must only ever be called behind `requirePlatformAdmin()`.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Monthly-equivalent recurring revenue (whole rupees) for a paid tier's cycle.
 * Lifetime purchases are one-time, not recurring, so they contribute 0 to MRR.
 */
export function monthlyRevenueFor(
  tier: PaidTier,
  cycle: BillingCycle | null,
): number {
  const price = PLANS[tier].price;
  if (!price || cycle === null) return 0;
  return cycle === "yearly" ? Math.round(price.yearly / 12) : price.monthly;
}

export interface PlatformStats {
  totalTenants: number;
  suspendedTenants: number;
  proTenants: number;
  newTenants30d: number;
  activeTenants7d: number;
  totalMessages: number;
  /** Monthly recurring revenue in whole rupees (sum of active Pro subs). */
  mrr: number;
}

/** Aggregate KPIs for the admin overview. */
export async function getPlatformStats(): Promise<PlatformStats> {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY_MS);
  const since7 = new Date(now - 7 * DAY_MS);

  const [
    [{ n: totalTenants }],
    [{ n: suspendedTenants }],
    [{ n: newTenants30d }],
    [{ n: totalMessages }],
    [{ n: activeTenants7d }],
    paidSubs,
  ] = await Promise.all([
    db.select({ n: count() }).from(tenants),
    db
      .select({ n: count() })
      .from(tenants)
      .innerJoin(users, eq(tenants.ownerUserId, users.id))
      .where(eq(users.banned, true)),
    db.select({ n: count() }).from(tenants).where(gte(tenants.createdAt, since30)),
    db.select({ n: count() }).from(messages),
    db
      .select({ n: sql<number>`count(distinct ${messages.tenantId})::int` })
      .from(messages)
      .where(gte(messages.createdAt, since7)),
    db
      .select()
      .from(subscriptions)
      .where(inArray(subscriptions.plan, ["basic", "pro"])),
  ]);

  // Active-paid filter + MRR are computed in JS so we reuse the single source of
  // truth (`effectivePlan`) rather than re-encoding the status rules in SQL. The
  // trial window is irrelevant here — these are paid rows. Lifetime rows count as
  // a Pro tenant but add 0 MRR (they don't recur).
  let proTenants = 0;
  let mrr = 0;
  for (const sub of paidSubs as Subscription[]) {
    const tier = effectivePlan(sub, null);
    if (tier === "free") continue; // lapsed/inactive
    if (tier === "pro") proTenants += 1;
    if (!sub.lifetime) {
      mrr += monthlyRevenueFor(tier, sub.billingCycle as BillingCycle | null);
    }
  }

  return {
    totalTenants,
    suspendedTenants,
    proTenants,
    newTenants30d,
    activeTenants7d,
    totalMessages,
    mrr,
  };
}

export interface AdminTenantRow {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  suspended: boolean;
  plan: PlanId; // effective plan (pro only while active)
  status: string;
  billingCycle: BillingCycle | null;
  staffCount: number;
  conversationCount: number;
  messageCount: number;
  documentCount: number;
}

/** One counts-by-tenant map, keyed by tenantId. */
async function countsByTenant(
  table: typeof staff | typeof conversations | typeof messages | typeof documents,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ tenantId: table.tenantId, n: count() })
    .from(table)
    .groupBy(table.tenantId);
  return new Map(rows.map((r) => [r.tenantId, r.n]));
}

/** All tenants with owner, plan, and activity counts, newest first. */
export async function listTenants(limit = 200): Promise<AdminTenantRow[]> {
  const [rows, staffCounts, convCounts, msgCounts, docCounts] = await Promise.all([
    db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        createdAt: tenants.createdAt,
        trialEndsAt: tenants.trialEndsAt,
        ownerUserId: tenants.ownerUserId,
        ownerName: users.name,
        ownerEmail: users.email,
        banned: users.banned,
        plan: subscriptions.plan,
        status: subscriptions.status,
        billingCycle: subscriptions.billingCycle,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(tenants)
      .leftJoin(users, eq(tenants.ownerUserId, users.id))
      .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
      .orderBy(desc(tenants.createdAt))
      .limit(limit),
    countsByTenant(staff),
    countsByTenant(conversations),
    countsByTenant(messages),
    countsByTenant(documents),
  ]);

  return rows.map((r) => {
    const sub =
      r.plan != null
        ? ({
            plan: r.plan,
            status: r.status,
            currentPeriodEnd: r.currentPeriodEnd,
          } as Subscription)
        : null;
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      createdAt: r.createdAt,
      ownerUserId: r.ownerUserId,
      ownerName: r.ownerName,
      ownerEmail: r.ownerEmail,
      suspended: Boolean(r.banned),
      plan: effectivePlan(sub, r.trialEndsAt),
      status: r.status ?? "inactive",
      billingCycle: (r.billingCycle as BillingCycle | null) ?? null,
      staffCount: staffCounts.get(r.id) ?? 0,
      conversationCount: convCounts.get(r.id) ?? 0,
      messageCount: msgCounts.get(r.id) ?? 0,
      documentCount: docCounts.get(r.id) ?? 0,
    };
  });
}

/** Look up the owner user id for a tenant (used by suspend/impersonate). */
export async function tenantOwnerUserId(tenantId: string): Promise<string | null> {
  const row = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { ownerUserId: true },
  });
  return row?.ownerUserId ?? null;
}

/** Guard helper: is this user a platform admin (by id)? */
export async function isPlatformAdminId(userId: string): Promise<boolean> {
  const row = await db.query.users.findFirst({
    where: and(eq(users.id, userId), eq(users.role, "platform_admin")),
    columns: { id: true },
  });
  return Boolean(row);
}
