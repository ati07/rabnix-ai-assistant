import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { appointments, customers } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import {
  CustomersList,
  type CustomerRow,
} from "@/components/dashboard/customers-list";

export default async function CustomersPage() {
  const tenant = await requireTenant();

  const rows = await db
    .select({
      id: customers.id,
      phone: customers.phone,
      name: customers.name,
      email: customers.email,
      tags: customers.tags,
      leadStatus: customers.leadStatus,
      source: customers.source,
      lastSeenAt: customers.lastSeenAt,
      createdAt: customers.createdAt,
      appointmentCount: count(appointments.id),
    })
    .from(customers)
    .leftJoin(appointments, eq(appointments.customerId, customers.id))
    .where(eq(customers.tenantId, tenant.id))
    .groupBy(customers.id)
    .orderBy(
      desc(sql`coalesce(${customers.lastSeenAt}, ${customers.createdAt})`),
    );

  const list: CustomerRow[] = rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    name: r.name,
    email: r.email,
    tags: r.tags ?? [],
    leadStatus: r.leadStatus,
    source: r.source,
    appointmentCount: Number(r.appointmentCount),
    lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Customers &amp; leads</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Everyone who has messaged you across WhatsApp and web chat. The assistant
        builds these records as it talks to people — filter by stage, or export
        them all to a spreadsheet.
      </p>
      <CustomersList customers={list} />
    </div>
  );
}
