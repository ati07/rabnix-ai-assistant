import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { whatsappConnections } from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import { clientEnv } from "@/lib/env";
import { isEncryptionConfigured } from "@/lib/crypto";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WhatsAppConnect,
  type WhatsAppStatus,
} from "@/components/dashboard/whatsapp-connect";
import {
  CloudApiSetup,
  type CloudApiState,
} from "@/components/dashboard/cloud-api-setup";

export default async function WhatsAppPage() {
  const tenant = await requireTenant();

  const [baileys, cloud] = await Promise.all([
    db.query.whatsappConnections.findFirst({
      where: and(
        eq(whatsappConnections.tenantId, tenant.id),
        eq(whatsappConnections.channelType, "baileys"),
      ),
    }),
    db.query.whatsappConnections.findFirst({
      where: and(
        eq(whatsappConnections.tenantId, tenant.id),
        eq(whatsappConnections.channelType, "cloud_api"),
      ),
    }),
  ]);

  const baileysState: WhatsAppStatus = {
    status: baileys?.status ?? "disconnected",
    qr: baileys?.qrCode ?? null,
    phoneNumber: baileys?.phoneNumber ?? null,
    displayName: baileys?.displayName ?? null,
    lastConnectedAt: baileys?.lastConnectedAt?.toISOString() ?? null,
  };

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
        Connect a WhatsApp number so the assistant can reply to customers. Use the
        official Cloud API for production, or link a personal number via QR to try
        it out.
      </p>

      <Tabs defaultValue={cloudState.configured ? "cloud" : "qr"}>
        <TabsList className="mb-4">
          <TabsTrigger value="cloud">Official (Cloud API)</TabsTrigger>
          <TabsTrigger value="qr">Quick link (QR)</TabsTrigger>
        </TabsList>
        <TabsContent value="cloud">
          <CloudApiSetup
            initial={cloudState}
            webhookUrl={webhookUrl}
            encryptionReady={isEncryptionConfigured()}
          />
        </TabsContent>
        <TabsContent value="qr">
          <WhatsAppConnect initial={baileysState} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
