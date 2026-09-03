import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appointments, businessConfig, customers, staff } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import {
  AppointmentsCalendar,
  type AppointmentRow,
} from "@/components/dashboard/appointments-calendar";

export default async function AppointmentsPage() {
  const tenant = await requireTenant();

  const [cfg, rows] = await Promise.all([
    db.query.businessConfig.findFirst({
      where: eq(businessConfig.tenantId, tenant.id),
      columns: { timezone: true },
    }),
    db
      .select({
        id: appointments.id,
        serviceName: appointments.serviceName,
        startAt: appointments.startAt,
        endAt: appointments.endAt,
        status: appointments.status,
        source: appointments.source,
        notes: appointments.notes,
        customerId: appointments.customerId,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerEmail: customers.email,
        customerSource: customers.source,
        staffName: staff.name,
      })
      .from(appointments)
      .leftJoin(customers, eq(customers.id, appointments.customerId))
      .leftJoin(staff, eq(staff.id, appointments.staffId))
      .where(eq(appointments.tenantId, tenant.id))
      .orderBy(asc(appointments.startAt)),
  ]);

  const timezone = cfg?.timezone || "UTC";

  const list: AppointmentRow[] = rows.map((r) => ({
    id: r.id,
    serviceName: r.serviceName,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    status: r.status,
    source: r.source,
    notes: r.notes,
    customerId: r.customerId,
    customerName: r.customerName,
    // A web visitor's `phone` is an anonymous session id, not a number — only
    // surface a phone as a contact for WhatsApp-sourced customers.
    customerContact:
      r.customerEmail?.trim() ||
      (r.customerSource === "web" ? null : r.customerPhone) ||
      null,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">Appointments</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Every booking your assistant and team have made, on a calendar. Pick a
        day to see its schedule, or switch to a list. Update a status to keep
        your records tidy.
      </p>
      <AppointmentsCalendar appointments={list} timezone={timezone} />
    </div>
  );
}
