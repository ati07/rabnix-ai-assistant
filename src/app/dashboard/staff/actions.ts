"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { staff } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";

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

export async function addStaff(payload: StaffInput): Promise<ActionResult> {
  const tenant = await requireTenant();
  const res = validate(payload);
  if (!res.ok) return res;

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
