"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/* Minimal typings for the Checkout.js global (no SDK). */
interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  handler: (response: RazorpaySuccess) => void;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}
interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", cb: (e: { error: { description?: string } }) => void) => void;
}
type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

/**
 * Read the Checkout.js global via a local cast rather than a `declare global`
 * augmentation — the subscription flow (billing-manager.tsx) already augments
 * `Window.Razorpay` with a different (subscription_id) options shape, and two
 * global declarations would collide.
 */
function getRazorpay(): RazorpayConstructor | undefined {
  return (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
}

/**
 * Lifetime purchase button (one-time Razorpay Standard Checkout): creates the
 * fixed-price order server-side, opens the Checkout modal, then verifies the
 * returned signature server-side — which grants the tenant Pro forever.
 */
export function RazorpayCheckoutButton({
  label = "Buy Lifetime",
  prefill,
}: {
  label?: string;
  prefill?: { name?: string; email?: string };
}) {
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pay() {
    const Razorpay = getRazorpay();
    if (!Razorpay) {
      toast.error("Checkout is still loading — try again in a moment.");
      return;
    }
    setBusy(true);
    try {
      // The server fixes the amount (Lifetime price) and tags the order.
      const orderRes = await fetch("/api/create-order", { method: "POST" });
      const order = await orderRes.json();
      if (!orderRes.ok || !order.ok) {
        toast.error(order.error ?? "Could not start the payment.");
        setBusy(false);
        return;
      }

      const rzp = new Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Rabnix",
        description: "Lifetime — Pro forever",
        order_id: order.order_id,
        prefill,
        theme: { color: "#6366f1" },
        handler: async (response) => {
          try {
            const verifyRes = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            });
            const verify = await verifyRes.json();
            if (verifyRes.ok && verify.ok) {
              toast.success("You're on Lifetime Pro! 🎉");
              router.refresh();
            } else {
              toast.error(verify.error ?? "Payment could not be verified.");
            }
          } catch {
            toast.error("Could not reach the verification server.");
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            toast("Payment cancelled.");
            setBusy(false);
          },
        },
      });

      rzp.on("payment.failed", (e) => {
        toast.error(e.error?.description ?? "Payment failed.");
        setBusy(false);
      });

      rzp.open();
    } catch (err) {
      console.error("[checkout] failed to start:", err);
      toast.error("Something went wrong starting the payment.");
      setBusy(false);
    }
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <Button onClick={pay} disabled={busy || !scriptReady}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {scriptReady ? label : "Loading checkout…"}
      </Button>
    </>
  );
}
