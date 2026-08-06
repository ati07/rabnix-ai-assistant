import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappConnections } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import {
  WhatsAppConnect,
  type WhatsAppStatus,
} from "@/components/dashboard/whatsapp-connect";

export default async function WhatsAppPage() {
  const tenant = await requireTenant();

  const conn = await db.query.whatsappConnections.findFirst({
    where: and(
      eq(whatsappConnections.tenantId, tenant.id),
      eq(whatsappConnections.channelType, "baileys"),
    ),
  });

  const initial: WhatsAppStatus = {
    status: conn?.status ?? "disconnected",
    qr: conn?.qrCode ?? null,
    phoneNumber: conn?.phoneNumber ?? null,
    displayName: conn?.displayName ?? null,
    lastConnectedAt: conn?.lastConnectedAt?.toISOString() ?? null,
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">WhatsApp</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Link your WhatsApp number so the assistant can reply to customers.
      </p>
      <WhatsAppConnect initial={initial} />
    </div>
  );
}
