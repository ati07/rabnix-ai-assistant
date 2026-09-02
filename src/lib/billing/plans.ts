/**
 * Plan catalog + entitlements. Pure and isomorphic (no server-only imports) so
 * both the billing UI and server gating read the same source of truth.
 *
 * Tiers:
 *   free  — the 7-day trial grants full Pro; once it lapses (and nothing is
 *           paid) the tenant falls to these locked entitlements.
 *   basic — paid, web chatbot only (no WhatsApp).
 *   pro   — paid, WhatsApp + web chatbot, unlimited.
 *
 * A one-time Lifetime purchase (see {@link LIFETIME_PRICE}) grants Pro
 * entitlements forever — it isn't a separate tier, it's a Pro subscription row
 * flagged `lifetime` that never expires.
 *
 * Prices here are for display only — the authoritative recurring amount lives in
 * the Razorpay Plan; edit both together. Amounts are in whole rupees (INR).
 */

export type PlanId = "free" | "basic" | "pro";
export type BillingCycle = "monthly" | "yearly";
/** The tiers a customer can actually subscribe to (free is the trial fallback). */
export type PaidTier = "basic" | "pro";

/** Length of the free trial, in days. New tenants get full Pro for this long. */
export const TRIAL_DAYS = 7;

/** One-time price (whole rupees) that unlocks Pro forever. */
export const LIFETIME_PRICE = 20000;

/** Hard limits + feature flags enforced per plan. `Infinity` = unlimited. */
export interface Entitlements {
  /** Max connected channels (WhatsApp connections + web chat widget). */
  maxChannels: number;
  /** Max team members (staff rows). */
  maxStaff: number;
  /** Max knowledge-base documents. */
  maxKnowledgeDocs: number;
  /** Whether the AI may auto-reply to customers. */
  aiAutoReply: boolean;
  /** May connect a WhatsApp channel (Cloud API / Baileys). Pro-only. */
  whatsapp: boolean;
  /** May use the embeddable web chat widget. Basic and Pro. */
  webChat: boolean;
}

export interface PlanDef {
  id: PlanId;
  name: string;
  tagline: string;
  /** Display prices in whole rupees. `null` for the free plan. */
  price: { monthly: number; yearly: number } | null;
  entitlements: Entitlements;
  /** Bullet points for the pricing table. */
  features: string[];
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: "free",
    name: "Free trial",
    tagline: "7 days of full Pro — then pick a plan to keep going.",
    price: null,
    // Locked entitlements once the trial lapses and nothing is paid. During the
    // trial the tenant is *effectively* Pro (see effectivePlan), so these only
    // ever apply after expiry: the assistant goes quiet until they subscribe.
    entitlements: {
      maxChannels: 0,
      maxStaff: 1,
      maxKnowledgeDocs: 0,
      aiAutoReply: false,
      whatsapp: false,
      webChat: false,
    },
    features: [
      "Full Pro access for 7 days",
      "WhatsApp + web chatbot",
      "No card required to start",
    ],
  },
  basic: {
    id: "basic",
    name: "Basic",
    tagline: "Web chatbot for your site.",
    price: { monthly: 999, yearly: 9990 },
    entitlements: {
      maxChannels: 1,
      maxStaff: 3,
      maxKnowledgeDocs: 25,
      aiAutoReply: true,
      whatsapp: false,
      webChat: true,
    },
    features: [
      "Embeddable web chatbot",
      "AI auto-replies",
      "Up to 3 team members",
      "Up to 25 knowledge documents",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "WhatsApp + web chatbot, unlimited.",
    price: { monthly: 1499, yearly: 14990 },
    entitlements: {
      maxChannels: Infinity,
      maxStaff: Infinity,
      maxKnowledgeDocs: Infinity,
      aiAutoReply: true,
      whatsapp: true,
      webChat: true,
    },
    features: [
      "Everything in Basic",
      "WhatsApp channel",
      "Unlimited channels & team members",
      "Unlimited knowledge documents",
      "Priority support",
    ],
  },
};

/** Entitlements for a plan id (defaults to Free/locked for anything unknown). */
export function entitlementsFor(plan: PlanId | string | null | undefined): Entitlements {
  return (plan && PLANS[plan as PlanId]?.entitlements) || PLANS.free.entitlements;
}

/** The saving (in rupees) of paying yearly vs 12× monthly. */
export function yearlySavings(plan: PlanDef): number {
  if (!plan.price) return 0;
  return plan.price.monthly * 12 - plan.price.yearly;
}

/** Format whole rupees as e.g. "₹9,990". */
export function formatINR(rupees: number): string {
  return `₹${rupees.toLocaleString("en-IN")}`;
}
