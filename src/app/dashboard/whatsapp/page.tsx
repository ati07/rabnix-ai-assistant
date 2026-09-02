import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappConnections } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import { clientEnv } from "@/lib/env";
import { isEncryptionConfigured } from "@/lib/crypto";
import {
  CloudApiSetup,
  type CloudApiState,
} from "@/components/dashboard/cloud-api-setup";

export default async function WhatsAppPage() {
  const tenant = await requireTenant();

  const cloud = await db.query.whatsappConnections.findFirst({
    where: and(
      eq(whatsappConnections.tenantId, tenant.id),
      eq(whatsappConnections.channelType, "cloud_api"),
    ),
  });

  const cloudState: CloudApiState = {
    configured: Boolean(cloud?.cloudApiConfig),
    status: cloud?.status ?? "disconnected",
    phoneNumberId: cloud?.cloudApiConfig?.phoneNumberId ?? null,
    wabaId: cloud?.cloudApiConfig?.wabaId ?? null,
    verifyToken: cloud?.cloudApiConfig?.verifyToken ?? null,
  };

  const webhookUrl = `${clientEnv.NEXT_PUBLIC_APP_URL}/api/whatsapp/cloud/webhook`;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">WhatsApp</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Connect a WhatsApp number via the official Cloud API so the assistant can
        reply to customers.
      </p>

      <CloudApiSetup
        initial={cloudState}
        webhookUrl={webhookUrl}
        encryptionReady={isEncryptionConfigured()}
      />
    </div>
  );
}
