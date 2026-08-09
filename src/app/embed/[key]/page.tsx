import { findByPublicKey } from "@/lib/chat/web-config";
import { ChatWindow } from "@/components/chat/chat-window";

export const runtime = "nodejs";

/**
 * The chat surface rendered *inside the widget iframe* (our own origin, so its
 * `/api/chat/*` calls are same-origin — no CORS). Minimal chrome: no dashboard
 * layout, no auth. Resolves the public config server-side for a fast first paint.
 */
export default async function EmbedPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const config = await findByPublicKey(key);

  if (!config || !config.enabled) {
    return (
      <main className="flex h-dvh items-center justify-center bg-background p-6 text-center">
        <p className="text-sm text-muted-foreground">
          This chat is currently unavailable.
        </p>
      </main>
    );
  }

  return (
    <ChatWindow
      chatKey={key}
      greeting={config.greeting}
      themeColor={config.themeColor}
      launcherLabel={config.launcherLabel}
    />
  );
}
