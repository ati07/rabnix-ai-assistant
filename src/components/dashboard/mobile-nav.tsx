"use client";

import { useState } from "react";
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
  Menu,
  MessagesSquare,
  Smartphone,
  Users,
  X,
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

export function DashboardMobileNav({
  tenantName,
  unreadNotifications = 0,
}: {
  tenantName: string;
  unreadNotifications?: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"
        aria-label="Toggle navigation menu"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {open && (
        <div className="fixed inset-x-0 top-14 z-50 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-border bg-background p-4 shadow-xl animate-in slide-in-from-top-2">
          <div className="mb-3 border-b border-border pb-2 px-1">
            <div className="text-sm font-semibold truncate">{tenantName}</div>
            <div className="text-xs text-muted-foreground">Workspace Menu</div>
          </div>
          <nav className="flex flex-col gap-1">
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
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  <span className="flex-1">{label}</span>
                  {badge !== null && (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-xs font-semibold text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
