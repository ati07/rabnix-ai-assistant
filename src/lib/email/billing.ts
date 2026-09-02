import { clientEnv } from "@/lib/env";
import { isEmailConfigured, sendEmail } from "@/lib/email";

/** Absolute URL to the billing page (where owners manage their plan). */
export function billingUrl(): string {
  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  return `${base}/dashboard/billing`;
}

/**
 * Dunning email when a subscription charge fails. `halted` distinguishes the
 * final state (retries exhausted, access paused) from an in-progress retry.
 * Best-effort — returns false when no email provider is configured.
 */
export async function sendPaymentFailedEmail(input: {
  to: string;
  name: string;
  tenantName: string;
  halted: boolean;
}): Promise<boolean> {
  if (!isEmailConfigured()) return false;

  const url = billingUrl();
  const greeting = input.name.trim() ? `Hi ${input.name.trim()},` : "Hi,";
  const lead = input.halted
    ? `We couldn't collect payment for ${input.tenantName}'s Rabnix subscription ` +
      `after several attempts, so it's now paused and the assistant is switched off.`
    : `A payment for ${input.tenantName}'s Rabnix subscription didn't go through. ` +
      `We'll retry automatically over the next few days.`;
  const action = input.halted
    ? "To restore access, update your payment method and re-subscribe here:"
    : "To avoid any interruption, make sure your card is active and has sufficient funds:";

  await sendEmail({
    to: input.to,
    subject: input.halted
      ? "Your Rabnix subscription is paused — payment failed"
      : "Payment issue on your Rabnix subscription",
    text:
      `${greeting}\n\n${lead}\n\n${action}\n${url}\n\n` +
      `Questions? Just reply to this email or contact hello@rabnix.com.`,
    html:
      `<p>${escapeHtml(greeting)}</p>` +
      `<p>${escapeHtml(lead)}</p>` +
      `<p>${escapeHtml(action)}</p>` +
      `<p><a href="${url}">Manage billing</a></p>` +
      `<p style="color:#6b7280;font-size:13px">Questions? Just reply to this ` +
      `email or contact hello@rabnix.com.</p>`,
  });
  return true;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
