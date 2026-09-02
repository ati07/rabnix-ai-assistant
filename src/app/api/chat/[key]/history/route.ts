import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { findByPublicKey } from "@/lib/chat/web-config";

export const runtime = "nodejs";
// The widget polls this every few seconds; never let a browser/CDN serve a stale
// cached copy or staff replies won't appear live.
export const dynamic = "force-dynamic";

/** How many past messages to restore into the widget on reload. */
const HISTORY_LIMIT = 50;

/** No-store so each poll reflects the latest thread. */
const NO_STORE = { headers: { "cache-control": "no-store" } } as const;

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
    return Response.json({ messages: [] }, NO_STORE);
  }

  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.tenantId, config.tenantId),
      eq(conversations.channelType, "web"),
      eq(conversations.customerId, sessionId),
    ),
  });
  if (!conversation) {
    return Response.json({ messages: [] }, NO_STORE);
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

  return Response.json(
    {
      messages: rows.map((m) => ({
        id: m.id,
        role: m.direction === "outbound" ? "assistant" : "user",
        content: m.content,
        createdAt: m.createdAt,
      })),
    },
    NO_STORE,
  );
}
