/**
 * Booking-confirmation email copy.
 *
 * Pure builders — no sending. `book_appointment` sends these directly via Resend
 * (best-effort) as soon as a booking is made, the same way verification/billing
 * emails are sent. Each returns `{ subject, text, html }` ready for `sendEmail`.
 */

interface BookingParts {
  /** The business's display name, shown to the recipient. */
  businessName: string;
  serviceName: string;
  /** Start time, already formatted in the tenant's timezone. */
  when: string;
  staffName?: string | null;
}

interface Composed {
  subject: string;
  text: string;
  html: string;
}

/** Confirmation sent to the customer who booked. */
export function customerBookingEmail(
  input: BookingParts & { customerName?: string | null },
): Composed {
  const business = input.businessName || "us";
  const greeting = input.customerName?.trim()
    ? `Hi ${input.customerName.trim()},`
    : "Hi,";

  const rows: [string, string][] = [
    ["Service", input.serviceName],
    ["When", input.when],
  ];
  if (input.staffName) rows.push(["With", input.staffName]);

  return {
    subject: `Your ${input.serviceName} booking with ${business} is confirmed`,
    text:
      `${greeting}\n\n` +
      `Your appointment is confirmed. Here are the details:\n\n` +
      rows.map(([k, v]) => `• ${k}: ${v}`).join("\n") +
      `\n\nIf you need to reschedule or cancel, just reply to the chat and ` +
      `we'll help you out.\n\n` +
      `See you soon,\n${business}`,
    html:
      `<p>${escapeHtml(greeting)}</p>` +
      `<p>Your appointment is confirmed. Here are the details:</p>` +
      detailsTable(rows) +
      `<p>If you need to reschedule or cancel, just reply to the chat and ` +
      `we'll help you out.</p>` +
      `<p style="color:#6b7280;font-size:13px">See you soon,<br/>` +
      `${escapeHtml(business)}</p>`,
  };
}

/** Notification sent to the business owner when a new appointment is booked. */
export function ownerBookingEmail(
  input: BookingParts & { customerName: string; customerContact?: string | null },
): Composed {
  const rows: [string, string][] = [["Customer", input.customerName]];
  if (input.customerContact?.trim()) rows.push(["Contact", input.customerContact.trim()]);
  rows.push(["Service", input.serviceName], ["When", input.when]);
  if (input.staffName) rows.push(["With", input.staffName]);

  return {
    subject: `New booking: ${input.serviceName} — ${input.when}`,
    text:
      `A new appointment was just booked through your Rabnix assistant.\n\n` +
      rows.map(([k, v]) => `• ${k}: ${v}`).join("\n") +
      `\n\nView it anytime in your Rabnix dashboard.`,
    html:
      `<p>A new appointment was just booked through your Rabnix assistant.</p>` +
      detailsTable(rows) +
      `<p style="color:#6b7280;font-size:13px">View it anytime in your ` +
      `Rabnix dashboard.</p>`,
  };
}

/** A tidy key/value table for the HTML body. */
function detailsTable(rows: [string, string][]): string {
  const cells = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${escapeHtml(k)}</td>` +
        `<td style="padding:2px 0;font-weight:600">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;font-size:14px;margin:8px 0">${cells}</table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
