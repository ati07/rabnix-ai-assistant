"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resendVerificationAction, signOutAction } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";

/**
 * Buttons for the "check your inbox" verify screen: resend the confirmation
 * email, and sign out (to switch accounts). The page itself is a server
 * component; these need client state for the loading/cooldown UI.
 */
export function VerifyEmailActions({ email }: { email: string }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  async function onResend() {
    setSending(true);
    try {
      const result = await resendVerificationAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Verification link sent to ${email}.`);
      // Brief cooldown to discourage hammering the button.
      setCooldown(true);
      setTimeout(() => setCooldown(false), 30_000);
    } catch {
      toast.error("Could not resend the email. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function onSignOut() {
    await signOutAction();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        onClick={onResend}
        disabled={sending || cooldown}
        className="h-10 w-full font-medium"
      >
        {sending
          ? "Sending…"
          : cooldown
            ? "Sent — check your inbox"
            : "Resend verification email"}
      </Button>
      <button
        onClick={onSignOut}
        className="text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        Sign out
      </button>
    </div>
  );
}
