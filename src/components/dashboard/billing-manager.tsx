"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  cancelSubscriptionAction,
  startCheckout,
  syncSubscription,
} from "@/app/dashboard/billing/actions";
import {
  PLANS,
  LIFETIME_PRICE,
  formatINR,
  yearlySavings,
  type BillingCycle,
  type PaidTier,
  type PlanId,
} from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Which tier/cycle combos have a configured Razorpay Plan id. */
export interface PlanAvailability {
  basicMonthly: boolean;
  basicYearly: boolean;
  proMonthly: boolean;
  proYearly: boolean;
}

export interface BillingView {
  isOwner: boolean;
  canCheckout: boolean;
  available: PlanAvailability;
  plan: PlanId; // the plan the row claims (may be paid-but-lapsed)
  effectivePlan: PlanId; // what actually applies right now
  status: string;
  billingCycle: BillingCycle | null;
  /** ISO string or null. */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  subscribed: boolean; // a paid subscription (recurring or lifetime) is active
  lifetime: boolean;
  trialing: boolean;
  /** ISO string or null. */
  trialEndsAt: string | null;
}

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

// Minimal shape of the global injected by Razorpay Checkout (subscription flow).
interface RazorpayOptions {
  key: string;
  subscription_id: string;
  name: string;
  description?: string;
  handler?: (res: unknown) => void;
  modal?: { ondismiss?: () => void };
  theme?: { color?: string };
}
interface RazorpayInstance {
  open: () => void;
}
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  authenticated: "Active",
  created: "Awaiting payment",
  pending: "Payment pending",
  halted: "Payment failed",
  cancelled: "Cancelled",
  expired: "Expired",
  completed: "Completed",
  inactive: "—",
};

