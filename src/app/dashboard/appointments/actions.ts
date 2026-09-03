"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { appointments, appointmentStatusEnum } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";

export type ActionResult = { ok: true } | { ok: false; error: string };

const statusSchema = z.enum(appointmentStatusEnum.enumValues);

/**
 * Change an appointment's status (e.g. confirm, complete, cancel, no-show).
 * Tenant-scoped: only touches rows owned by the caller's workspace.
 */
export async function updateAppointmentStatus(
  id: string,
  status: string,
): Promise<ActionResult> {
  const tenant = await requireTenant();

  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) {
    return { ok: false, error: "Unknown status." };
  }

  await db
    .update(appointments)
    .set({ status: parsed.data })
    .where(and(eq(appointments.id, id), eq(appointments.tenantId, tenant.id)));

  revalidatePath("/dashboard/appointments");
  return { ok: true };
}
