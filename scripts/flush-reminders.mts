import "dotenv/config";
import { dispatchDueReminders } from "@/lib/scheduling/reminders";
import { isEmailConfigured, sendEmail } from "@/lib/email";

/**
 * One-off: deliver every due reminder right now (what the worker does each tick).
 * Handy to flush pending confirmation emails when the worker isn't running.
 *   npx tsx scripts/flush-reminders.mts
 */
async function main() {
  if (!isEmailConfigured()) {
    console.error("Email not configured — set RESEND_API_KEY + EMAIL_FROM.");
    process.exit(1);
  }

  // WhatsApp sender throws (no live socket here), so WhatsApp rows stay pending
  // and only email reminders are delivered.
  const result = await dispatchDueReminders(
    async () => {
      throw new Error("whatsapp not available in flush script");
    },
    ({ to, subject, message }) => sendEmail({ to, subject, text: message }),
  );
  console.log("dispatch:", result);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
