"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Bot,
  Building2,
  BookOpen,
  Contact,
  CreditCard,
  LayoutDashboard,
  MessagesSquare,
  Smartphone,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/business", label: "Business", icon: Building2 },
  { href: "/dashboard/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/dashboard/customers", label: "Customers", icon: Contact },
  { href: "/dashboard/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/staff", label: "Team", icon: Users },
  { href: "/dashboard/whatsapp", label: "WhatsApp", icon: Smartphone },
  { href: "/dashboard/chatbot", label: "Web Chat", icon: Bot },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];

export function DashboardNav({
  unreadNotifications = 0,
}: {
  unreadNotifications?: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {links.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        const badge =
          href === "/dashboard/notifications" && unreadNotifications > 0
            ? unreadNotifications
            : null;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="flex-1">{label}</span>
            {badge !== null && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
