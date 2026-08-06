import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  businessConfig,
  conversations,
  messages,
  type channelTypeEnum,
} from "@/lib/db/schema";
import type { Tenant } from "@/lib/tenant";
import { buildSystemPrompt } from "./prompt";
import { getProvider } from "./providers";
import type {
  LlmMessage,
  LlmToolResult,
  ToolExecutor,
  ToolInvocation,
} from "./provider";
import { searchKnowledge } from "./rag";
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
  await db
    .insert(messages)
    .values({
      tenantId: tenant.id,
      conversationId: conversation.id,
      direction: "inbound",
      role: "user",
      content: incoming.text,
      externalId: incoming.externalId,
    })
    .onConflictDoNothing();

  await touchConversation(conversation.id);

  // No config or auto-reply disabled → record the message, stay silent.
  if (!config || !config.autoReplyEnabled) {
    return { reply: null, conversationId: conversation.id, toolCalls: [] };
  }

  const history = await loadHistory(conversation.id);
  const system = buildSystemPrompt(config, {
    customerId: incoming.from,
    customerName: incoming.customerName ?? conversation.customerName,
  });

  const provider = getProvider(config);
  const executeTool = makeToolExecutor({
    tenantId: tenant.id,
    conversationId: conversation.id,
    customerId: incoming.from,
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
      meta: { model: provider.model, toolCalls: result.toolCalls.map((c) => c.name) },
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

/**
 * Build the tool executor for one conversation.
 *
 * STUBBED for Phase 2 — every tool returns a structured "not available yet"
 * result so the loop terminates gracefully. Phases 3–4 replace these with real
 * implementations (RAG search, CRM, availability/booking, notifications,
 * reminders, human handoff) using the captured `tenantId`/`conversationId`.
 */
function makeToolExecutor(ctx: {
  tenantId: string;
  conversationId: string;
  customerId: string;
}): ToolExecutor {
  return async (call: ToolInvocation): Promise<LlmToolResult> => {
    switch (call.name) {
      case "search_knowledge": {
        const query = String(call.input.query ?? "").trim();
        if (!query) return { content: "No search query was provided." };
        const results = await searchKnowledge(ctx.tenantId, query, { limit: 5 });
        if (results.length === 0) {
          return {
            content:
              "No relevant information found in the knowledge base. Answer from your configured information, or offer to connect a human.",
          };
        }
        return {
          content: results
            .map((r, i) => `[${i + 1}] ${r.content}`)
            .join("\n\n"),
        };
      }
      case "get_customer":
        return { content: JSON.stringify({ found: false }) };
      case "check_availability":
        return {
          content:
            "The booking calendar is not connected yet. Tell the customer a team member will confirm a time.",
        };
      default:
        return {
          content: `The "${call.name}" action is not available yet in this environment.`,
          isError: true,
        };
    }
  };
}
