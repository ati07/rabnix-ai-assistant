"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Download, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LEAD_STATUS_LABEL,
  LEAD_STATUSES,
  type LeadStatus,
} from "@/lib/leads/status";

export interface CustomerRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  tags: string[];
  leadStatus: LeadStatus;
  source: string | null;
  appointmentCount: number;
  lastSeenAt: string | null;
}

type StatusFilter = "all" | LeadStatus;

/** Badge tint per funnel stage. */
const STATUS_VARIANT: Record<
  LeadStatus,
  "default" | "secondary" | "outline"
> = {
  new: "default",
  contacted: "secondary",
  qualified: "secondary",
  won: "default",
  lost: "outline",
};

export function CustomersList({ customers }: { customers: CustomerRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (status !== "all" && c.leadStatus !== status) return false;
      if (!q) return true;
      return [c.name, c.phone, c.email, ...c.tags]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [customers, query, status]);

  const exportHref =
    status === "all"
      ? "/api/leads/export"
      : `/api/leads/export?status=${status}`;

  if (customers.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No leads yet. They&apos;ll appear here as people message your assistant.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, number, email, or tag…"
            className="pl-9"
          />
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <a href={exportHref} download>
            <Download className="size-4" />
            Export CSV
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={status === "all"}
          onClick={() => setStatus("all")}
          label="All"
        />
        {LEAD_STATUSES.map((s) => (
          <FilterChip
            key={s.value}
            active={status === s.value}
            onClick={() => setStatus(s.value)}
            label={s.label}
          />
        ))}
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {filtered.length === 0 ? (
            <p className="px-6 py-10 text-center text-muted-foreground">
              No leads match your filters.
            </p>
          ) : (
            filtered.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/customers/${c.id}`}
                className="flex items-center gap-3 px-6 py-3 hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{c.name || c.phone}</p>
                    <Badge
                      variant={STATUS_VARIANT[c.leadStatus]}
                      className="font-normal"
                    >
                      {LEAD_STATUS_LABEL[c.leadStatus]}
                    </Badge>
                    {c.tags.slice(0, 2).map((t) => (
                      <Badge key={t} variant="secondary" className="font-normal">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                    <span>{c.name ? c.phone : c.email || "—"}</span>
                    {c.source && <span className="capitalize">via {c.source}</span>}
                    {c.appointmentCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {c.appointmentCount} appt
                        {c.appointmentCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {c.lastSeenAt && (
                      <span>
                        Last seen {new Date(c.lastSeenAt).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-sm transition-colors " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input hover:bg-accent")
      }
    >
      {label}
    </button>
  );
}
