import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/tenant";
import { fetchOrder, verifyPaymentSignature } from "@/lib/billing/razorpay";
import { upsertLifetime } from "@/lib/billing/subscription";
import { LIFETIME_PRICE } from "@/lib/billing/plans";

export const runtime = "nodejs";

/**
 * Verify a Razorpay Checkout payment and, when it's a genuine full-price
 * Lifetime order, grant the tenant Pro forever.
 *
 * Defence in depth: the HMAC signature proves the payment belongs to the order,
 * then we re-fetch the order from Razorpay to confirm it was the one *we* created
 * for *this* tenant at the full Lifetime price (its amount and notes were set
 * server-side). Only then do we upsert the Lifetime subscription.
 */
const bodySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(req: Request) {
  let tenant;
  try {
    ({ tenant } = await requireOwner());
  } catch {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Missing payment fields." },
      { status: 400 },
    );
  }

  const valid = verifyPaymentSignature({
    orderId: parsed.data.razorpay_order_id,
    paymentId: parsed.data.razorpay_payment_id,
    signature: parsed.data.razorpay_signature,
  });
  if (!valid) {
    // Signature mismatch — do NOT treat as paid.
    return Response.json(
      { ok: false, error: "Payment verification failed." },
      { status: 400 },
    );
  }

  // Signature is authentic. Re-read the order server-side and confirm it's the
  // Lifetime order we created for this tenant, at the full price, and paid.
  try {
    const order = await fetchOrder(parsed.data.razorpay_order_id);
    const okOrder =
      order.notes?.purpose === "lifetime" &&
      order.notes?.tenant_id === tenant.id &&
      order.amount === LIFETIME_PRICE * 100 &&
      order.status === "paid";
    if (!okOrder) {
      console.warn("[verify-payment] order mismatch", {
        tenant: tenant.id,
        order: order.id,
        status: order.status,
        amount: order.amount,
      });
      return Response.json(
        { ok: false, error: "This payment can't be applied to your account." },
        { status: 400 },
      );
    }

    await upsertLifetime({
      tenantId: tenant.id,
      paymentId: parsed.data.razorpay_payment_id,
    });
    revalidatePath("/dashboard/billing");
    return Response.json({ ok: true, plan: "lifetime" });
  } catch (err) {
    console.error("[verify-payment] grant failed:", err);
    return Response.json(
      { ok: false, error: "We couldn't confirm your payment. Contact support." },
      { status: 500 },
    );
  }
}
