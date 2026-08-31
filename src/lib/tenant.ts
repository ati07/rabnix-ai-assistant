import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, businessConfig, staff } from "@/lib/db/schema";
import { getSessionUser as getAuthUser } from "@/lib/auth";
import { getImpersonatedTenantId } from "@/lib/impersonation";

export type Tenant = typeof tenants.$inferSelect;

/** A user's role within their active tenant. */
export type MembershipRole = "owner" | "staff";

/**
 * The current user's relationship to a tenant. Owners reach their tenant via
 * `tenants.ownerUserId`; staff join an existing tenant via `staff.userId` (the
 * invite flow). `staffId` is set only for staff memberships.
 */
export interface Membership {
  user: SessionUser;
  tenant: Tenant;
  role: MembershipRole;
  staffId?: string;
  /** True when a platform admin is viewing this tenant via impersonation. */
  impersonating?: boolean;
}

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
 * Resolve the current user's tenant membership, or `null` when signed out.
 *
 * Resolution order (one account = one business):
 *   1. Owner — a tenant whose `ownerUserId` is this user.
 *   2. Staff — a `staff` row whose `userId` is this user (joined via invite);
 *      the linked tenant is returned with role "staff".
 *   3. Otherwise the user is a brand-new owner: lazily create their tenant
 *      (+ an empty `business_config`) on first access.
 */
export async function getActiveMembership(): Promise<Membership | null> {
  const u = await getSessionUser();
  if (!u) return null;

  // 0. Platform admin impersonating a tenant — resolve that tenant directly and
  //    grant owner-level access to it (god view). Never lazily provisions.
  const impersonatedId = await getImpersonatedTenantId(u);
  if (impersonatedId) {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, impersonatedId),
    });
    if (tenant) {
      return { user: u, tenant, role: "owner", impersonating: true };
    }
  }

  // 1. Owner of an existing tenant.
  const owned = await db.query.tenants.findFirst({
    where: eq(tenants.ownerUserId, u.id),
  });
  if (owned) return { user: u, tenant: owned, role: "owner" };

  // 2. Staff member of someone else's tenant.
  const staffRow = await db.query.staff.findFirst({
    where: eq(staff.userId, u.id),
  });
  if (staffRow) {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, staffRow.tenantId),
    });
    if (tenant) {
      return {
        user: u,
        tenant,
        role: staffRow.role === "owner" ? "owner" : "staff",
        staffId: staffRow.id,
      };
    }
  }

  // 3. New owner — provision their tenant now.
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

  return { user: u, tenant, role: "owner" };
}

/** Like {@link getActiveMembership} but throws when signed out. */
export async function requireMembership(): Promise<Membership> {
  const m = await getActiveMembership();
  if (!m) throw new Error("No active workspace for this request.");
  return m;
}

/** Throws unless the current user is the owner of their active tenant. */
export async function requireOwner(): Promise<Membership> {
  const m = await requireMembership();
  if (m.role !== "owner") throw new Error("Forbidden — owner only.");
  return m;
}

/**
 * Resolve the current request's tenant, creating it on first access.
 * Thin wrapper over {@link getActiveMembership} for the many callers that only
 * need the tenant. Returns `null` when signed out.
 */
export async function getActiveTenant(): Promise<Tenant | null> {
  const m = await getActiveMembership();
  return m?.tenant ?? null;
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
