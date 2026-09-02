import Link from "next/link";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { ArrowLeft, Globe, Inbox, MessagesSquare, Smartphone } from "lucide-react";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ConversationStatusBadge } from "@/components/dashboard/conversation-status-badge";
import { ConversationReply } from "@/components/dashboard/conversation-reply";

// WhatsApp covers both the Cloud API and Baileys transports; everything else is
// the embeddable web widget.
function channelMeta(channel: string) {
  if (channel === "web") {
    return {
      label: "Web",
      Icon: Globe,
      badge:
        "border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/5",
      bubble: "bg-primary text-primary-foreground",
    } as const;
  }
  return {
    label: "WhatsApp",
    Icon: Smartphone,
    badge:
      "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5",
    bubble: "bg-emerald-600 text-white dark:bg-emerald-700",
  } as const;
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

const timeFmt: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: selectedId } = await searchParams;
  const tenant = await requireTenant();

  const rows = await db
    .select({
      id: conversations.id,
      customerId: conversations.customerId,
      customerName: conversations.customerName,
      channelType: conversations.channelType,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
      messageCount: count(messages.id),
    })
    .from(conversations)
    .leftJoin(messages, eq(messages.conversationId, conversations.id))
    .where(eq(conversations.tenantId, tenant.id))
    .groupBy(conversations.id)
    .orderBy(
      desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`),
    );

  // Load the selected thread server-side so both panes render in one request.
  const selected = selectedId
    ? await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, selectedId),
          eq(conversations.tenantId, tenant.id),
        ),
      })
    : null;

  const thread = selected
    ? await db
        .select({
          id: messages.id,
          direction: messages.direction,
          role: messages.role,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, selected.id))
        .orderBy(asc(messages.createdAt))
    : [];

  const selectedMeta = selected ? channelMeta(selected.channelType) : null;
  const SelectedChannelIcon = selectedMeta?.Icon ?? Globe;

  return (
    <div className="relative mx-auto h-[calc(100dvh-9rem)] min-h-[520px] w-full">
      {/* Ambient gradient glow behind the panel, matching the landing preview */}
      <div className="pointer-events-none absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-primary/10 to-teal-500/10 opacity-70 blur-xl" />

      <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-2xl backdrop-blur-xl dark:border-border/50 dark:bg-card/90">
      {/* Window bar echoing the landing preview */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="size-3 rounded-full bg-red-500/80" />
            <span className="size-3 rounded-full bg-amber-500/80" />
            <span className="size-3 rounded-full bg-emerald-500/80" />
          </div>
          <span className="ml-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <MessagesSquare className="size-3.5 text-primary" />
            Conversations Inbox
          </span>
        </div>
        <Badge
          variant="outline"
          className="gap-1.5 text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
        >
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live Sync
        </Badge>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: conversation list */}
        <aside
          className={cn(
            "w-full shrink-0 flex-col border-r border-border/60 bg-muted/10 md:flex md:w-80",
            selectedId ? "hidden md:flex" : "flex",
          )}
        >
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              All Conversations
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {rows.length}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
            {rows.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <Inbox className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No conversations yet. They&apos;ll appear here once customers
                  message you.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {rows.map((c) => {
                  const meta = channelMeta(c.channelType);
                  const active = c.id === selectedId;
                  const name = c.customerName || c.customerId;
                  const when = c.lastMessageAt ?? c.createdAt;
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/dashboard/conversations?c=${c.id}`}
                        className={cn(
                          "flex items-start gap-3 px-4 py-3 transition-colors",
                          active
                            ? "bg-primary/10 border-l-2 border-l-primary"
                            : "border-l-2 border-l-transparent hover:bg-muted/50",
                        )}
                      >
                        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                          {initials(name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {name}
                            </p>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {new Date(when).toLocaleString([], timeFmt)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={cn("gap-1 px-1.5 py-0 text-[10px]", meta.badge)}
                            >
                              <meta.Icon className="size-3" />
                              {meta.label}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {Number(c.messageCount)} msg
                              {Number(c.messageCount) === 1 ? "" : "s"}
                            </span>
                            <span className="ml-auto">
                              <ConversationStatusBadge status={c.status} />
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Right: selected thread */}
        <section
          className={cn(
            "min-w-0 flex-1 flex-col bg-background/60",
            selectedId ? "flex" : "hidden md:flex",
          )}
        >
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <MessagesSquare className="size-7" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {selectedId ? "Conversation not found" : "Select a conversation"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedId
                    ? "It may have been removed or belongs to another workspace."
                    : "Pick a chat from the list to view the full thread and reply."}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3">
                <Link
                  href="/dashboard/conversations"
                  className="text-muted-foreground hover:text-foreground md:hidden"
                  aria-label="Back to list"
                >
                  <ArrowLeft className="size-5" />
                </Link>
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                    selectedMeta!.badge,
                  )}
                >
                  {initials(selected.customerName || selected.customerId)}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-sm font-semibold text-foreground">
                    {selected.customerName || selected.customerId}
                  </h1>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <SelectedChannelIcon className="size-3" />
                    {selectedMeta!.label} · {selected.customerId}
                  </p>
                </div>
                <ConversationStatusBadge status={selected.status} />
              </div>

              {/* Messages */}
              <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto scrollbar-hide px-4 py-4">
                {thread.length === 0 ? (
                  <p className="pt-8 text-center text-sm text-muted-foreground">
                    No messages in this conversation yet.
                  </p>
                ) : (
                  thread.map((m) => {
                    const outbound = m.direction === "outbound";
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "flex",
                          outbound ? "justify-end" : "justify-start",
                        )}
                      >
                        <div className="max-w-[80%]">
                          {outbound && (
                            <p className="mb-1 text-right text-[10px] font-medium text-muted-foreground">
                              {m.role === "assistant" ? "Rabnix AI" : "Team"}
                            </p>
                          )}
                          <div
                            className={cn(
                              "rounded-2xl px-4 py-2.5 text-sm shadow-xs",
                              outbound
                                ? cn("rounded-tr-sm", selectedMeta!.bubble)
                                : "rounded-tl-sm border border-border/40 bg-muted text-foreground",
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {m.content}
                            </p>
                            <p
                              className={cn(
                                "mt-1 text-right text-[10px]",
                                outbound ? "opacity-75" : "text-muted-foreground",
                              )}
                            >
                              {new Date(m.createdAt).toLocaleString([], timeFmt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply / takeover controls */}
              <div className="shrink-0 border-t border-border/60 px-4 pb-4 pt-1">
                <ConversationReply
                  conversationId={selected.id}
                  channel={selected.channelType}
                  status={selected.status}
                />
              </div>
            </>
          )}
        </section>
        </div>
      </div>
    </div>
  );
}
