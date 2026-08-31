"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Mail, X } from "lucide-react";
import { toast } from "sonner";
import {
  inviteTeammate,
  revokeInviteAction,
  type InviteInput,
} from "@/app/dashboard/staff/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface PendingInvite {
  id: string;
  email: string;
  role: "owner" | "staff";
  /** ISO string. */
  expiresAt: string;
}

export function InviteManager({ invites }: { invites: PendingInvite[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "staff">("staff");
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  function submit() {
    const payload: InviteInput = { email, role };
    startTransition(async () => {
      const res = await inviteTeammate(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setEmail("");
      setRole("staff");
      if (res.inviteUrl) {
        // No email provider configured — surface the link for manual sharing.
        setShareUrl(res.inviteUrl);
        toast.success("Invite created — copy the link to share it.");
      } else {
        setShareUrl(null);
        toast.success("Invite email sent.");
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Invite a teammate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="inv-email">Email</Label>
              <Input
                id="inv-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@business.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "owner" | "staff")}>
                <SelectTrigger id="inv-role" className="sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={submit} disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mail className="size-4" />
              )}
              Send invite
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            They&apos;ll get a link to set a password and join your team. Owners can
            manage everything; staff get dashboard access and notifications.
          </p>

          {shareUrl && <ShareLink url={shareUrl} onDismiss={() => setShareUrl(null)} />}
        </CardContent>
      </Card>

      {invites.length > 0 && <PendingList invites={invites} />}
    </div>
  );
}

function ShareLink({ url, onDismiss }: { url: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select and copy the link manually.");
    }
  }

  return (
    <div className="rounded-md border border-dashed bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">
          Email isn&apos;t configured — share this link with your teammate:
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Input readOnly value={url} className="font-mono text-xs" />
        <Button variant="outline" size="icon" onClick={copy} aria-label="Copy link">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

function PendingList({ invites }: { invites: PendingInvite[] }) {
  const router = useRouter();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function revoke(id: string) {
    setRevokingId(id);
    startTransition(async () => {
      const res = await revokeInviteAction(id);
      if (!res.ok) toast.error(res.error);
      setRevokingId(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invites ({invites.length})</CardTitle>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {invites.map((inv) => (
          <div key={inv.id} className="flex items-center gap-3 px-6 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{inv.email}</p>
                <Badge variant={inv.role === "owner" ? "default" : "secondary"}>
                  {inv.role}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Expires {new Date(inv.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => revoke(inv.id)}
              disabled={revokingId === inv.id}
            >
              {revokingId === inv.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Revoke"
              )}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
