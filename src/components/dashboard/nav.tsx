"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Bot,
  Building2,
  BookOpen,
  CalendarDays,
  Contact,
  CreditCard,
  LayoutDashboard,
  MessagesSquare,
  Smartphone,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavGroup {
  label: string;
  items: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    exact?: boolean;
    badgeText?: string;
  }[];
}

const navGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "AI & Channels",
    items: [
      { href: "/dashboard/whatsapp", label: "WhatsApp AI", icon: Smartphone },
      { href: "/dashboard/chatbot", label: "Web Chatbot", icon: Bot },
      { href: "/dashboard/knowledge", label: "Knowledge RAG", icon: BookOpen },
      { href: "/dashboard/business", label: "Business Logic", icon: Building2 },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/dashboard/conversations", label: "Conversations", icon: MessagesSquare },
      { href: "/dashboard/appointments", label: "Appointments", icon: CalendarDays },
      { href: "/dashboard/customers", label: "Customers & Leads", icon: Contact },
      { href: "/dashboard/staff", label: "Team & Staff", icon: Users },
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/dashboard/billing", label: "Billing & Plans", icon: CreditCard },
    ],
  },
];

export function DashboardNav({
  unreadNotifications = 0,
}: {
  unreadNotifications?: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-4 p-3 overflow-y-auto">
      {navGroups.map((group) => (
        <div key={group.label} className="space-y-1">
          <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon, exact, badgeText }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              const notificationCount =
                href === "/dashboard/notifications" && unreadNotifications > 0
                  ? unreadNotifications
                  : null;

              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs md:text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0 transition-colors",
                      active
                        ? "text-primary-foreground"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  <span className="flex-1 truncate">{label}</span>

                  {notificationCount !== null && (
                    <span
                      className={cn(
                        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                        active
                          ? "bg-primary-foreground text-primary"
                          : "bg-destructive text-destructive-foreground animate-pulse"
                      )}
                    >
                      {notificationCount > 99 ? "99+" : notificationCount}
                    </span>
                  )}

                  {badgeText && !notificationCount && (
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      {badgeText}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
