import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import {
  StaffManager,
  type StaffMember,
} from "@/components/dashboard/staff-manager";

export default async function StaffPage() {
  const tenant = await requireTenant();

  const rows = await db
    .select()
    .from(staff)
    .where(eq(staff.tenantId, tenant.id))
    .orderBy(asc(staff.name));

  const members: StaffMember[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    notifyChannels: r.notifyChannels ?? ["dashboard"],
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Team</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Add your team so the assistant can alert them about bookings, escalations, and
        anything that needs a human.
      </p>
      <StaffManager members={members} />
    </div>
  );
}
