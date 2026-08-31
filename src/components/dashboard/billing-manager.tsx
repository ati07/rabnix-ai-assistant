"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  cancelSubscriptionAction,
  startProCheckout,
  syncSubscription,
} from "@/app/dashboard/billing/actions";
import {
  PLANS,
  formatINR,
  yearlySavings,
  type BillingCycle,
  type PlanId,
} from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface BillingView {
  isOwner: boolean;
  canCheckout: boolean;
  monthlyAvailable: boolean;
  yearlyAvailable: boolean;
  plan: PlanId;
  effectivePlan: PlanId;
  status: string;
  billingCycle: BillingCycle | null;
  /** ISO string or null. */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

// Minimal shape of the global injected by Razorpay Checkout.
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

export function BillingManager({ view }: { view: BillingView }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [cycle, setCycle] = useState<BillingCycle>(
    view.yearlyAvailable && !view.monthlyAvailable ? "yearly" : "monthly",
  );

  const isPro = view.effectivePlan === "pro";
  const lapsed = view.plan === "pro" && view.effectivePlan !== "pro";

  function upgrade(chosen: BillingCycle) {
    startTransition(async () => {
      const ok = await loadRazorpay();
      if (!ok) {
        toast.error("Couldn't load the payment window. Check your connection.");
        return;
      }
      const res = await startProCheckout({ cycle: chosen });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const rzp = new window.Razorpay!({
        key: res.keyId,
        subscription_id: res.subscriptionId,
        name: "Rabnix AI",
        description: `Pro plan (${chosen})`,
        theme: { color: "#4f46e5" },
        handler: () => {
          // Payment authorized — sync now so the UI doesn't wait on the webhook.
          startTransition(async () => {
            await syncSubscription();
            toast.success("You're on Pro! 🎉");
            router.refresh();
          });
        },
        modal: {
          ondismiss: () => toast("Checkout closed — you can upgrade anytime."),
        },
      });
      rzp.open();
    });
  }

  function cancel() {
    if (!confirm("Cancel Pro? You'll keep access until the end of your paid period."))
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

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Current plan</CardTitle>
          <Badge variant={isPro ? "default" : "secondary"} className="text-sm">
            {isPro ? "Pro" : "Free"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Status: <span className="text-foreground">{STATUS_LABEL[view.status] ?? view.status}</span>
            {view.billingCycle && isPro && <> · billed {view.billingCycle}</>}
          </p>
          {isPro && periodEnd && (
            <p className="text-muted-foreground">
              {view.cancelAtPeriodEnd ? "Access ends" : "Renews"} on{" "}
              <span className="text-foreground">{periodEnd}</span>
            </p>
          )}
          {lapsed && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Your Pro subscription is no longer active — you&apos;ve reverted to the
              Free plan&apos;s limits. Re-subscribe below to restore Pro.
            </p>
          )}
          {isPro && !view.cancelAtPeriodEnd && view.isOwner && (
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={cancel} disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Cancel subscription
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan comparison */}
      {!isPro && (
        <>
          {view.canCheckout && view.monthlyAvailable && view.yearlyAvailable && (
            <CycleToggle cycle={cycle} onChange={setCycle} />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <PlanCard planId="free" highlight={false} />
            <PlanCard
              planId="pro"
              highlight
              cycle={cycle}
              cta={
                view.isOwner ? (
                  view.canCheckout ? (
                    <Button
                      className="w-full"
                      onClick={() => upgrade(cycle)}
                      disabled={busy}
                    >
                      {busy && <Loader2 className="size-4 animate-spin" />}
                      Upgrade to Pro
                    </Button>
                  ) : (
                    <Button className="w-full" disabled>
                      Billing not configured
                    </Button>
                  )
                ) : (
                  <p className="text-center text-sm text-muted-foreground">
                    Ask your workspace owner to upgrade.
                  </p>
                )
              }
            />
          </div>
        </>
      )}
    </div>
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
          Save {formatINR(savings)}/yr
        </span>
      )}
    </div>
  );
}

function PlanCard({
  planId,
  highlight,
  cycle,
  cta,
}: {
  planId: PlanId;
  highlight: boolean;
  cycle?: BillingCycle;
  cta?: React.ReactNode;
}) {
  const plan = PLANS[planId];
  const price =
    plan.price && cycle
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
          {price ? (
            <p className="text-2xl font-semibold">
              {formatINR(price.amount)}
              <span className="text-base font-normal text-muted-foreground">
                {price.unit}
              </span>
            </p>
          ) : (
            <p className="text-2xl font-semibold">Free</p>
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
