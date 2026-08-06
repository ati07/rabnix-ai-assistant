import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import {
  NotificationsFeed,
  type NotificationItem,
} from "@/components/dashboard/notifications-feed";

export default async function NotificationsPage() {
  const tenant = await requireTenant();

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.tenantId, tenant.id))
    .orderBy(desc(notifications.createdAt))
    .limit(100);

  const items: NotificationItem[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    read: r.read,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Bookings, escalations, and alerts the assistant raised for your team.
      </p>
      <NotificationsFeed items={items} />
    </div>
  );
}
