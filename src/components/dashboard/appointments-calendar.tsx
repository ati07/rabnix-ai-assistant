"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dateKeyInZone } from "@/lib/time";
import { cn } from "@/lib/utils";
import { updateAppointmentStatus } from "@/app/dashboard/appointments/actions";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export interface AppointmentRow {
  id: string;
  serviceName: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status: AppointmentStatus;
  source: string;
  notes: string | null;
  customerId: string;
  customerName: string | null;
  customerContact: string | null;
}

const STATUS_OPTIONS: { value: AppointmentStatus; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
];

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

/** Tint per status — kept as explicit classes so both light/dark read well. */
const STATUS_TINT: Record<AppointmentStatus, string> = {
  scheduled: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  confirmed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

/** Small colored dot used in calendar cells. */
const STATUS_DOT: Record<AppointmentStatus, string> = {
  scheduled: "bg-blue-500",
  confirmed: "bg-emerald-500",
  completed: "bg-muted-foreground/50",
  cancelled: "bg-destructive",
  no_show: "bg-amber-500",
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function timeInZone(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function prettyDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function AppointmentsCalendar({
  appointments,
  timezone,
}: {
  appointments: AppointmentRow[];
  timezone: string;
}) {
  const todayKey = dateKeyInZone(new Date(), timezone);
  const [ty, tm] = todayKey.split("-").map(Number);

  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [cursor, setCursor] = useState({ year: ty, month: tm }); // month 1-12
  const [selected, setSelected] = useState<string>(todayKey);

  // Bucket appointments by their tenant-local calendar day.
  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const a of appointments) {
      const key = dateKeyInZone(new Date(a.startAt), timezone);
      const arr = map.get(key);
      if (arr) arr.push(a);
      else map.set(key, [a]);
    }
    return map;
  }, [appointments, timezone]);

  if (appointments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
          <CalendarDays className="size-8 text-muted-foreground" />
          <p className="font-medium">No appointments yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            When your assistant or team books a customer, it&apos;ll show up here
            on the calendar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Summary appointments={appointments} todayKey={todayKey} timezone={timezone} />
        <div className="flex rounded-lg border p-0.5">
          <ViewButton
            active={view === "calendar"}
            onClick={() => setView("calendar")}
            icon={<CalendarDays className="size-4" />}
            label="Calendar"
          />
          <ViewButton
            active={view === "list"}
            onClick={() => setView("list")}
            icon={<List className="size-4" />}
            label="List"
          />
        </div>
      </div>

      {view === "calendar" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <MonthGrid
            cursor={cursor}
            setCursor={setCursor}
            selected={selected}
            setSelected={setSelected}
            todayKey={todayKey}
            byDay={byDay}
          />
          <DayPanel
            dayKeyStr={selected}
            items={byDay.get(selected) ?? []}
            timezone={timezone}
          />
        </div>
      ) : (
        <ListView appointments={appointments} timezone={timezone} todayKey={todayKey} />
      )}
    </div>
  );
}

