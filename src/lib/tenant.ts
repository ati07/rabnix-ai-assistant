import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, businessConfig } from "@/lib/db/schema";

export type Tenant = typeof tenants.$inferSelect;

/**
 * Resolve the tenant for the current request's active Clerk Organization,
 * creating the `tenant` (+ empty `business_config`) on first access.
 *
 * Returns `null` when the user has no active organization — the dashboard then
 * prompts them to create/select a workspace.
 *
 * Tenancy rule: a Clerk Organization == a Workspace == a `tenant`.
 */
export async function getActiveTenant(): Promise<Tenant | null> {
  const { orgId, orgSlug } = await auth();
  if (!orgId) return null;

  const existing = await db.query.tenants.findFirst({
    where: eq(tenants.clerkOrgId, orgId),
  });
  if (existing) return existing;

  const name = orgSlug ?? "My Business";

  // Insert is idempotent under the unique clerk_org_id index (handles races).
  await db
    .insert(tenants)
    .values({ clerkOrgId: orgId, name, slug: orgSlug ?? orgId })
    .onConflictDoNothing();

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.clerkOrgId, orgId),
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
  if (!tenant) throw new Error("No active workspace/organization for this request.");
  return tenant;
}
