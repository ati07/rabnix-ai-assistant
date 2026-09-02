import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { DashboardNav } from "@/components/dashboard/nav";
import { DashboardMobileNav } from "@/components/dashboard/mobile-nav";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { UserMenu } from "@/components/dashboard/user-menu";
import { UpgradeBanner } from "@/components/dashboard/upgrade-banner";
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner";
import { getActiveMembership } from "@/lib/tenant";
import { getBillingState } from "@/lib/billing/subscription";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const membership = await getActiveMembership();
  if (!membership) redirect("/sign-in?redirect=/dashboard");

  // One account = one business: the workspace is created on first access. When a
  // platform admin is impersonating, `tenant` is the workspace they're viewing.
  const { user, tenant, impersonating } = membership;
  const isAdmin = user.role === "platform_admin";

  const [{ value: unreadCount }] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(eq(notifications.tenantId, tenant.id), eq(notifications.read, false)),
    );

  // Nudge Free (and lapsed-Pro) tenants to upgrade; hidden for active Pro.
  const billing = await getBillingState(tenant.id);
  const onPro = billing.effectivePlan === "pro";
  const proLapsed = billing.plan === "pro" && !onPro;

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
        {impersonating && <ImpersonationBanner tenantName={tenant.name} />}
        <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <DashboardMobileNav
              tenantName={tenant.name}
              unreadNotifications={unreadCount}
            />
            <div className="text-sm font-medium truncate max-w-[160px]">{tenant.name}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu email={user.email} isAdmin={isAdmin} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-8">
          {!onPro && !impersonating && <UpgradeBanner lapsed={proLapsed} />}
          {children}
        </main>
      </div>
    </div>
  );
}
