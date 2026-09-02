import Link from "next/link";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { getSessionUser } from "@/lib/tenant";
import { UserMenu } from "@/components/dashboard/user-menu";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";

/**
 * Platform-admin console shell. Authorization is enforced here (real check, not
 * the optimistic cookie gate in proxy.ts): only `platform_admin` users get in.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?redirect=/admin");
  if (user.role !== "platform_admin") redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="flex h-14 items-center justify-between border-b bg-sidebar px-6">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <Shield className="size-5 text-primary" />
          Rabnix — Platform Admin
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            My workspace
          </Link>
          <ThemeToggle />
          <UserMenu email={user.email} />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-8">{children}</main>
    </div>
  );
}
