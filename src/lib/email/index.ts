import { env } from "@/lib/env";

/**
 * Transactional email via Resend's REST API.
 *
 * Kept provider-agnostic at the call site (see {@link EmailMessage}) and
 * implemented over raw HTTP so we don't pull in an SDK — matching the codebase's
 * lean-dependency ethos. Swap the transport here to change providers.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body (always sent). */
  text: string;
  /** Optional HTML body. */
  html?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Whether an email provider is configured (API key + verified from-address). */
export function isEmailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

/**
 * Send one email. Throws on missing configuration or a non-2xx response so the
 * caller (the reminder scheduler) can decide whether to retry or mark failed.
 */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error(
      "email provider not configured (set RESEND_API_KEY and EMAIL_FROM)",
    );
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend responded ${res.status}: ${detail.slice(0, 300)}`);
  }
}
