"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/tenant";
import {
  cancelSubscription,
  createCustomer,
  createSubscription,
  fetchSubscription,
  isBillingConfigured,
  proPlanId,
} from "@/lib/billing/razorpay";
import {
  getSubscription,
  patchByRazorpayId,
  upsertSubscription,
} from "@/lib/billing/subscription";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const checkoutSchema = z.object({
  cycle: z.enum(["monthly", "yearly"]),
});

/**
 * Begin a Pro subscription: create/reuse a Razorpay customer, create the
 * subscription against the configured Plan, and persist a `created` row. Returns
 * the subscription id for the browser to open Razorpay Checkout with. Owner-only.
 */
export async function startProCheckout(
  input: z.input<typeof checkoutSchema>,
): Promise<ActionResult<{ subscriptionId: string; keyId: string }>> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Pick a monthly or yearly plan." };
  }
  if (!isBillingConfigured()) {
    return { ok: false, error: "Billing isn't configured yet. Contact support." };
  }
  const planId = proPlanId(parsed.data.cycle);
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!planId || !keyId) {
    return { ok: false, error: "This plan isn't available yet. Contact support." };
  }

  const { tenant, user } = await requireOwner();

  try {
    const existing = await getSubscription(tenant.id);
    // Reuse the Razorpay customer if we've made one for this tenant before.
    const customerId =
      existing?.razorpayCustomerId ??
      (await createCustomer({ name: user.name, email: user.email })).id;

    const sub = await createSubscription({
      planId,
      cycle: parsed.data.cycle,
      customerId,
      notes: { tenant_id: tenant.id },
    });

    await upsertSubscription({
      tenantId: tenant.id,
      sub,
      cycle: parsed.data.cycle,
      customerId,
    });

    return { ok: true, subscriptionId: sub.id, keyId };
  } catch (err) {
    console.error("[billing] checkout start failed:", err);
    return { ok: false, error: "Could not start checkout. Please try again." };
  }
}

/**
 * Re-fetch the subscription from Razorpay and sync our row. Called by the client
 * right after Checkout succeeds so the UI reflects "active" without waiting on
 * the webhook. Owner-only.
 */
export async function syncSubscription(): Promise<ActionResult> {
  const { tenant } = await requireOwner();
  const row = await getSubscription(tenant.id);
  if (!row?.razorpaySubscriptionId) return { ok: true };

  try {
    const sub = await fetchSubscription(row.razorpaySubscriptionId);
    await patchByRazorpayId(sub.id, {
      status: sub.status,
      currentPeriodEnd: sub.current_end ?? null,
    });
    revalidatePath("/dashboard/billing");
    return { ok: true };
  } catch (err) {
    console.error("[billing] sync failed:", err);
    return { ok: false, error: "Could not refresh your subscription." };
  }
}

/**
 * Cancel at cycle end — the tenant keeps Pro until the paid period runs out.
 * Owner-only.
 */
export async function cancelSubscriptionAction(): Promise<ActionResult> {
  const { tenant } = await requireOwner();
  const row = await getSubscription(tenant.id);
  if (!row?.razorpaySubscriptionId) {
    return { ok: false, error: "There's no active subscription to cancel." };
  }

  try {
    const sub = await cancelSubscription(row.razorpaySubscriptionId, {
      atCycleEnd: true,
    });
    await patchByRazorpayId(sub.id, {
      status: sub.status,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: sub.current_end ?? null,
    });
    revalidatePath("/dashboard/billing");
    return { ok: true };
  } catch (err) {
    console.error("[billing] cancel failed:", err);
    return { ok: false, error: "Could not cancel your subscription." };
  }
}
