import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappConnections } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET() {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conn = await db.query.whatsappConnections.findFirst({
    where: and(
      eq(whatsappConnections.tenantId, tenant.id),
      eq(whatsappConnections.channelType, "baileys"),
    ),
  });

  return Response.json({
    status: conn?.status ?? "disconnected",
    qr: conn?.qrCode ?? null,
    phoneNumber: conn?.phoneNumber ?? null,
    displayName: conn?.displayName ?? null,
    lastConnectedAt: conn?.lastConnectedAt ?? null,
  });
}
