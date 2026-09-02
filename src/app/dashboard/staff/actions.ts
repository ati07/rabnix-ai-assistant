"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { staff, staffInvites } from "@/lib/db/schema";
import { requireOwner, requireTenant } from "@/lib/tenant";
import { getEntitlements } from "@/lib/billing/subscription";
import {
  createInvite,
  inviteUrl,
  revokeInvite,
  sendInviteEmail,
} from "@/lib/invites";

export type ActionResult = { ok: true } | { ok: false; error: string };

const staffSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z
    .string()
    .trim()
    .email("Enter a valid email.")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  role: z.enum(["owner", "staff"]),
  notifyChannels: z
    .array(z.enum(["whatsapp", "email", "dashboard"]))
    .default(["dashboard"]),
});

export type StaffInput = z.input<typeof staffSchema>;

/** Normalize + validate a staff payload, and enforce channel prerequisites. */
function validate(payload: StaffInput):
  | { ok: true; value: z.output<typeof staffSchema> }
  | { ok: false; error: string } {
  const parsed = staffSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const value = parsed.data;

  // Dashboard is always on — it's the durable feed.
  const channels = new Set(value.notifyChannels);
  channels.add("dashboard");
  value.notifyChannels = [...channels];

  if (channels.has("whatsapp") && !value.phone) {
    return { ok: false, error: "Add a phone number to notify this person on WhatsApp." };
  }
  if (channels.has("email") && !value.email) {
    return { ok: false, error: "Add an email to notify this person by email." };
  }
  return { ok: true, value };
}

/**
 * Count seats a tenant is using toward its plan's `maxStaff` limit: existing
 * staff rows plus still-pending (unaccepted, unexpired) invites, since each
 * invite will become a seat once accepted.
 */
async function usedSeats(tenantId: string): Promise<number> {
  const [staffRow] = await db
    .select({ n: count() })
    .from(staff)
    .where(eq(staff.tenantId, tenantId));
  const [inviteRow] = await db
    .select({ n: count() })
    .from(staffInvites)
    .where(
      and(
        eq(staffInvites.tenantId, tenantId),
        isNull(staffInvites.acceptedAt),
        gt(staffInvites.expiresAt, new Date()),
      ),
    );
  return (staffRow?.n ?? 0) + (inviteRow?.n ?? 0);
}

const SEAT_LIMIT_MESSAGE =
  "You've reached your plan's team limit. Upgrade to Pro to add more.";

export async function addStaff(payload: StaffInput): Promise<ActionResult> {
  const tenant = await requireTenant();
  const res = validate(payload);
  if (!res.ok) return res;

  const ent = await getEntitlements(tenant.id);
  if ((await usedSeats(tenant.id)) >= ent.maxStaff) {
    return { ok: false, error: SEAT_LIMIT_MESSAGE };
  }

  await db.insert(staff).values({
    tenantId: tenant.id,
    name: res.value.name,
    email: res.value.email || null,
    phone: res.value.phone || null,
    role: res.value.role,
    notifyChannels: res.value.notifyChannels,
  });
  revalidatePath("/dashboard/staff");
  return { ok: true };
}

export async function updateStaff(
  id: string,
  payload: StaffInput,
): Promise<ActionResult> {
  const tenant = await requireTenant();
  const res = validate(payload);
  if (!res.ok) return res;

  await db
    .update(staff)
    .set({
      name: res.value.name,
      email: res.value.email || null,
      phone: res.value.phone || null,
      role: res.value.role,
      notifyChannels: res.value.notifyChannels,
    })
    .where(and(eq(staff.id, id), eq(staff.tenantId, tenant.id)));
  revalidatePath("/dashboard/staff");
  return { ok: true };
}

export async function deleteStaff(id: string): Promise<ActionResult> {
  const tenant = await requireTenant();
  await db
    .delete(staff)
    .where(and(eq(staff.id, id), eq(staff.tenantId, tenant.id)));
  revalidatePath("/dashboard/staff");
  return { ok: true };
}

// ── Invites (owner only) ─────────────────────────────────────────────────

const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  role: z.enum(["owner", "staff"]).default("staff"),
});

export type InviteInput = z.input<typeof inviteSchema>;

/**
 * Invite a teammate by email. Owner-only. Emails a single-use accept link; when
 * no email provider is configured the raw link is returned so the owner can
 * share it manually. The token itself is never persisted or logged.
 */
export async function inviteTeammate(
  payload: InviteInput,
): Promise<ActionResult & { inviteUrl?: string }> {
  const { tenant, user } = await requireOwner();
  const parsed = inviteSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const ent = await getEntitlements(tenant.id);
  if ((await usedSeats(tenant.id)) >= ent.maxStaff) {
    return { ok: false, error: SEAT_LIMIT_MESSAGE };
  }

  const { token } = await createInvite({
    tenantId: tenant.id,
    email: parsed.data.email,
    role: parsed.data.role,
    invitedByUserId: user.id,
  });

  let delivered = false;
  try {
    delivered = await sendInviteEmail({
      to: parsed.data.email,
      tenantName: tenant.name,
      inviterName: user.name,
      token,
    });
  } catch (err) {
    console.error("[invite] email delivery failed:", err);
  }

  revalidatePath("/dashboard/staff");
  // Only hand the link back to the owner when we couldn't email it for them.
  if (delivered) return { ok: true };
  return { ok: true, inviteUrl: inviteUrl(token) };
}

/** Revoke a pending invite. Owner-only. */
export async function revokeInviteAction(id: string): Promise<ActionResult> {
  const { tenant } = await requireOwner();
  await revokeInvite({ id, tenantId: tenant.id });
  revalidatePath("/dashboard/staff");
  return { ok: true };
}
