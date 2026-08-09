"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { conversations, messages, reminders } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";

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
 * - `baileys` / `cloud_api`: outbound WhatsApp lives in the worker, so we enqueue
 *   an immediate {@link reminders} row the scheduler drains. That reuses the
 *   worker's dual-transport sender (live Baileys socket or stateless Graph call)
 *   and its retry behaviour, and keeps outbound WhatsApp out of the web request
 *   path — the same pattern the AI's tools use.
 *
 * Note: Cloud API only allows free-form text within 24h of the customer's last
 * message; a reply outside that window fails at the Graph call and the reminder
 * retries. Staff replying to a live handoff are well inside the window.
 */
async function deliverToCustomer(
  tenantId: string,
  conversation: { channelType: string; customerId: string },
  message: string,
): Promise<void> {
  if (conversation.channelType === "web") return;
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
