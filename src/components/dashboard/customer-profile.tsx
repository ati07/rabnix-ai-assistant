"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteCustomer,
  updateCustomer,
} from "@/app/dashboard/customers/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/status";

export interface CustomerProfileData {
  id: string;
  phone: string;
  name: string;
  email: string;
  tags: string[];
  notes: string;
  leadStatus: LeadStatus;
}

export function CustomerProfile({ customer }: { customer: CustomerProfileData }) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email);
  const [tags, setTags] = useState(customer.tags.join(", "));
  const [notes, setNotes] = useState(customer.notes);
  const [leadStatus, setLeadStatus] = useState<LeadStatus>(customer.leadStatus);

  function save() {
    startSave(async () => {
      const res = await updateCustomer(customer.id, {
        name,
        email,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes,
        leadStatus,
      });
      if (res.ok) {
        toast.success("Customer saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove() {
    if (
      !window.confirm(
        "Delete this customer and their appointment history? This cannot be undone.",
      )
    ) {
      return;
    }
    startDelete(async () => {
      const res = await deleteCustomer(customer.id);
      if (res.ok) {
        toast.success("Customer deleted");
        router.push("/dashboard/customers");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="c-name">Name</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Not set"
            />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp number</Label>
            <Input value={customer.phone} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-email">Email</Label>
            <Input
              id="c-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Not set"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-tags">Tags</Label>
            <Input
              id="c-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="vip, returning (comma-separated)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-status">Lead status</Label>
            <Select
              value={leadStatus}
              onValueChange={(v) => setLeadStatus(v as LeadStatus)}
            >
              <SelectTrigger id="c-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Marking a lead Won or Lost stops any pending follow-ups.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-notes">Notes</Label>
          <Textarea
            id="c-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="Anything worth remembering about this customer…"
          />
        </div>
        <div className="flex items-center justify-between">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={remove}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