/** Whole days left until an ISO deadline (min 0). */
function daysUntil(iso: string | null): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function BillingManager({ view }: { view: BillingView }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  // Which tier's checkout is currently spinning, so only that button shows a
  // loader (the `busy` transition flag is shared across both plan cards).
  const [pendingTier, setPendingTier] = useState<PaidTier | null>(null);

  const isLifetime = view.lifetime;
  // A recurring paid subscription (not lifetime): the tier the row claims.
  const subscribedTier: PaidTier | null =
    view.subscribed && !isLifetime && (view.plan === "basic" || view.plan === "pro")
      ? view.plan
      : null;
  const trialDaysLeft = view.trialing ? daysUntil(view.trialEndsAt) : 0;
  const locked = !view.subscribed && !view.trialing; // trial ended, nothing paid

  function upgrade(tier: PaidTier, chosen: BillingCycle) {
    setPendingTier(tier);
    startTransition(async () => {
      try {
        const ok = await loadRazorpay();
        if (!ok) {
          toast.error("Couldn't load the payment window. Check your connection.");
          return;
        }
        const res = await startCheckout({ tier, cycle: chosen });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        const rzp = new window.Razorpay!({
          key: res.keyId,
          subscription_id: res.subscriptionId,
          name: "Rabnix AI",
          description: `${PLANS[tier].name} plan (${chosen})`,
          theme: { color: "#4f46e5" },
          handler: () => {
            // Payment authorized — sync now so the UI doesn't wait on the webhook.
            startTransition(async () => {
              await syncSubscription();
              toast.success(`You're on ${PLANS[tier].name}! 🎉`);
              router.refresh();
            });
          },
          modal: {
            ondismiss: () => toast("Checkout closed — you can upgrade anytime."),
          },
        });
        rzp.open();
      } finally {
        // The modal is open (or we bailed) — stop the button spinner.
        setPendingTier(null);
      }
    });
  }

  function cancel() {
    if (!confirm("Cancel your plan? You'll keep access until the end of your paid period."))
      return;
    startTransition(async () => {
      const res = await cancelSubscriptionAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Subscription will end at the period's close.");
      router.refresh();
    });
  }

  const periodEnd = view.currentPeriodEnd
    ? new Date(view.currentPeriodEnd).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  // Headline badge + status line for the "Current plan" card.
  const headline = isLifetime
    ? "Lifetime"
    : subscribedTier
      ? PLANS[subscribedTier].name
      : view.trialing
        ? "Free trial"
        : "Locked";
  const badgeVariant = isLifetime || subscribedTier ? "default" : "secondary";

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Current plan</CardTitle>
          <Badge variant={badgeVariant} className="text-sm">
            {headline}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {isLifetime && (
            <p className="text-muted-foreground">
              You have <span className="text-foreground">Lifetime Pro</span> —
              WhatsApp + web chatbot, unlimited, forever. No renewals.
            </p>
          )}

          {subscribedTier && (
            <>
              <p className="text-muted-foreground">
                Status:{" "}
                <span className="text-foreground">
                  {STATUS_LABEL[view.status] ?? view.status}
                </span>
                {view.billingCycle && <> · billed {view.billingCycle}</>}
              </p>
              {periodEnd && (
                <p className="text-muted-foreground">
                  {view.cancelAtPeriodEnd ? "Access ends" : "Renews"} on{" "}
                  <span className="text-foreground">{periodEnd}</span>
                </p>
              )}
              {!view.cancelAtPeriodEnd && view.isOwner && (
                <div className="pt-2">
                  <Button variant="outline" size="sm" onClick={cancel} disabled={busy}>
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    Cancel subscription
                  </Button>
                </div>
              )}
            </>
          )}

          {view.trialing && !view.subscribed && (
            <p className="text-muted-foreground">
              You&apos;re on a free trial of Pro —{" "}
              <span className="text-foreground">
                {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left
              </span>
              . Pick a plan below to keep going.
            </p>
          )}

          {locked && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Your free trial has ended and the assistant is paused. Choose a plan
              below to switch it back on.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Plan comparison — hidden once you own Lifetime. */}
      {!isLifetime && (
        <>
          {view.canCheckout && (
            <CycleToggle cycle={cycle} onChange={setCycle} />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <PlanCard
              tier="basic"
              cycle={cycle}
              cta={
                <TierCta
                  view={view}
                  tier="basic"
                  cycle={cycle}
                  current={subscribedTier === "basic"}
                  busy={busy}
                  pending={pendingTier === "basic"}
                  onUpgrade={upgrade}
                />
              }
            />
            <PlanCard
              tier="pro"
              cycle={cycle}
              highlight
              cta={
                <TierCta
                  view={view}
                  tier="pro"
                  cycle={cycle}
                  current={subscribedTier === "pro"}
                  busy={busy}
                  pending={pendingTier === "pro"}
                  onUpgrade={upgrade}
                />
              }
            />
          </div>

          {/* Lifetime — pay once. */}
          <Card>
            <CardContent className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center">
              <div>
                <p className="font-medium">
                  Lifetime — {formatINR(LIFETIME_PRICE)} once
                </p>
                <p className="text-sm text-muted-foreground">
                  Pay once, get Pro forever. No monthly bills.
                </p>
              </div>
              {view.isOwner ? (
                <Button asChild variant="outline">
                  <Link href="/dashboard/pay">Buy Lifetime</Link>
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Ask your workspace owner.
                </span>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/** The upgrade/switch/current-plan button for one paid tier. */
function TierCta({
  view,
  tier,
  cycle,
  current,
  busy,
  pending,
  onUpgrade,
}: {
  view: BillingView;
  tier: PaidTier;
  cycle: BillingCycle;
  current: boolean;
  busy: boolean;
  /** True only for the tier whose checkout is in flight. */
  pending: boolean;
  onUpgrade: (tier: PaidTier, cycle: BillingCycle) => void;
}) {
  if (!view.isOwner) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Ask your workspace owner to upgrade.
      </p>
    );
  }
  if (current) {
    return (
      <Button className="w-full" disabled>
        Current plan
      </Button>
    );
  }
  const cycleAvailable =
    cycle === "monthly"
      ? tier === "basic"
        ? view.available.basicMonthly
        : view.available.proMonthly
      : tier === "basic"
        ? view.available.basicYearly
        : view.available.proYearly;

  if (!view.canCheckout || !cycleAvailable) {
    return (
      <Button className="w-full" disabled>
        Not available
      </Button>
    );
  }
  return (
    <Button
      className="w-full"
      onClick={() => onUpgrade(tier, cycle)}
      disabled={busy}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {`Choose ${PLANS[tier].name}`}
    </Button>
  );
}

function CycleToggle({
  cycle,
  onChange,
}: {
  cycle: BillingCycle;
  onChange: (c: BillingCycle) => void;
}) {
  const savings = yearlySavings(PLANS.pro);
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="inline-flex rounded-full border p-1">
        {(["monthly", "yearly"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              "rounded-full px-4 py-1 text-sm font-medium transition-colors",
              cycle === c
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {c === "monthly" ? "Monthly" : "Yearly"}
          </button>
        ))}
      </div>
      {savings > 0 && (
        <span className="text-sm text-muted-foreground">
          Save {formatINR(savings)}/yr on Pro
        </span>
      )}
    </div>
  );
}

function PlanCard({
  tier,
  cycle,
  highlight,
  cta,
}: {
  tier: PaidTier;
  cycle: BillingCycle;
  highlight?: boolean;
  cta: React.ReactNode;
}) {
  const plan = PLANS[tier];
  const price = plan.price
    ? cycle === "yearly"
      ? { amount: plan.price.yearly, unit: "/yr" }
      : { amount: plan.price.monthly, unit: "/mo" }
    : null;

  return (
    <Card className={cn(highlight && "border-primary shadow-sm")}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {plan.name}
          {highlight && <Badge>Recommended</Badge>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{plan.tagline}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          {price && (
            <p className="text-2xl font-semibold">
              {formatINR(price.amount)}
              <span className="text-base font-normal text-muted-foreground">
                {price.unit}
              </span>
            </p>
          )}
        </div>
        <ul className="space-y-2 text-sm">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        {cta}
      </CardContent>
    </Card>
  );
}
