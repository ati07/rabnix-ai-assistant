import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { appointments, conversations, customers, staff } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConversationStatusBadge } from "@/components/dashboard/conversation-status-badge";
import { CustomerProfile } from "@/components/dashboard/customer-profile";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await requireTenant();

  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, id), eq(customers.tenantId, tenant.id)),
  });
  if (!customer) notFound();

  const [appts, convos] = await Promise.all([
    db
      .select({
        id: appointments.id,
        serviceName: appointments.serviceName,
        startAt: appointments.startAt,
        status: appointments.status,
        notes: appointments.notes,
        staffName: staff.name,
      })
      .from(appointments)
      .leftJoin(staff, eq(appointments.staffId, staff.id))
      .where(
        and(
          eq(appointments.tenantId, tenant.id),
          eq(appointments.customerId, customer.id),
        ),
      )
      .orderBy(desc(appointments.startAt)),
    db
      .select({
        id: conversations.id,
        status: conversations.status,
        lastMessageAt: conversations.lastMessageAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, tenant.id),
          eq(conversations.customerId, customer.phone),
        ),
      )
      .orderBy(
        desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`),
      ),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/dashboard/customers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Customers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {customer.name || customer.phone}
        </h1>
        {customer.name && (
          <p className="text-muted-foreground">{customer.phone}</p>
        )}
      </div>

      <CustomerProfile
        customer={{
          id: customer.id,
          phone: customer.phone,
          name: customer.name ?? "",
          email: customer.email ?? "",
          tags: customer.tags ?? [],
          notes: customer.notes ?? "",
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Appointments ({appts.length})</CardTitle>
        </CardHeader>
        <CardContent className={appts.length === 0 ? "" : "divide-y p-0"}>
          {appts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments yet.</p>
          ) : (
            appts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-6 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.serviceName}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(a.startAt).toLocaleString()}
                    {a.staffName ? ` · ${a.staffName}` : ""}
                  </p>
                </div>
                <AppointmentBadge status={a.status} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conversations ({convos.length})</CardTitle>
        </CardHeader>
        <CardContent className={convos.length === 0 ? "" : "divide-y p-0"}>
          {convos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            convos.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/conversations/${c.id}`}
                className="flex items-center gap-3 px-6 py-3 hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground">
                    {c.lastMessageAt
                      ? `Last message ${new Date(c.lastMessageAt).toLocaleString()}`
                      : `Started ${new Date(c.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
                <ConversationStatusBadge status={c.status} />
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AppointmentBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge variant="secondary">Completed</Badge>;
  if (status === "confirmed") return <Badge>Confirmed</Badge>;
  if (status === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
  if (status === "no_show") return <Badge variant="destructive">No-show</Badge>;
  return <Badge variant="secondary">Scheduled</Badge>;
}
