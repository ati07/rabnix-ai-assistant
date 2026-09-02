import { requireMembership } from "@/lib/tenant";
import { getBillingState } from "@/lib/billing/subscription";
import { isBillingConfigured, planId } from "@/lib/billing/razorpay";
import {
  BillingManager,
  type BillingView,
} from "@/components/dashboard/billing-manager";

export default async function BillingPage() {
  const { tenant, role } = await requireMembership();
  const state = await getBillingState(tenant.id);
  const isOwner = role === "owner";

  // Which tier/cycle combos are actually purchasable (their Razorpay Plan id is
  // configured). Checkout is offered only to owners when billing is wired up.
  const available = {
    basicMonthly: Boolean(planId("basic", "monthly")),
    basicYearly: Boolean(planId("basic", "yearly")),
    proMonthly: Boolean(planId("pro", "monthly")),
    proYearly: Boolean(planId("pro", "yearly")),
  };
  const canCheckout = isOwner && isBillingConfigured();

  const view: BillingView = {
    isOwner,
    canCheckout,
    available,
    plan: state.plan,
    effectivePlan: state.effectivePlan,
    status: state.status,
    billingCycle: state.billingCycle,
    currentPeriodEnd: state.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    subscribed: state.subscribed,
    lifetime: state.lifetime,
    adminComp: state.adminComp,
    trialing: state.trialing,
    trialEndsAt: state.trialEndsAt?.toISOString() ?? null,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Start with a 7-day free trial of Pro. Then choose Basic (web chatbot),
          Pro (WhatsApp + chatbot), or pay once for Lifetime.
        </p>
      </div>
      <BillingManager view={view} />
    </div>
  );
}
