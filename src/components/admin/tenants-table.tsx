"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, LogIn, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  impersonateTenant,
  suspendTenant,
  unsuspendTenant,
} from "@/app/admin/actions";
import type { BillingCycle, PlanId } from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface AdminTenantView {
  id: string;
  name: string;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerless: boolean;
  suspended: boolean;
  plan: PlanId;
  status: string;
  billingCycle: BillingCycle | null;
  createdAt: string; // ISO
  staffCount: number;
  conversationCount: number;
  messageCount: number;
  documentCount: number;
}

export function AdminTenantsTable({
  rows,
  adminEmail,
}: {
  rows: AdminTenantView[];
  adminEmail: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No workspaces yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Workspace</th>
            <th className="px-4 py-2.5 font-medium">Owner</th>
            <th className="px-4 py-2.5 font-medium">Plan</th>
            <th className="px-4 py-2.5 font-medium">Usage</th>
            <th className="px-4 py-2.5 font-medium">Joined</th>
            <th className="px-4 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <Row key={row.id} row={row} adminEmail={adminEmail} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row, adminEmail }: { row: AdminTenantView; adminEmail: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  const isSelf = row.ownerEmail === adminEmail;

  function impersonate() {
    startTransition(async () => {
      // On success this redirects to /dashboard; only errors return here.
      const res = await impersonateTenant(row.id);
      if (res && !res.ok) toast.error(res.error);
    });
  }

  function toggleSuspend() {
    if (row.suspended) {
      startTransition(async () => {
        const res = await unsuspendTenant(row.id);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(`${row.name} reinstated.`);
        router.refresh();
      });
      return;
    }
    const reason =
      window.prompt(
        `Suspend "${row.name}"? Its owner will be locked out immediately.\n\nOptional reason:`,
        "",
      );
    // prompt returns null when cancelled.
    if (reason === null) return;
    startTransition(async () => {
      const res = await suspendTenant({ tenantId: row.id, reason });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${row.name} suspended.`);
      router.refresh();
    });
  }

  return (
    <tr className={row.suspended ? "bg-destructive/5" : undefined}>
      <td className="px-4 py-3">
        <div className="font-medium">{row.name}</div>
        {row.suspended && (
          <Badge variant="destructive" className="mt-1">
            Suspended
          </Badge>
        )}
      </td>
      <td className="px-4 py-3">
        {row.ownerless ? (
          <span className="text-muted-foreground">— unclaimed —</span>
        ) : (
          <div>
            <div>{row.ownerName ?? "—"}</div>
            <div className="text-xs text-muted-foreground">{row.ownerEmail}</div>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge variant={row.plan === "free" ? "secondary" : "default"}>
          {row.plan === "pro" ? "Pro" : row.plan === "basic" ? "Basic" : "Free"}
        </Badge>
        {row.plan !== "free" && row.billingCycle && (
          <div className="mt-1 text-xs text-muted-foreground">{row.billingCycle}</div>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        <div>{row.messageCount.toLocaleString("en-IN")} msgs</div>
        <div>
          {row.conversationCount} convos · {row.staffCount} team · {row.documentCount} docs
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {new Date(row.createdAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={impersonate}
            disabled={busy || row.ownerless}
            title={row.ownerless ? "No owner to view as" : "View as this workspace"}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
            View as
          </Button>
          <Button
            variant={row.suspended ? "outline" : "destructive"}
            size="sm"
            onClick={toggleSuspend}
            disabled={busy || row.ownerless || isSelf}
            title={isSelf ? "You can't suspend yourself" : undefined}
          >
            {row.suspended ? (
              <>
                <RotateCcw className="size-4" /> Reinstate
              </>
            ) : (
              <>
                <Ban className="size-4" /> Suspend
              </>
            )}
          </Button>
        </div>
      </td>
    </tr>
  );
}
