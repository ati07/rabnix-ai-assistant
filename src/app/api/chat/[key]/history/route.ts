import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { findByPublicKey } from "@/lib/chat/web-config";

export const runtime = "nodejs";

/** How many past messages to restore into the widget on reload. */
const HISTORY_LIMIT = 50;

/**
 * Public: restore a returning visitor's thread.
 *
 * `GET ?sessionId=...` returns prior messages for
 * `(tenant, channel="web", customerId=sessionId)` so the widget rehydrates on
 * page reload. Unknown key/session → empty list (never an error, to keep the
 * widget resilient).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const sessionId = new URL(req.url).searchParams.get("sessionId");

  const config = await findByPublicKey(key);
  if (!config || !config.enabled || !sessionId) {
    return Response.json({ messages: [] });
  }

  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.tenantId, config.tenantId),
      eq(conversations.channelType, "web"),
      eq(conversations.customerId, sessionId),
    ),
  });
  if (!conversation) {
    return Response.json({ messages: [] });
  }

  const rows = await db
    .select({
      id: messages.id,
      direction: messages.direction,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.createdAt))
    .limit(HISTORY_LIMIT);

  return Response.json({
    messages: rows.map((m) => ({
      id: m.id,
      role: m.direction === "outbound" ? "assistant" : "user",
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}
