import { requireMembership } from "@/lib/tenant";
import { isBillingConfigured } from "@/lib/billing/razorpay";
import { LIFETIME_PRICE, formatINR } from "@/lib/billing/plans";
import { RazorpayCheckoutButton } from "@/components/pay/razorpay-checkout-button";

export const metadata = { title: "Lifetime — pay once" };

/**
 * One-time Lifetime purchase: pay {@link LIFETIME_PRICE} once and get Pro
 * (WhatsApp + web chatbot, unlimited) forever — no renewals. Uses Razorpay
 * Standard Checkout (order → verify), separate from the recurring subscriptions
 * at /dashboard/billing.
 */
export default async function PayPage() {
  const { user, role } = await requireMembership();
  const configured = isBillingConfigured();
  const isOwner = role === "owner";

  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">Lifetime — pay once</h1>
      <p className="text-sm text-muted-foreground">
        Pay <strong>{formatINR(LIFETIME_PRICE)}</strong> once and unlock Pro
        (WhatsApp + web chatbot, unlimited) forever — no monthly bills, no
        renewals.
      </p>
      <p className="text-xs text-muted-foreground">
        In test mode use card{" "}
        <code className="rounded bg-muted px-1">4111 1111 1111 1111</code>, any
        future expiry and any CVV.
      </p>
      {!configured ? (
        <p className="text-sm text-destructive">
          Payments aren&apos;t configured. Set RAZORPAY_KEY_ID and
          RAZORPAY_KEY_SECRET in <code>.env</code>, then restart the dev server.
        </p>
      ) : !isOwner ? (
        <p className="text-sm text-muted-foreground">
          Only the workspace owner can purchase the Lifetime plan.
        </p>
      ) : (
        <RazorpayCheckoutButton
          label={`Buy Lifetime — ${formatINR(LIFETIME_PRICE)}`}
          prefill={{ name: user.name, email: user.email }}
        />
      )}
    </div>
  );
}
