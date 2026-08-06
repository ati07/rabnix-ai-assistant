"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface CustomerRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  tags: string[];
  appointmentCount: number;
  lastSeenAt: string | null;
}

export function CustomersList({ customers }: { customers: CustomerRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.name, c.phone, c.email, ...c.tags]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [customers, query]);

  if (customers.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No customers yet. They&apos;ll appear here as people message your assistant.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, number, email, or tag…"
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {filtered.length === 0 ? (
            <p className="px-6 py-10 text-center text-muted-foreground">
              No customers match “{query}”.
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
                    {c.tags.slice(0, 3).map((t) => (
                      <Badge key={t} variant="secondary" className="font-normal">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                    <span>{c.name ? c.phone : c.email || "—"}</span>
                    {c.appointmentCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {c.appointmentCount} appt
                        {c.appointmentCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {c.lastSeenAt && (
                      <span>Last seen {new Date(c.lastSeenAt).toLocaleDateString()}</span>
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
