import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, businessConfig } from "@/lib/db/schema";
import { getSessionUser as getAuthUser } from "@/lib/auth";

export type Tenant = typeof tenants.$inferSelect;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  /** "user" (business owner/staff) | "platform_admin" (us). */
  role: string;
}

/** The authenticated user for the current request, or null when signed out. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const u = await getAuthUser();
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

/** Like {@link getSessionUser} but throws when signed out. */
export async function requireSessionUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new Error("Not authenticated.");
  return u;
}

/** Throws unless the current user is the platform operator. Gate `/admin` with this. */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const u = await requireSessionUser();
  if (u.role !== "platform_admin") throw new Error("Forbidden — platform admin only.");
  return u;
}

/**
 * Resolve the tenant owned by the current user, creating it (+ an empty
 * `business_config`) on first access.
 *
 * Tenancy rule: one account = one business. The owner is `tenants.ownerUserId`;
 * staff join an existing tenant via `staff.userId` (a future invite flow).
 *
 * Returns `null` when signed out.
 */
export async function getActiveTenant(): Promise<Tenant | null> {
  const u = await getSessionUser();
  if (!u) return null;

  const existing = await db.query.tenants.findFirst({
    where: eq(tenants.ownerUserId, u.id),
  });
  if (existing) return existing;

  const name = deriveWorkspaceName(u);
  // Slug is unique per tenant; suffix with the user id so two "My Business"
  // signups can't collide.
  const slug = `${slugify(name)}-${u.id.slice(-6)}`;

  // Idempotent under the unique owner_user_id index (handles double-submits/races).
  await db
    .insert(tenants)
    .values({ ownerUserId: u.id, name, slug })
    .onConflictDoNothing();

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.ownerUserId, u.id),
  });
  if (!tenant) return null;

  await db
    .insert(businessConfig)
    .values({ tenantId: tenant.id, displayName: name })
    .onConflictDoNothing();

  return tenant;
}

/** Like {@link getActiveTenant} but throws when there is no active workspace. */
export async function requireTenant(): Promise<Tenant> {
  const tenant = await getActiveTenant();
  if (!tenant) throw new Error("No active workspace for this request.");
  return tenant;
}

function deriveWorkspaceName(u: SessionUser): string {
  if (u.name?.trim()) return u.name.trim();
  const local = u.email.split("@")[0];
  return local ? `${local}'s Business` : "My Business";
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}
