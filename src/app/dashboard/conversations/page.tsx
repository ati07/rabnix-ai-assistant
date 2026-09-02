import Link from "next/link";
import { count, desc, eq, sql } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import { Card, CardContent } from "@/components/ui/card";
import { ConversationStatusBadge } from "@/components/dashboard/conversation-status-badge";

export default async function ConversationsPage() {
  const tenant = await requireTenant();

  const rows = await db
    .select({
      id: conversations.id,
      customerId: conversations.customerId,
      customerName: conversations.customerName,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
      messageCount: count(messages.id),
    })
    .from(conversations)
    .leftJoin(messages, eq(messages.conversationId, conversations.id))
    .where(eq(conversations.tenantId, tenant.id))
    .groupBy(conversations.id)
    .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Conversations</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Every customer chat your assistant has handled.
      </p>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No conversations yet. They&apos;ll appear here once customers message you.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {rows.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/conversations/${c.id}`}
                className="flex items-center gap-3 px-6 py-3 hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {c.customerName || c.customerId}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {Number(c.messageCount)} message
                    {Number(c.messageCount) === 1 ? "" : "s"}
                    {c.lastMessageAt
                      ? ` · ${new Date(c.lastMessageAt).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <ConversationStatusBadge status={c.status} />
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
