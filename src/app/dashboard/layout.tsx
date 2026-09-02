import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { and, count, eq } from "drizzle-orm";
import { ExternalLink, Bell } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

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

  // The dashboard stays locked until a new account confirms its email. Platform
  // admins (and admin impersonation) are exempt.
  if (!user.emailVerified && !isAdmin && !impersonating) {
    redirect("/verify-email");
  }

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

  const initials = tenant.name
    ? tenant.name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "RX";

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Modern Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/70 bg-card/60 backdrop-blur-xl md:flex">
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-border/60 px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <Image
              src="/logo.png"
              alt="Rabnix AI"
              width={36}
              height={36}
              priority
              className="size-9 rounded-xl shadow-xs transition-transform group-hover:scale-105"
            />
            <div>
              <div className="flex items-center gap-1.5 font-bold text-sm leading-none tracking-tight">
                Rabnix AI
                <span className="rounded-sm bg-primary/10 px-1 py-0.5 text-[9px] font-semibold text-primary">
                  PRO
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Autonomous Business OS</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <DashboardNav unreadNotifications={unreadCount} />
        </div>

        {/* Workspace Card at Bottom */}
        <div className="border-t border-border/60 p-3 bg-muted/20">
          <div className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-background/80 p-2.5 shadow-xs">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary text-xs font-bold border border-primary/20">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-foreground" title={tenant.name}>
                {tenant.name}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{onPro ? "Pro Workspace" : "Free Tier"}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {impersonating && <ImpersonationBanner tenantName={tenant.name} />}

        {/* Global Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-background/85 px-4 backdrop-blur-md sm:px-6">
          {/* Mobile hamburger + workspace name */}
          <div className="flex items-center gap-3 md:hidden">
            <DashboardMobileNav
              tenantName={tenant.name}
              unreadNotifications={unreadCount}
            />
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
                {initials}
              </div>
              <span className="text-sm font-semibold truncate max-w-[140px] text-foreground">
                {tenant.name}
              </span>
            </div>
          </div>

          {/* Desktop Topbar Left: Workspace Title & Status */}
          <div className="hidden md:flex items-center gap-3">
            <Badge
              variant="outline"
              className="gap-1.5 py-1 px-2.5 text-xs font-medium border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
            >
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              AI Assistant Ready
            </Badge>

            <Link
              href="/"
              target="_blank"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Landing Page</span>
              <ExternalLink className="size-3" />
            </Link>
          </div>

          {/* Topbar Right: Quick Actions, Theme, Notifications & User */}
          <div className="ml-auto flex items-center gap-2.5">
            <Link
              href="/dashboard/notifications"
              className="relative flex size-9 items-center justify-center rounded-lg border border-border/60 bg-background/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Notifications"
            >
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive ring-2 ring-background" />
              )}
            </Link>

            <ThemeToggle />

            <div className="h-5 w-px bg-border/60 mx-0.5" />

            <UserMenu email={user.email} isAdmin={isAdmin} />
          </div>
        </header>

        {/* Main Canvas */}
        <main className="flex-1 overflow-y-auto scrollbar-hide px-4 sm:px-6 py-6 sm:py-8 max-w-7xl w-full mx-auto">
          {!onPro && !impersonating && <UpgradeBanner lapsed={proLapsed} />}
          {children}
        </main>
      </div>
    </div>
  );
}
