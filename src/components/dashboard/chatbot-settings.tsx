"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  rotateWebChatKey,
  saveWebChatConfig,
} from "@/app/dashboard/chatbot/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export interface ChatbotState {
  enabled: boolean;
  publicKey: string;
  greeting: string;
  themeColor: string;
  launcherLabel: string;
  allowedOrigins: string[];
}

export function ChatbotSettings({
  initial,
  appUrl,
}: {
  initial: ChatbotState;
  appUrl: string;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [rotating, startRotate] = useTransition();

  const [enabled, setEnabled] = useState(initial.enabled);
  const [greeting, setGreeting] = useState(initial.greeting);
  const [themeColor, setThemeColor] = useState(initial.themeColor);
  const [launcherLabel, setLauncherLabel] = useState(initial.launcherLabel);
  const [origins, setOrigins] = useState(initial.allowedOrigins.join("\n"));
  const [publicKey, setPublicKey] = useState(initial.publicKey);

  const snippet = `<script src="${appUrl}/widget.js" data-chat-key="${publicKey}" async></script>`;
  const embedUrl = `${appUrl}/embed/${publicKey}`;

  function save() {
    const allowedOrigins = origins
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    startSave(async () => {
      const res = await saveWebChatConfig({
        enabled,
        greeting,
        themeColor,
        launcherLabel,
        allowedOrigins,
      });
      if (res.ok) {
        toast.success("Web chat settings saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function rotate() {
    if (
      !window.confirm(
        "Rotate the widget key? The current embed snippet will stop working until you replace it.",
      )
    ) {
      return;
    }
    startRotate(async () => {
      const res = await rotateWebChatKey();
      if (res.ok && res.publicKey) {
        setPublicKey(res.publicKey);
        toast.success("Key rotated — update the embed snippet on your site");
        router.refresh();
      } else if (!res.ok) {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-md border px-4 py-3">
        <div className="text-sm">
          <p className="font-medium">Enable web chat</p>
          <p className="text-muted-foreground">
            When off, the widget and its public endpoints are disabled.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* Appearance */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="wc-greeting">Greeting</Label>
          <Input
            id="wc-greeting"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Hi! How can I help you today?"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wc-label">Launcher label</Label>
            <Input
              id="wc-label"
              value={launcherLabel}
              onChange={(e) => setLauncherLabel(e.target.value)}
              placeholder="Chat with us"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wc-color">Theme colour</Label>
            <div className="flex items-center gap-2">
              <input
                id="wc-color"
                type="color"
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                className="size-9 shrink-0 cursor-pointer rounded border bg-background"
                aria-label="Theme colour"
              />
              <Input
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                className="font-mono"
                placeholder="#4f46e5"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wc-origins">Allowed website origins (optional)</Label>
          <Textarea
            id="wc-origins"
            value={origins}
            onChange={(e) => setOrigins(e.target.value)}
            placeholder={"https://www.rabnix.com\nhttps://rabnix.com"}
            rows={3}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            One per line. Leave empty to allow the widget on any site.
          </p>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save changes
        </Button>
      </div>

      <Separator />

      {/* Embed snippet */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Embed snippet</Label>
          <div className="flex items-start gap-2">
            <Textarea
              readOnly
              value={snippet}
              rows={2}
              className="font-mono text-xs"
            />
            <CopyButton value={snippet} />
          </div>
          <p className="text-xs text-muted-foreground">
            Paste this just before <code className="rounded bg-muted px-1">&lt;/body&gt;</code>{" "}
            on your website.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={embedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ExternalLink className="size-4" />
            Preview chat
          </a>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={rotate}
            disabled={rotating}
          >
            {rotating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Rotate key
          </Button>
        </div>
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  );
}
