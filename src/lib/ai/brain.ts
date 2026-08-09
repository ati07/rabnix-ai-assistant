import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  businessConfig,
  conversations,
  messages,
  type channelTypeEnum,
} from "@/lib/db/schema";
import type { Tenant } from "@/lib/tenant";
import { makeToolExecutor } from "./actions";
import { buildSystemPrompt } from "./prompt";
import { getProvider } from "./providers";
import type { LlmMessage, ToolInvocation } from "./provider";
import { tools } from "./tools";

type ChannelType = (typeof channelTypeEnum.enumValues)[number];

/** How many prior turns to feed the model as conversation history. */
const HISTORY_LIMIT = 20;

export interface IncomingMessage {
  /** Customer's WhatsApp number / channel id (E.164). */
  from: string;
  /** The customer's message text. */
  text: string;
  /** Which channel it arrived on. */
  channel?: ChannelType;
  /** Display name from the channel, if known. */
  customerName?: string;
  /** Provider message id (wamid) for dedup/receipts. */
  externalId?: string;
}

export interface BrainResult {
  /** The assistant's reply, or null when auto-reply is off / no config. */
  reply: string | null;
  conversationId: string;
  toolCalls: ToolInvocation[];
}

/**
 * Handle one inbound customer message end-to-end:
 * persist it, build the tenant's system prompt, run the provider's tool-use
 * loop, persist the reply, and return the text for the channel to send.
 *
 * Channel-agnostic: callers (Baileys worker, Cloud API webhook) pass a plain
 * {@link IncomingMessage} and send the returned `reply` themselves.
 */
export async function handleIncomingMessage(
  tenant: Tenant,
  incoming: IncomingMessage,
): Promise<BrainResult> {
  const channel: ChannelType = incoming.channel ?? "baileys";

  const config = await db.query.businessConfig.findFirst({
    where: eq(businessConfig.tenantId, tenant.id),
  });

  const conversation = await ensureConversation(
    tenant.id,
    channel,
    incoming.from,
    incoming.customerName,
  );

  // Persist the inbound message first so it is part of the history we load.
  // The unique (tenantId, externalId) index dedups repeat webhook deliveries:
  // WhatsApp/Meta re-sends a message if our webhook is slow to ack, so if the
  // insert hits the conflict (nothing returned) this exact message is already
  // being handled — bail out. Re-running would post a second reply and, worse,
  // feed the model a history ending on the first pass's assistant turn (which
  // Gemini rejects with "Requests ending with a model turn are not supported").
  const inserted = await db
    .insert(messages)
    .values({
      tenantId: tenant.id,
      conversationId: conversation.id,
      direction: "inbound",
      role: "user",
      content: incoming.text,
      externalId: incoming.externalId,
    })
    .onConflictDoNothing()
    .returning({ id: messages.id });

  if (incoming.externalId && inserted.length === 0) {
    return { reply: null, conversationId: conversation.id, toolCalls: [] };
  }

  await touchConversation(conversation.id);

  // A human agent has taken over (or the thread is closed): record the inbound
  // message so staff see it, but the AI stays silent until it's handed back.
  if (conversation.status === "human" || conversation.status === "closed") {
    return { reply: null, conversationId: conversation.id, toolCalls: [] };
  }

  // No config or auto-reply disabled → record the message, stay silent.
  if (!config || !config.autoReplyEnabled) {
    return { reply: null, conversationId: conversation.id, toolCalls: [] };
  }

  const history = await loadHistory(conversation.id);
  const system = buildSystemPrompt(config, {
    customerId: incoming.from,
    customerName: incoming.customerName ?? conversation.customerName,
    channel,
  });

  const provider = getProvider(config);
  const executeTool = makeToolExecutor({
    tenantId: tenant.id,
    conversationId: conversation.id,
    customerId: incoming.from,
    customerName: incoming.customerName ?? conversation.customerName,
    channel,
    config,
  });

  const result = await provider.run(
    { system, messages: history, tools },
    executeTool,
  );

  const reply = result.text.trim();
  if (reply) {
    await db.insert(messages).values({
      tenantId: tenant.id,
      conversationId: conversation.id,
      direction: "outbound",
      role: "assistant",
      content: reply,
      meta: {
        model: provider.activeModel ?? provider.model,
        toolCalls: result.toolCalls.map((c) => c.name),
      },
    });
    await touchConversation(conversation.id);
  }

  return {
    reply: reply || null,
    conversationId: conversation.id,
    toolCalls: result.toolCalls,
  };
}

async function ensureConversation(
  tenantId: string,
  channel: ChannelType,
  customerId: string,
  customerName?: string,
) {
  await db
    .insert(conversations)
    .values({ tenantId, channelType: channel, customerId, customerName })
    .onConflictDoNothing();

  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.tenantId, tenantId),
      eq(conversations.channelType, channel),
      eq(conversations.customerId, customerId),
    ),
  });
  if (!conversation) {
    throw new Error("Failed to create or load conversation.");
  }
  return conversation;
}

async function touchConversation(conversationId: string) {
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

async function loadHistory(conversationId: string): Promise<LlmMessage[]> {
  const rows = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: desc(messages.createdAt),
    limit: HISTORY_LIMIT,
  });

  return rows
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}
