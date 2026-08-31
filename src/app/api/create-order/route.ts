import { requireOwner } from "@/lib/tenant";
import { createOrder, isBillingConfigured } from "@/lib/billing/razorpay";
import { LIFETIME_PRICE } from "@/lib/billing/plans";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Create the one-time Razorpay order for the Lifetime plan (Pro forever).
 *
 * The amount is fixed server-side to {@link LIFETIME_PRICE} — the browser cannot
 * choose it — and the order is tagged with the tenant id + purpose so
 * /api/verify-payment can re-read them and grant Lifetime only for a genuine
 * full-price order. Owner-only. KEY_SECRET never leaves the server.
 */
export async function POST() {
  let tenant;
  try {
    ({ tenant } = await requireOwner());
  } catch {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isBillingConfigured()) {
    return Response.json(
      { ok: false, error: "Payments are not configured." },
      { status: 503 },
    );
  }

  try {
    const order = await createOrder({
      amount: LIFETIME_PRICE * 100, // paise
      currency: "INR",
      receipt: `lifetime_${tenant.id.slice(0, 8)}_${Date.now()}`.slice(0, 40),
      notes: { tenant_id: tenant.id, purpose: "lifetime" },
    });
    return Response.json({
      ok: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("[create-order] failed:", err);
    const status = err instanceof Error && err.message.includes("401") ? 401 : 500;
    return Response.json(
      { ok: false, error: "Could not create the order. Please try again." },
      { status },
    );
  }
}
