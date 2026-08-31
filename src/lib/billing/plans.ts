/**
 * Plan catalog + entitlements. Pure and isomorphic (no server-only imports) so
 * both the billing UI and server gating read the same source of truth.
 *
 * Two tiers: `free` (always usable, restricted) and `pro` (paid, unlocks
 * everything). Prices here are for display only — the authoritative amount lives
 * in the Razorpay Plan; edit both together. Amounts are in whole rupees (INR).
 */

export type PlanId = "free" | "pro";
export type BillingCycle = "monthly" | "yearly";

/** Hard limits enforced per plan. `Infinity` = unlimited. */
export interface Entitlements {
  /** Max connected channels (WhatsApp connections + web chat widget). */
  maxChannels: number;
  /** Max team members (staff rows). */
  maxStaff: number;
  /** Max knowledge-base documents. */
  maxKnowledgeDocs: number;
  /** Whether the AI may auto-reply to customers. */
  aiAutoReply: boolean;
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
    name: "Free",
    tagline: "Try the assistant on a single channel.",
    price: null,
    entitlements: {
      maxChannels: 1,
      maxStaff: 2,
      maxKnowledgeDocs: 3,
      aiAutoReply: true,
    },
    features: [
      "1 channel (WhatsApp or web chat)",
      "Up to 2 team members",
      "Up to 3 knowledge documents",
      "AI auto-replies",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Everything, unlimited, for a real business.",
    price: { monthly: 999, yearly: 9990 },
    entitlements: {
      maxChannels: Infinity,
      maxStaff: Infinity,
      maxKnowledgeDocs: Infinity,
      aiAutoReply: true,
    },
    features: [
      "Unlimited channels",
      "Unlimited team members",
      "Unlimited knowledge documents",
      "AI auto-replies",
      "Priority support",
    ],
  },
};

/** Entitlements for a plan id (defaults to Free for anything unknown). */
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
