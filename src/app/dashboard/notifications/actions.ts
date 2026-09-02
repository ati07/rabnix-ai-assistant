"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function markNotificationRead(
  id: string,
  read = true,
): Promise<ActionResult> {
  const tenant = await requireTenant();
  await db
    .update(notifications)
    .set({ read })
    .where(and(eq(notifications.id, id), eq(notifications.tenantId, tenant.id)));
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const tenant = await requireTenant();
  await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(eq(notifications.tenantId, tenant.id), eq(notifications.read, false)),
    );
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteNotification(id: string): Promise<ActionResult> {
  const tenant = await requireTenant();
  await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.tenantId, tenant.id)));
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  return { ok: true };
}
