import { requirePlatformAdmin } from "@/lib/tenant";
import { getPlatformStats, listTenants } from "@/lib/admin";
import { formatINR } from "@/lib/billing/plans";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AdminTenantsTable,
  type AdminTenantView,
} from "@/components/admin/tenants-table";

export default async function AdminPage() {
  const admin = await requirePlatformAdmin();
  const [stats, tenants] = await Promise.all([
    getPlatformStats(),
    listTenants(),
  ]);

  const rows: AdminTenantView[] = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    ownerName: t.ownerName,
    ownerEmail: t.ownerEmail,
    ownerless: t.ownerUserId == null,
    suspended: t.suspended,
    plan: t.plan,
    status: t.status,
    billingCycle: t.billingCycle,
    createdAt: t.createdAt.toISOString(),
    staffCount: t.staffCount,
    conversationCount: t.conversationCount,
    messageCount: t.messageCount,
    documentCount: t.documentCount,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Platform overview</h1>
        <p className="mt-1 text-muted-foreground">
          Every workspace on Rabnix. Impersonate to troubleshoot, or suspend to
          lock out abuse.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="MRR" value={formatINR(stats.mrr)} hint="monthly recurring" />
        <Stat label="Pro workspaces" value={stats.proTenants} hint={`of ${stats.totalTenants} total`} />
        <Stat label="Active (7d)" value={stats.activeTenants7d} hint="sent messages" />
        <Stat label="New (30d)" value={stats.newTenants30d} hint="signups" />
        <Stat label="Total workspaces" value={stats.totalTenants} />
        <Stat label="Suspended" value={stats.suspendedTenants} />
        <Stat label="Total messages" value={stats.totalMessages.toLocaleString("en-IN")} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">Workspaces</h2>
        <AdminTenantsTable rows={rows} adminEmail={admin.email} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