// ── Month grid ───────────────────────────────────────────────────────────────
function MonthGrid({
  cursor,
  setCursor,
  selected,
  setSelected,
  todayKey,
  byDay,
}: {
  cursor: { year: number; month: number };
  setCursor: (c: { year: number; month: number }) => void;
  selected: string;
  setSelected: (k: string) => void;
  todayKey: string;
  byDay: Map<string, AppointmentRow[]>;
}) {
  const { year, month } = cursor;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();

  // Flat list of cells: leading blanks then the month's days.
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shift = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setCursor({ year: y, month: m });
  };

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">
            {MONTH_LABELS[month - 1]} {year}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const [y, m] = todayKey.split("-").map(Number);
                setCursor({ year: y, month: m });
                setSelected(todayKey);
              }}
            >
              Today
            </Button>
            <Button variant="outline" size="icon" className="size-7" onClick={() => shift(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon" className="size-7" onClick={() => shift(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`b${i}`} className="aspect-square" />;
            const key = dayKey(year, month, day);
            const items = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            const isSelected = key === selected;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                className={cn(
                  "flex aspect-square flex-col items-center justify-start rounded-md border p-1 text-sm transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-transparent hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs",
                    isToday && "bg-primary font-semibold text-primary-foreground",
                    !isToday && isSelected && "font-semibold text-primary",
                  )}
                >
                  {day}
                </span>
                {items.length > 0 && (
                  <span className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">
                    {items.slice(0, 3).map((a) => (
                      <span
                        key={a.id}
                        className={cn("size-1.5 rounded-full", STATUS_DOT[a.status])}
                      />
                    ))}
                    {items.length > 3 && (
                      <span className="text-[9px] leading-none text-muted-foreground">
                        +{items.length - 3}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Day panel (schedule for the selected day) ───────────────────────────────
function DayPanel({
  dayKeyStr,
  items,
  timezone,
}: {
  dayKeyStr: string;
  items: AppointmentRow[];
  timezone: string;
}) {
  const sorted = [...items].sort((a, b) => a.startAt.localeCompare(b.startAt));
  return (
    <Card className="lg:sticky lg:top-4 lg:self-start">
      <CardContent className="p-4">
        <div className="mb-3">
          <div className="text-sm font-semibold">{prettyDay(dayKeyStr)}</div>
          <div className="text-xs text-muted-foreground">
            {items.length === 0
              ? "No appointments"
              : `${items.length} appointment${items.length === 1 ? "" : "s"}`}
          </div>
        </div>
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing booked on this day.
          </p>
        ) : (
          <div className="space-y-2">
            {sorted.map((a) => (
              <AppointmentCard key={a.id} appt={a} timezone={timezone} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── List view ────────────────────────────────────────────────────────────────
function ListView({
  appointments,
  timezone,
  todayKey,
}: {
  appointments: AppointmentRow[];
  timezone: string;
  todayKey: string;
}) {
  const { upcoming, earlier } = useMemo(() => {
    const up: AppointmentRow[] = [];
    const past: AppointmentRow[] = [];
    for (const a of appointments) {
      const key = dateKeyInZone(new Date(a.startAt), timezone);
      if (key >= todayKey) up.push(a);
      else past.push(a);
    }
    up.sort((a, b) => a.startAt.localeCompare(b.startAt));
    past.sort((a, b) => b.startAt.localeCompare(a.startAt));
    return { upcoming: up, earlier: past };
  }, [appointments, timezone, todayKey]);

  return (
    <div className="space-y-6">
      <ListSection title="Upcoming" items={upcoming} timezone={timezone} empty="No upcoming appointments." />
      {earlier.length > 0 && (
        <ListSection title="Earlier" items={earlier} timezone={timezone} empty="" />
      )}
    </div>
  );
}

function ListSection({
  title,
  items,
  timezone,
  empty,
}: {
  title: string;
  items: AppointmentRow[];
  timezone: string;
  empty: string;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-muted-foreground">
        {title} · {items.length}
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <AppointmentCard key={a.id} appt={a} timezone={timezone} showDate />
          ))}
        </div>
      )}
    </div>
  );
}

// ── One appointment card (shared by day panel + list) ───────────────────────
function AppointmentCard({
  appt,
  timezone,
  showDate = false,
}: {
  appt: AppointmentRow;
  timezone: string;
  showDate?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const cancelled = appt.status === "cancelled" || appt.status === "no_show";

  const onStatusChange = (next: string) => {
    if (next === appt.status) return;
    startTransition(async () => {
      const res = await updateAppointmentStatus(appt.id, next);
      if (res.ok) {
        toast.success(`Marked ${STATUS_LABEL[next as AppointmentStatus]}.`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  const dayLabel = showDate
    ? prettyDay(dateKeyInZone(new Date(appt.startAt), timezone))
    : null;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              "truncate font-medium",
              cancelled && "text-muted-foreground line-through",
            )}
          >
            {appt.serviceName}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {dayLabel ? `${dayLabel}, ` : ""}
              {timeInZone(appt.startAt, timezone)}–{timeInZone(appt.endAt, timezone)}
            </span>
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            STATUS_TINT[appt.status],
          )}
        >
          {STATUS_LABEL[appt.status]}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <Link
          href={`/dashboard/customers/${appt.customerId}`}
          className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
        >
          <User className="size-3" />
          {appt.customerName || appt.customerContact || "Customer"}
        </Link>
        {appt.customerContact && appt.customerName && (
          <span className="truncate">{appt.customerContact}</span>
        )}
        <Badge variant="outline" className="font-normal capitalize">
          via {appt.source}
        </Badge>
      </div>

      {appt.notes && (
        <p className="mt-2 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
          {appt.notes}
        </p>
      )}

      <div className="mt-2">
        <Select value={appt.status} onValueChange={onStatusChange} disabled={pending}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────
function Summary({
  appointments,
  todayKey,
  timezone,
}: {
  appointments: AppointmentRow[];
  todayKey: string;
  timezone: string;
}) {
  const upcoming = appointments.filter(
    (a) =>
      dateKeyInZone(new Date(a.startAt), timezone) >= todayKey &&
      a.status !== "cancelled" &&
      a.status !== "no_show",
  ).length;
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-semibold text-foreground">{appointments.length}</span>{" "}
      total ·{" "}
      <span className="font-semibold text-foreground">{upcoming}</span> upcoming
    </p>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
