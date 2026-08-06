"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CalendarCheck,
  CheckCheck,
  CircleAlert,
  Loader2,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/dashboard/notifications/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
}

const TYPE_ICON: Record<string, typeof Bell> = {
  booking: CalendarCheck,
  handoff: UserRound,
  alert: CircleAlert,
};

export function NotificationsFeed({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unread = items.filter((i) => !i.read).length;

  function markAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
          <Bell className="size-10" />
          <p>No notifications yet.</p>
          <p className="max-w-sm text-sm">
            Bookings, escalations, and staff alerts from the assistant will show up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {unread > 0 ? `${unread} unread` : "All caught up"}
        </p>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAll} disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCheck className="size-4" />
            )}
            Mark all read
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {items.map((n) => (
            <NotificationRow key={n.id} item={n} onChange={() => router.refresh()} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationRow({
  item,
  onChange,
}: {
  item: NotificationItem;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<"read" | "delete" | null>(null);
  const [, startTransition] = useTransition();
  const Icon = TYPE_ICON[item.type] ?? Bell;

  function toggleRead() {
    setBusy("read");
    startTransition(async () => {
      await markNotificationRead(item.id, !item.read);
      setBusy(null);
      onChange();
    });
  }

  function remove() {
    setBusy("delete");
    startTransition(async () => {
      const res = await deleteNotification(item.id);
      setBusy(null);
      if (!res.ok) toast.error(res.error);
      onChange();
    });
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-6 py-4",
        !item.read && "bg-primary/5",
      )}
    >
      <div
        className={cn(
          "mt-0.5 shrink-0 rounded-full p-2",
          item.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {!item.read && (
            <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
          )}
          <p className={cn("truncate", !item.read && "font-medium")}>{item.title}</p>
        </div>
        {item.body && (
          <p className="mt-0.5 text-sm text-muted-foreground">{item.body}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(item.createdAt).toLocaleString()}
        </p>
      </div>
      <button
        type="button"
        onClick={toggleRead}
        disabled={busy !== null}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        {busy === "read" ? "…" : item.read ? "Mark unread" : "Mark read"}
      </button>
      <Button
        variant="ghost"
        size="icon"
        onClick={remove}
        disabled={busy !== null}
        aria-label="Delete notification"
      >
        {busy === "delete" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Trash2 className="size-4" />
        )}
      </Button>
    </div>
  );
}
