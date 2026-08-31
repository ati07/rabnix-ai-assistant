import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import type { BillingCycle, PaidTier } from "@/lib/billing/plans";

/**
 * Minimal Razorpay client over raw HTTP (no SDK) — matching the codebase's
 * lean-dependency ethos (see the Resend + Cloud API seams). Handles the
 * Subscriptions API we need plus webhook signature verification.
 *
 * Auth is HTTP Basic with `key_id:key_secret`. All amounts Razorpay returns are
 * in paise; we don't deal with amounts here (the Plan holds the price).
 */

const API_BASE = "https://api.razorpay.com/v1";

/** Whether Razorpay API credentials are present (checkout can be attempted). */
export function isBillingConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

/** The configured Razorpay Plan id for a paid tier at a given cycle, if set. */
export function planId(tier: PaidTier, cycle: BillingCycle): string | undefined {
  const map = {
    basic: {
      monthly: env.RAZORPAY_PLAN_BASIC_MONTHLY,
      yearly: env.RAZORPAY_PLAN_BASIC_YEARLY,
    },
    pro: {
      monthly: env.RAZORPAY_PLAN_PRO_MONTHLY,
      yearly: env.RAZORPAY_PLAN_PRO_YEARLY,
    },
  } as const;
  return map[tier][cycle];
}

/**
 * Reverse-map a Razorpay plan id back to our tier (for webhooks, which carry the
 * plan id but not our tier). Returns undefined if it matches no configured plan.
 */
export function tierForPlanId(rzpPlanId: string): PaidTier | undefined {
  if (
    rzpPlanId === env.RAZORPAY_PLAN_BASIC_MONTHLY ||
    rzpPlanId === env.RAZORPAY_PLAN_BASIC_YEARLY
  ) {
    return "basic";
  }
  if (
    rzpPlanId === env.RAZORPAY_PLAN_PRO_MONTHLY ||
    rzpPlanId === env.RAZORPAY_PLAN_PRO_YEARLY
  ) {
    return "pro";
  }
  return undefined;
}

function authHeader(): string {
  const token = Buffer.from(
    `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
  ).toString("base64");
  return `Basic ${token}`;
}

async function razorpayFetch<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  if (!isBillingConfigured()) {
    throw new Error("Razorpay is not configured (set RAZORPAY_KEY_ID/SECRET).");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    // Razorpay returns { error: { description } }; surface it without secrets.
    let detail = text.slice(0, 300);
    try {
      detail = JSON.parse(text)?.error?.description ?? detail;
    } catch {
      /* keep raw */
    }
    throw new Error(`Razorpay ${res.status}: ${detail}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export interface RazorpayCustomer {
  id: string;
  entity: "customer";
  name?: string;
  email?: string;
}

export interface RazorpaySubscription {
  id: string;
  entity: "subscription";
  plan_id: string;
  customer_id?: string;
  status: string;
  current_end?: number | null; // unix seconds
  current_start?: number | null;
  charge_at?: number | null;
  short_url?: string;
  notes?: Record<string, string>;
}

/**
 * Create a Razorpay customer for a tenant, best-effort. `fail_existing=0` asks
 * Razorpay to return an existing customer instead of erroring, but that only
 * dedupes on contact — an email-only re-create still 400s with "Customer
 * already exists". A customer is optional for a subscription, so we swallow that
 * case and return null; the caller then creates the subscription without one.
 */
export async function createCustomer(input: {
  name: string;
  email: string;
}): Promise<RazorpayCustomer | null> {
  try {
    return await razorpayFetch<RazorpayCustomer>("/customers", {
      method: "POST",
      body: { name: input.name, email: input.email, fail_existing: 0 },
    });
  } catch (err) {
    if (err instanceof Error && /already exists/i.test(err.message)) return null;
    throw err;
  }
}

/**
 * Create a subscription against a Pro Plan. `total_count` is Razorpay-required;
 * we set it high so the subscription runs until the customer cancels.
 */
export async function createSubscription(input: {
  planId: string;
  cycle: BillingCycle;
  customerId?: string;
  notes?: Record<string, string>;
}): Promise<RazorpaySubscription> {
  // Monthly: ~10 years of charges; yearly: 10 charges. Cancelling ends it early.
  const totalCount = input.cycle === "yearly" ? 10 : 120;
  return razorpayFetch<RazorpaySubscription>("/subscriptions", {
    method: "POST",
    body: {
      plan_id: input.planId,
      total_count: totalCount,
      customer_notify: 1,
      ...(input.customerId ? { customer_id: input.customerId } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    },
  });
}

export async function fetchSubscription(
  subscriptionId: string,
): Promise<RazorpaySubscription> {
  return razorpayFetch<RazorpaySubscription>(`/subscriptions/${subscriptionId}`, {
    method: "GET",
  });
}

/**
 * Cancel a subscription. By default at cycle end so the customer keeps access
 * through the period they've paid for.
 */
export async function cancelSubscription(
  subscriptionId: string,
  opts: { atCycleEnd?: boolean } = {},
): Promise<RazorpaySubscription> {
  return razorpayFetch<RazorpaySubscription>(
    `/subscriptions/${subscriptionId}/cancel`,
    {
      method: "POST",
      body: { cancel_at_cycle_end: opts.atCycleEnd ? 1 : 0 },
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Orders (one-time Standard Checkout).                                        */
/*                                                                             */
/* Separate from the Subscriptions flow above: this powers a one-off payment   */
/* (create an order → open Checkout → verify the returned signature) and needs */
/* only KEY_ID/KEY_SECRET, no Plan ids.                                        */
/* -------------------------------------------------------------------------- */

export interface RazorpayOrder {
  id: string;
  entity: "order";
  amount: number; // paise
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt?: string;
  status: string;
  notes?: Record<string, string>;
}

/** Create a one-time order. `amount` is in paise (Razorpay's minimum is 100). */
export async function createOrder(input: {
  amount: number;
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  return razorpayFetch<RazorpayOrder>("/orders", {
    method: "POST",
    body: {
      amount: input.amount,
      currency: input.currency ?? "INR",
      ...(input.receipt ? { receipt: input.receipt } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    },
  });
}

/**
 * Fetch an order back from Razorpay. Used at verify time to re-read the
 * server-set amount and notes (tenant_id, purpose) so a valid signature on a
 * tampered/cheap order can't unlock a paid entitlement.
 */
export async function fetchOrder(orderId: string): Promise<RazorpayOrder> {
  return razorpayFetch<RazorpayOrder>(`/orders/${orderId}`, { method: "GET" });
}

/**
 * Verify a Checkout payment: HMAC-SHA256(`${orderId}|${paymentId}`, keySecret)
 * as hex, constant-time compared to the `razorpay_signature` Checkout returns.
 * Returns false when unconfigured or mismatched — never mark an order paid
 * unless this is true.
 */
export function verifyPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string | null | undefined;
}): boolean {
  if (!env.RAZORPAY_KEY_SECRET || !input.signature) return false;
  const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verify a Razorpay webhook signature: HMAC-SHA256(rawBody, webhookSecret) as
 * hex, constant-time compared to the `x-razorpay-signature` header. Returns
 * false when unconfigured or mismatched.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
