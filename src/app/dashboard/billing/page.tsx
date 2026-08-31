import { requireMembership } from "@/lib/tenant";
import { getBillingState } from "@/lib/billing/subscription";
import { isBillingConfigured, proPlanId } from "@/lib/billing/razorpay";
import {
  BillingManager,
  type BillingView,
} from "@/components/dashboard/billing-manager";

export default async function BillingPage() {
  const { tenant, role } = await requireMembership();
  const state = await getBillingState(tenant.id);

  // Owners manage billing; a monthly or yearly Pro plan must be configured for
  // checkout to be offered at all.
  const canCheckout =
    role === "owner" &&
    isBillingConfigured() &&
    Boolean(proPlanId("monthly") || proPlanId("yearly"));

  const view: BillingView = {
    isOwner: role === "owner",
    canCheckout,
    monthlyAvailable: Boolean(proPlanId("monthly")),
    yearlyAvailable: Boolean(proPlanId("yearly")),
    plan: state.plan,
    effectivePlan: state.effectivePlan,
    status: state.status,
    billingCycle: state.billingCycle,
    currentPeriodEnd: state.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your plan. Pro unlocks unlimited channels, team members, and
          knowledge — billed monthly or yearly and auto-renewed.
        </p>
      </div>
      <BillingManager view={view} />
    </div>
  );
}
