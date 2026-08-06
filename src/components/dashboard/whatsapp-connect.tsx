"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Loader2, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface WhatsAppStatus {
  status: string;
  qr: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  lastConnectedAt: string | null;
}

const POLL_MS = 3000;

export function WhatsAppConnect({ initial }: { initial: WhatsAppStatus }) {
  const [state, setState] = useState<WhatsAppStatus>(initial);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/whatsapp/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as WhatsAppStatus;
        if (active) {
          setState(data);
          setStale(false);
        }
      } catch {
        if (active) setStale(true);
      }
    };
    const timer = setInterval(tick, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const connected = state.status === "connected";
  const needsQr = state.status === "needs_qr" && state.qr;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Connection</CardTitle>
        <StatusBadge status={state.status} stale={stale} />
      </CardHeader>
      <CardContent>
        {connected ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="size-12 text-green-600" />
            <div>
              <p className="font-medium">WhatsApp connected</p>
              {state.phoneNumber && (
                <p className="text-sm text-muted-foreground">
                  {state.displayName ? `${state.displayName} · ` : ""}+{state.phoneNumber}
                </p>
              )}
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Your assistant is now replying to customers on this number.
            </p>
          </div>
        ) : needsQr ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="rounded-xl bg-white p-4">
              <QRCodeSVG value={state.qr!} size={220} />
            </div>
            <div className="max-w-sm space-y-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Scan to link WhatsApp</p>
              <p>
                Open WhatsApp → <b>Settings</b> → <b>Linked devices</b> →{" "}
                <b>Link a device</b>, then scan this code. It refreshes automatically.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Smartphone className="size-12 text-muted-foreground" />
            <p className="font-medium">Waiting for a QR code…</p>
            <p className="max-w-md text-sm text-muted-foreground">
              The WhatsApp worker generates the pairing code. Make sure it&apos;s running
              (<code className="rounded bg-muted px-1">npm run worker</code>). A QR will
              appear here within a few seconds.
            </p>
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, stale }: { status: string; stale: boolean }) {
  if (stale) return <Badge variant="outline">Reconnecting…</Badge>;
  if (status === "connected") return <Badge variant="secondary">Connected</Badge>;
  if (status === "needs_qr") return <Badge variant="outline">Scan QR</Badge>;
  if (status === "connecting") return <Badge variant="outline">Connecting…</Badge>;
  if (status === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="outline">Disconnected</Badge>;
}
