import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ConversationStatusBadge } from "@/components/dashboard/conversation-status-badge";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await requireTenant();

  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, id), eq(conversations.tenantId, tenant.id)),
  });
  if (!conversation) notFound();

  const thread = await db
    .select({
      id: messages.id,
      direction: messages.direction,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.createdAt));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/dashboard/conversations"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">
            {conversation.customerName || conversation.customerId}
          </h1>
          <p className="text-sm text-muted-foreground">{conversation.customerId}</p>
        </div>
        <ConversationStatusBadge status={conversation.status} />
      </div>

      <Card>
        <CardContent className="max-h-[70vh] space-y-3 overflow-y-auto">
          {thread.length === 0 && (
            <p className="text-center text-muted-foreground">No messages.</p>
          )}
          {thread.map((m) => {
          const outbound = m.direction === "outbound";
          return (
            <div
              key={m.id}
              className={cn("flex", outbound ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                  outbound
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <p
                  className={cn(
                    "mt-1 text-[10px]",
                    outbound
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground",
                  )}
                >
                  {new Date(m.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
