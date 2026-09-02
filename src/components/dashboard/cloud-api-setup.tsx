"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  disconnectCloudApi,
  saveCloudApiConfig,
} from "@/app/dashboard/whatsapp/cloud-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export interface CloudApiState {
  configured: boolean;
  status: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  verifyToken: string | null;
}

export function CloudApiSetup({
  initial,
  webhookUrl,
  encryptionReady,
}: {
  initial: CloudApiState;
  webhookUrl: string;
  encryptionReady: boolean;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [removing, startRemove] = useTransition();

  const [phoneNumberId, setPhoneNumberId] = useState(initial.phoneNumberId ?? "");
  const [wabaId, setWabaId] = useState(initial.wabaId ?? "");
  const [verifyToken, setVerifyToken] = useState(
    initial.verifyToken ?? suggestToken(),
  );
  const [accessToken, setAccessToken] = useState("");

  function save() {
    startSave(async () => {
      const res = await saveCloudApiConfig({
        phoneNumberId,
        wabaId,
        verifyToken,
        accessToken,
      });
      if (res.ok) {
        toast.success("Cloud API settings saved");
        setAccessToken("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function disconnect() {
    if (!window.confirm("Disconnect the official WhatsApp Cloud API for this workspace?")) {
      return;
    }
    startRemove(async () => {
      const res = await disconnectCloudApi();
      if (res.ok) {
        toast.success("Disconnected");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {!encryptionReady && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          Set <code className="rounded bg-muted px-1">ENCRYPTION_KEY</code> on the
          server before connecting — access tokens are stored encrypted.
        </p>
      )}

      {initial.configured && (
        <div className="flex items-center justify-between rounded-md border px-4 py-3">
          <div className="text-sm">
            <p className="font-medium">
              Connected to number ID {initial.phoneNumberId}
            </p>
            <p className="text-muted-foreground">
              The assistant replies over the official Cloud API.
            </p>
          </div>
          <StatusBadge status={initial.status} />
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Webhook callback URL</Label>
          <CopyField value={webhookUrl} />
          <p className="text-xs text-muted-foreground">
            In Meta → WhatsApp → Configuration, set this as the callback URL and
            paste the verify token below, then subscribe to the{" "}
            <b>messages</b> field.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ca-verify">Verify token</Label>
            <Input
              id="ca-verify"
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              placeholder="a secret you choose"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ca-phone">Phone number ID</Label>
            <Input
              id="ca-phone"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="e.g. 123456789012345"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ca-waba">WhatsApp Business Account ID</Label>
            <Input
              id="ca-waba"
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              placeholder="e.g. 987654321098765"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ca-token">
              Access token{initial.configured && " (leave blank to keep)"}
            </Label>
            <Input
              id="ca-token"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={initial.configured ? "••••••••" : "permanent token"}
            />
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <Button onClick={save} disabled={saving || !encryptionReady}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {initial.configured ? "Save changes" : "Connect"}
          </Button>
          {initial.configured && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={disconnect}
              disabled={removing}
            >
              {removing && <Loader2 className="size-4 animate-spin" />}
              Disconnect
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={value} className="font-mono text-xs" />
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
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") return <Badge variant="secondary">Verified</Badge>;
  if (status === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="outline">Pending verification</Badge>;
}

/** A reasonable default verify token so users don't have to invent one. */
function suggestToken(): string {
  return `rbx_${Math.random().toString(36).slice(2, 10)}`;
}
