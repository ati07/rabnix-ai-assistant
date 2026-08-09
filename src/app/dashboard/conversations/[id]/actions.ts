"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { conversations, messages, reminders } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import { sendCloudApiToTenant } from "@/lib/whatsapp/cloud-api";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Load a conversation and assert it belongs to the caller's tenant. */
async function ownConversation(tenantId: string, conversationId: string) {
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      eq(conversations.tenantId, tenantId),
    ),
  });
  return conversation ?? null;
}

/**
 * Deliver a staff/system message to the customer on their channel.
 *
 * - `web`: nothing to push — the widget shows it on its next `/history` poll.
 * - `cloud_api`: outbound is a stateless Graph call, so we send it directly from
 *   the request path — the same way the webhook sends the AI's own replies. This
 *   is deliberately NOT routed through the worker: a Cloud API tenant needs no
 *   worker for anything else, and requiring one just to deliver a handover reply
 *   silently drops it when the worker isn't running.
 * - `baileys`: needs the live socket held by the worker process, so we enqueue an
 *   immediate {@link reminders} row the scheduler drains. A failed `cloud_api`
 *   send also falls back to the queue for durable retry.
 *
 * Note: Cloud API only allows free-form text within 24h of the customer's last
 * message; a reply outside that window fails at the Graph call. Staff replying to
 * a live handoff are well inside the window.
 */
async function deliverToCustomer(
  tenantId: string,
  conversation: { channelType: string; customerId: string },
  message: string,
): Promise<void> {
  if (conversation.channelType === "web") return;

  if (conversation.channelType === "cloud_api") {
    try {
      await sendCloudApiToTenant(tenantId, conversation.customerId, message);
      return;
    } catch (err) {
      // Fall through to the queue so a running worker can retry, rather than
      // losing the message outright.
      console.error(
        "[handover] direct Cloud API send failed, queuing for retry:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Baileys (worker-only live socket), or a Cloud API send that just failed.
  await db.insert(reminders).values({
    tenantId,
    target: "customer",
    channel: "whatsapp",
    sendAt: new Date(),
    payload: { to: conversation.customerId, message },
  });
}

const replySchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().trim().min(1, "Message is required").max(4000),
});

/**
 * Send a staff reply into a conversation. Stored as an outbound assistant
 * message tagged `by: "staff"` (so it renders as a business message), then
 * delivered on the conversation's channel: the web widget picks it up on its
 * next history poll, while WhatsApp chats are handed to the worker for sending
 * (see {@link deliverToCustomer}).
 */
export async function sendStaffReply(
  input: z.input<typeof replySchema>,
): Promise<ActionResult> {
  const tenant = await requireTenant();
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { conversationId, text } = parsed.data;

  const conversation = await ownConversation(tenant.id, conversationId);
  if (!conversation) return { ok: false, error: "Conversation not found." };

  await db.insert(messages).values({
    tenantId: tenant.id,
    conversationId,
    direction: "outbound",
    role: "assistant",
    content: text,
    meta: { by: "staff" },
  });
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conversationId));

  await deliverToCustomer(tenant.id, conversation, text);

  revalidatePath(`/dashboard/conversations/${conversationId}`);
  return { ok: true };
}

const statusSchema = z.object({
  conversationId: z.string().uuid(),
  status: z.enum(["open", "needs_human", "human", "closed"]),
});

/**
 * Change a conversation's status. Setting `human` pauses the AI (a staff member
 * has taken over); `open` hands it back to the assistant. Taking over drops a
 * short notice into the thread so the visitor knows a person has joined.
 */
export async function setConversationStatus(
  input: z.input<typeof statusSchema>,
): Promise<ActionResult> {
  const tenant = await requireTenant();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { conversationId, status } = parsed.data;

  const conversation = await ownConversation(tenant.id, conversationId);
  if (!conversation) return { ok: false, error: "Conversation not found." };

  await db
    .update(conversations)
    .set({ status })
    .where(eq(conversations.id, conversationId));

  // Announce a live takeover in the thread and deliver it on the customer's
  // channel (web widget poll, or WhatsApp via the worker).
  if (status === "human" && conversation.status !== "human") {
    const notice = "A team member has joined the chat and will help you now.";
    await db.insert(messages).values({
      tenantId: tenant.id,
      conversationId,
      direction: "outbound",
      role: "assistant",
      content: notice,
      meta: { by: "system" },
    });
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, conversationId));
    await deliverToCustomer(tenant.id, conversation, notice);
  }

  revalidatePath(`/dashboard/conversations/${conversationId}`);
  return { ok: true };
}
