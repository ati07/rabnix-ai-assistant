import { cookies } from "next/headers";
import type { SessionUser } from "@/lib/tenant";

/**
 * Platform-admin impersonation ("view as tenant").
 *
 * A separate httpOnly cookie holds the impersonated tenant id. It is ONLY ever
 * honored when the *real* session user is a `platform_admin` (checked at read
 * time), so a forged cookie is worthless without an admin session. The admin's
 * own session/identity is untouched — impersonation only redirects tenant
 * resolution (see src/lib/tenant.ts) so the dashboard renders that tenant's data.
 */
export const IMPERSONATION_COOKIE = "rabnix_impersonate";

const isProd = process.env.NODE_ENV === "production";

/**
 * The tenant the current admin is impersonating, or null. Returns null for any
 * non-admin, so this is safe to call from shared tenant-resolution code.
 */
export async function getImpersonatedTenantId(
  user: SessionUser | null,
): Promise<string | null> {
  if (!user || user.role !== "platform_admin") return null;
  const store = await cookies();
  return store.get(IMPERSONATION_COOKIE)?.value ?? null;
}

/** Begin impersonating a tenant. Caller MUST have verified platform-admin. */
export async function setImpersonation(tenantId: string): Promise<void> {
  const store = await cookies();
  store.set(IMPERSONATION_COOKIE, tenantId, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
  });
}

/** Stop impersonating (clears the cookie). Safe when not impersonating. */
export async function clearImpersonation(): Promise<void> {
  const store = await cookies();
  store.delete(IMPERSONATION_COOKIE);
}
