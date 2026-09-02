import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { handleIncomingMessage } from "@/lib/ai/brain";
import { findByPublicKey } from "@/lib/chat/web-config";
import { consume } from "@/lib/chat/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string().trim().min(8).max(200),
  text: z.string().trim().min(1).max(4000),
});

/**
 * Public: an anonymous web visitor sends a message.
 *
 * Resolves the tenant by `publicKey`, enforces the origin allow-list + a
 * per-visitor rate limit, then routes through the shared AI brain as a `web`
 * channel message (`customerId` = the visitor's localStorage sessionId).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const config = await findByPublicKey(key);
  if (!config || !config.enabled) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Note: this call comes from *inside* the iframe, so its Origin is always the
  // app's own origin — the embedding `allowedOrigins` allow-list can't be checked
  // here (it's enforced on the cross-origin `/config` fetch instead).

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }
  const { sessionId, text } = parsed.data;

  const limit = consume(`${config.publicKey}:${sessionId}`);
  if (!limit.ok) {
    return Response.json(
      { error: "Too many messages. Please slow down." },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, config.tenantId),
  });
  if (!tenant) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await handleIncomingMessage(tenant, {
      from: sessionId,
      text,
      channel: "web",
      customerName: "Web visitor",
    });
    return Response.json({ reply: result.reply });
  } catch (err) {
    console.error("[web-chat] message handling failed:", err);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
