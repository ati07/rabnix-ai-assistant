"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Shield } from "lucide-react";
import { signOutAction } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";

/** Signed-in user chip + sign-out. Shows an Admin link for platform admins. */
export function UserMenu({ email, isAdmin = false }: { email: string; isAdmin?: boolean }) {
  const router = useRouter();

  async function handleSignOut() {
    await signOutAction();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground sm:inline">
        {email}
      </span>
      {isAdmin && (
        <Button variant="ghost" size="sm" asChild title="Platform admin">
          <Link href="/admin">
            <Shield className="h-4 w-4" />
            <span className="sr-only">Admin console</span>
          </Link>
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={handleSignOut} title="Sign out">
        <LogOut className="h-4 w-4" />
        <span className="sr-only">Sign out</span>
      </Button>
    </div>
  );
}
