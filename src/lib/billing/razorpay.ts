import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import type { BillingCycle } from "@/lib/billing/plans";

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

/** The configured Razorpay Plan id for the Pro tier at a given cycle, if set. */
export function proPlanId(cycle: BillingCycle): string | undefined {
  return cycle === "yearly"
    ? env.RAZORPAY_PLAN_PRO_YEARLY
    : env.RAZORPAY_PLAN_PRO_MONTHLY;
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

/** Idempotently create (or reuse) a Razorpay customer for a tenant. */
export async function createCustomer(input: {
  name: string;
  email: string;
}): Promise<RazorpayCustomer> {
  return razorpayFetch<RazorpayCustomer>("/customers", {
    method: "POST",
    // fail_existing=0 → return the existing customer instead of erroring.
    body: { name: input.name, email: input.email, fail_existing: 0 },
  });
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
