import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { DashboardNav } from "@/components/dashboard/nav";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { UserMenu } from "@/components/dashboard/user-menu";
import { getActiveTenant, getSessionUser } from "@/lib/tenant";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?redirect=/dashboard");

  // One account = one business: the workspace is created on first access.
  const tenant = await getActiveTenant();
  if (!tenant) redirect("/sign-in");

  const [{ value: unreadCount }] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(eq(notifications.tenantId, tenant.id), eq(notifications.read, false)),
    );

  return (
    <div className="flex flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center border-b px-4">
          <span className="font-semibold">Rabnix AI</span>
        </div>
        <DashboardNav unreadNotifications={unreadCount} />
        <div className="mt-auto border-t p-3">
          <div className="truncate px-1 text-sm font-medium" title={tenant.name}>
            {tenant.name}
          </div>
          <div className="truncate px-1 text-xs text-muted-foreground">
            Your workspace
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="text-sm font-medium md:hidden">{tenant.name}</div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu email={user.email} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
