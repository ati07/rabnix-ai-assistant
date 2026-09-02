"use client";

import { useTransition } from "react";
import { Eye, Loader2 } from "lucide-react";
import { stopImpersonating } from "@/app/admin/actions";

/**
 * Shown across the top of the dashboard while a platform admin is viewing a
 * tenant via impersonation. Makes the elevated state obvious and offers a
 * one-click exit back to the admin console.
 */
export function ImpersonationBanner({ tenantName }: { tenantName: string }) {
  const [busy, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 bg-amber-500 px-6 py-2 text-sm text-amber-950">
      <Eye className="size-4 shrink-0" />
      <span className="flex-1">
        You&apos;re viewing <strong>{tenantName}</strong> as a platform admin.
        Changes you make affect this workspace.
      </span>
      <button
        type="button"
        onClick={() => startTransition(() => stopImpersonating())}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/10 px-3 py-1 font-medium hover:bg-amber-950/20 disabled:opacity-60"
      >
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        Exit impersonation
      </button>
    </div>
  );
}
