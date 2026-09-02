"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, tenants, users } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/tenant";
import {
  clearImpersonation,
  setImpersonation,
} from "@/lib/impersonation";

export type ActionResult = { ok: true } | { ok: false; error: string };

const tenantIdSchema = z.string().uuid();
const suspendSchema = z.object({
  tenantId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

type OwnerLookup =
  | { ok: true; owner: { id: string; role: string } }
  | { ok: false; error: string };

/** Resolve a tenant's owner user (with role) for admin mutations. */
async function ownerOf(tenantId: string): Promise<OwnerLookup> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { id: true, ownerUserId: true },
  });
  if (!tenant) return { ok: false, error: "That workspace no longer exists." };
  if (!tenant.ownerUserId) {
    return { ok: false, error: "This workspace has no owner to act on." };
  }
  const owner = await db.query.users.findFirst({
    where: eq(users.id, tenant.ownerUserId),
    columns: { id: true, role: true },
  });
  if (!owner) return { ok: false, error: "The owner account no longer exists." };
  return { ok: true, owner };
}

/**
 * Suspend a client by banning its owner user. A banned user's sessions are
 * rejected on their next request (see getSessionUser), and we also drop their
 * live sessions here for an immediate lock-out. Platform admins can't be
 * suspended. Platform-admin only.
 */
export async function suspendTenant(
  input: z.input<typeof suspendSchema>,
): Promise<ActionResult> {
  await requirePlatformAdmin();
  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const res = await ownerOf(parsed.data.tenantId);
  if (!res.ok) return res;
  if (res.owner.role === "platform_admin") {
    return { ok: false, error: "You can't suspend a platform admin." };
  }

  await db
    .update(users)
    .set({
      banned: true,
      banReason: parsed.data.reason || "Suspended by platform admin.",
      updatedAt: new Date(),
    })
    .where(eq(users.id, res.owner.id));
  // Immediate lock-out: drop the owner's live sessions.
  await db.delete(sessions).where(eq(sessions.userId, res.owner.id));

  revalidatePath("/admin");
  return { ok: true };
}

/** Lift a suspension. Platform-admin only. */
export async function unsuspendTenant(tenantId: string): Promise<ActionResult> {
  await requirePlatformAdmin();
  if (!tenantIdSchema.safeParse(tenantId).success) {
    return { ok: false, error: "Invalid request." };
  }
  const res = await ownerOf(tenantId);
  if (!res.ok) return res;

  await db
    .update(users)
    .set({ banned: false, banReason: null, banExpires: null, updatedAt: new Date() })
    .where(eq(users.id, res.owner.id));

  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Begin impersonating a tenant, then land in its dashboard. Sets the admin-only
 * impersonation cookie (honored only for platform admins). Platform-admin only.
 */
export async function impersonateTenant(tenantId: string): Promise<ActionResult> {
  await requirePlatformAdmin();
  if (!tenantIdSchema.safeParse(tenantId).success) {
    return { ok: false, error: "Invalid request." };
  }
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { id: true },
  });
  if (!tenant) return { ok: false, error: "That workspace no longer exists." };

  await setImpersonation(tenantId);
  redirect("/dashboard");
}

/** Stop impersonating and return to the admin console. */
export async function stopImpersonating(): Promise<void> {
  await clearImpersonation();
  redirect("/admin");
}
