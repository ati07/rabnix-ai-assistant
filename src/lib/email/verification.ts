import { clientEnv } from "@/lib/env";
import { isEmailConfigured, sendEmail } from "@/lib/email";

/** Absolute verification URL for an email-verification token. */
export function verifyEmailUrl(token: string): string {
  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
}

/**
 * Best-effort delivery of the "confirm your email" message. Returns whether an
 * email was actually sent; when no provider is configured the caller should
 * surface the link another way (or let the user resend once it's set up).
 */
export async function sendVerificationEmail(input: {
  to: string;
  name: string;
  token: string;
}): Promise<boolean> {
  if (!isEmailConfigured()) return false;

  const url = verifyEmailUrl(input.token);
  const greeting = input.name.trim() ? `Hi ${input.name.trim()},` : "Hi,";
  await sendEmail({
    to: input.to,
    subject: "Confirm your email for Rabnix",
    text:
      `${greeting}\n\n` +
      `Confirm your email address to activate your Rabnix account:\n${url}\n\n` +
      `This link expires in 24 hours. If you didn't create this account, you ` +
      `can ignore this email.`,
    html:
      `<p>${escapeHtml(greeting)}</p>` +
      `<p>Confirm your email address to activate your Rabnix account.</p>` +
      `<p><a href="${url}">Confirm my email</a></p>` +
      `<p style="color:#6b7280;font-size:13px">This link expires in 24 hours. ` +
      `If you didn't create this account, you can ignore this email.</p>`,
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
