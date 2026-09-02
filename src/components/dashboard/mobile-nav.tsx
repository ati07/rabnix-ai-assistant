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

interface NavGroup {
  label: string;
  items: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    exact?: boolean;
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
        <div className="fixed inset-x-0 top-14 z-50 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b border-border bg-background/95 backdrop-blur-md p-4 shadow-2xl animate-in slide-in-from-top-2">
          <div className="mb-3 border-b border-border/60 pb-2 px-1">
            <div className="text-sm font-semibold text-foreground truncate">{tenantName}</div>
            <div className="text-xs text-muted-foreground">Workspace Menu</div>
          </div>
          <nav className="flex flex-col gap-4">
            {navGroups.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map(({ href, label, icon: Icon, exact }) => {
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
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="flex-1 truncate">{label}</span>
                        {badge !== null && (
                          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-xs font-semibold text-white">
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
