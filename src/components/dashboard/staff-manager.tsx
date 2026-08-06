"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Pencil, Phone, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  addStaff,
  deleteStaff,
  updateStaff,
  type StaffInput,
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
import { cn } from "@/lib/utils";

export interface StaffMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "owner" | "staff";
  notifyChannels: ("whatsapp" | "email" | "dashboard")[];
}

const EMPTY: StaffForm = {
  name: "",
  email: "",
  phone: "",
  role: "staff",
  whatsapp: false,
  email_notify: false,
};

interface StaffForm {
  name: string;
  email: string;
  phone: string;
  role: "owner" | "staff";
  whatsapp: boolean;
  email_notify: boolean;
}

export function StaffManager({ members }: { members: StaffMember[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>(EMPTY);

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
  }

  function startEdit(m: StaffMember) {
    setEditingId(m.id);
    setForm({
      name: m.name,
      email: m.email ?? "",
      phone: m.phone ?? "",
      role: m.role,
      whatsapp: m.notifyChannels.includes("whatsapp"),
      email_notify: m.notifyChannels.includes("email"),
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submit() {
    const channels: StaffInput["notifyChannels"] = ["dashboard"];
    if (form.whatsapp) channels.push("whatsapp");
    if (form.email_notify) channels.push("email");

    const payload: StaffInput = {
      name: form.name,
      email: form.email,
      phone: form.phone,
      role: form.role,
      notifyChannels: channels,
    };

    startTransition(async () => {
      const res = editingId
        ? await updateStaff(editingId, payload)
        : await addStaff(payload);
      if (res.ok) {
        toast.success(editingId ? "Staff member updated" : "Staff member added");
        reset();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{editingId ? "Edit team member" : "Add a team member"}</CardTitle>
          {editingId && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="size-4" /> Cancel
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="s-name">Name</Label>
              <Input
                id="s-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-role">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as "owner" | "staff" })}
              >
                <SelectTrigger id="s-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-phone">WhatsApp number</Label>
              <Input
                id="s-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+15551234567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-email">Email</Label>
              <Input
                id="s-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@business.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notify on</Label>
            <div className="flex flex-wrap gap-2">
              <ChannelToggle
                label="Dashboard"
                active
                disabled
                onClick={() => {}}
              />
              <ChannelToggle
                label="WhatsApp"
                active={form.whatsapp}
                onClick={() => setForm({ ...form, whatsapp: !form.whatsapp })}
              />
              <ChannelToggle
                label="Email"
                active={form.email_notify}
                onClick={() => setForm({ ...form, email_notify: !form.email_notify })}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Dashboard alerts are always on. Email delivery isn&apos;t wired yet — it&apos;s
              recorded but not sent.
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {editingId ? "Save changes" : "Add team member"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <StaffList members={members} onEdit={startEdit} editingId={editingId} />
    </div>
  );
}

function ChannelToggle({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:text-foreground",
        disabled && "cursor-default opacity-70",
      )}
    >
      {label}
    </button>
  );
}

function StaffList({
  members,
  onEdit,
  editingId,
}: {
  members: StaffMember[];
  onEdit: (m: StaffMember) => void;
  editingId: string | null;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function remove(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      await deleteStaff(id);
      setDeletingId(null);
      router.refresh();
    });
  }

  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No team members yet. Add someone above so the assistant can notify them.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team ({members.length})</CardTitle>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {members.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex items-center gap-3 px-6 py-3",
              editingId === m.id && "bg-muted/50",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{m.name}</p>
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                  {m.role}
                </Badge>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                {m.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3" /> {m.phone}
                  </span>
                )}
                {m.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="size-3" /> {m.email}
                  </span>
                )}
                <span>· {channelLabel(m.notifyChannels)}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(m)}
              aria-label="Edit team member"
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => remove(m.id)}
              disabled={deletingId === m.id}
              aria-label="Remove team member"
            >
              {deletingId === m.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function channelLabel(channels: StaffMember["notifyChannels"]): string {
  const extras: string[] = [];
  if (channels.includes("whatsapp")) extras.push("WhatsApp");
  if (channels.includes("email")) extras.push("Email");
  return extras.length ? `Dashboard, ${extras.join(", ")}` : "Dashboard";
}
