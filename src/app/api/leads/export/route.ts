import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { appointments, customers, leadStatusEnum } from "@/lib/db/schema";
import { getActiveTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LeadStatus = (typeof leadStatusEnum.enumValues)[number];

const COLUMNS = [
  "Name",
  "Phone",
  "Email",
  "Lead Status",
  "Source",
  "Tags",
  "Appointments",
  "Last Seen",
  "Created",
  "Notes",
] as const;

/**
 * Download the current tenant's leads (every WhatsApp/web contact) as a CSV that
 * opens directly in Excel / Google Sheets.
 *
 * `GET /api/leads/export?status=new` — optional `status` filter mirrors the
 * Customers list. Auth is enforced here (this route lives outside `/dashboard`,
 * which is all `proxy.ts` guards): signed out → 401.
 */
export async function GET(req: Request) {
  const tenant = await getActiveTenant();
  if (!tenant) {
    return new Response("Unauthorized", { status: 401 });
  }

  const statusParam = new URL(req.url).searchParams.get("status");
  const status = isLeadStatus(statusParam) ? statusParam : null;

  const rows = await db
    .select({
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      leadStatus: customers.leadStatus,
      source: customers.source,
      tags: customers.tags,
      notes: customers.notes,
      lastSeenAt: customers.lastSeenAt,
      createdAt: customers.createdAt,
      appointmentCount: count(appointments.id),
    })
    .from(customers)
    .leftJoin(appointments, eq(appointments.customerId, customers.id))
    .where(
      status
        ? sql`${customers.tenantId} = ${tenant.id} and ${customers.leadStatus} = ${status}`
        : eq(customers.tenantId, tenant.id),
    )
    .groupBy(customers.id)
    .orderBy(desc(sql`coalesce(${customers.lastSeenAt}, ${customers.createdAt})`));

  const lines = [
    COLUMNS.map(csvCell).join(","),
    ...rows.map((r) =>
      [
        r.name ?? "",
        r.phone,
        r.email ?? "",
        r.leadStatus,
        r.source ?? "",
        (r.tags ?? []).join("; "),
        String(Number(r.appointmentCount)),
        r.lastSeenAt?.toISOString() ?? "",
        r.createdAt.toISOString(),
        r.notes ?? "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ];

  // Prepend a UTF-8 BOM so Excel reads non-ASCII (names/emoji) correctly.
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const date = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}

function isLeadStatus(v: string | null): v is LeadStatus {
  return v != null && (leadStatusEnum.enumValues as readonly string[]).includes(v);
}

/** Quote a CSV field and escape embedded quotes (RFC 4180). */
function csvCell(value: string): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}
