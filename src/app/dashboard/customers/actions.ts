"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";

export type ActionResult = { ok: true } | { ok: false; error: string };

const updateSchema = z.object({
  name: z.string().trim().max(200).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("Enter a valid email.")
    .optional()
    .or(z.literal("")),
  tags: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
});

export type CustomerUpdateInput = z.input<typeof updateSchema>;

export async function updateCustomer(
  id: string,
  payload: CustomerUpdateInput,
): Promise<ActionResult> {
  const tenant = await requireTenant();

  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const v = parsed.data;

  // De-dupe + drop empties from tags.
  const tags = [...new Set(v.tags.map((t) => t.trim()).filter(Boolean))];

  await db
    .update(customers)
    .set({
      name: v.name || null,
      email: v.email || null,
      notes: v.notes || null,
      tags,
    })
    .where(and(eq(customers.id, id), eq(customers.tenantId, tenant.id)));

  revalidatePath(`/dashboard/customers/${id}`);
  revalidatePath("/dashboard/customers");
  return { ok: true };
}

/** Delete a customer. Cascades to their appointments — destructive. */
export async function deleteCustomer(id: string): Promise<ActionResult> {
  const tenant = await requireTenant();
  await db
    .delete(customers)
    .where(and(eq(customers.id, id), eq(customers.tenantId, tenant.id)));
  revalidatePath("/dashboard/customers");
  return { ok: true };
}
