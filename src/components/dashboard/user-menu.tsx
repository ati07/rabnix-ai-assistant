"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";

/** Signed-in user chip + sign-out. */
export function UserMenu({ email }: { email: string }) {
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
      <Button variant="ghost" size="sm" onClick={handleSignOut} title="Sign out">
        <LogOut className="h-4 w-4" />
        <span className="sr-only">Sign out</span>
      </Button>
    </div>
  );
}
