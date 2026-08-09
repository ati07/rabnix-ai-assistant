import { requireTenant } from "@/lib/tenant";
import { getOrCreateForTenant } from "@/lib/chat/web-config";
import { clientEnv } from "@/lib/env";
import {
  ChatbotSettings,
  type ChatbotState,
} from "@/components/dashboard/chatbot-settings";

export default async function ChatbotPage() {
  const tenant = await requireTenant();
  const config = await getOrCreateForTenant(tenant.id);

  const state: ChatbotState = {
    enabled: config.enabled,
    publicKey: config.publicKey,
    greeting: config.greeting,
    themeColor: config.themeColor,
    launcherLabel: config.launcherLabel,
    allowedOrigins: config.allowedOrigins,
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Web Chat</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        Add an AI chat widget to your website. Anonymous visitors chat with the
        same assistant that answers on WhatsApp, and their conversations show up
        under Conversations.
      </p>

      <ChatbotSettings initial={state} appUrl={clientEnv.NEXT_PUBLIC_APP_URL} />
    </div>
  );
}
