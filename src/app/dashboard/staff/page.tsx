import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { staff, staffInvites } from "@/lib/db/schema";
import { requireMembership } from "@/lib/tenant";
import {
  StaffManager,
  type StaffMember,
} from "@/components/dashboard/staff-manager";
import {
  InviteManager,
  type PendingInvite,
} from "@/components/dashboard/invite-manager";

export default async function StaffPage() {
  const { tenant, role } = await requireMembership();
  const isOwner = role === "owner";

  // Staff list and pending invites are independent — fetch them together.
  // Only owners manage invites, so skip that query otherwise.
  const [rows, inviteRows] = await Promise.all([
    db
      .select()
      .from(staff)
      .where(eq(staff.tenantId, tenant.id))
      .orderBy(asc(staff.name)),
    isOwner
      ? db
          .select()
          .from(staffInvites)
          .where(
            and(
              eq(staffInvites.tenantId, tenant.id),
              isNull(staffInvites.acceptedAt),
              gt(staffInvites.expiresAt, new Date()),
            ),
          )
          .orderBy(asc(staffInvites.email))
      : Promise.resolve([]),
  ]);

  const members: StaffMember[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    notifyChannels: r.notifyChannels ?? ["dashboard"],
    hasLogin: Boolean(r.userId),
  }));

  const invites: PendingInvite[] = inviteRows.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    expiresAt: i.expiresAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="mt-1 text-muted-foreground">
          Add your team so the assistant can alert them about bookings, escalations,
          and anything that needs a human.
        </p>
      </div>

      {isOwner && <InviteManager invites={invites} />}

      <StaffManager members={members} />
    </div>
  );
}
