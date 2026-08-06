import Link from "next/link";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  appointments,
  businessConfig,
  conversations,
  customers,
  messages,
  notifications,
} from "@/lib/db/schema";
import { requireTenant } from "@/lib/tenant";
import { dateKeyInZone } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DailyVolume,
  type DayVolume,
} from "@/components/dashboard/analytics/daily-volume";

const WINDOWS = [7, 30, 90] as const;
type Window = (typeof WINDOWS)[number];

const APPT_STATUSES = [
  { key: "scheduled", label: "Scheduled" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "no_show", label: "No-show" },
] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const tenant = await requireTenant();
  const sp = await searchParams;
  const days: Window = WINDOWS.includes(Number(sp.days) as Window)
    ? (Number(sp.days) as Window)
    : 30;

  const now = new Date();
  const start = new Date(now.getTime() - days * 86_400_000);

  const config = await db.query.businessConfig.findFirst({
    where: eq(businessConfig.tenantId, tenant.id),
  });
  const tz = config?.timezone || "UTC";

  const msgWindow = and(
    eq(messages.tenantId, tenant.id),
    gte(messages.createdAt, start),
  );

  const dayExpr = sql<string>`to_char(${messages.createdAt} at time zone ${tz}, 'YYYY-MM-DD')`;

  const [
    msgByDir,
    activeConvos,
    newCustomers,
    apptByStatus,
    aiAppts,
    topServices,
    handoffs,
    dailyRows,
    channelRows,
  ] = await Promise.all([
    db
      .select({ direction: messages.direction, n: count() })
      .from(messages)
      .where(msgWindow)
      .groupBy(messages.direction),
    db
      .select({ n: sql<number>`count(distinct ${messages.conversationId})` })
      .from(messages)
      .where(msgWindow),
    db
      .select({ n: count() })
      .from(customers)
      .where(and(eq(customers.tenantId, tenant.id), gte(customers.createdAt, start))),
    db
      .select({ status: appointments.status, n: count() })
      .from(appointments)
      .where(
        and(eq(appointments.tenantId, tenant.id), gte(appointments.createdAt, start)),
      )
      .groupBy(appointments.status),
    db
      .select({ n: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenant.id),
          gte(appointments.createdAt, start),
          eq(appointments.source, "ai"),
        ),
      ),
    db
      .select({ name: appointments.serviceName, n: count() })
      .from(appointments)
      .where(
        and(eq(appointments.tenantId, tenant.id), gte(appointments.createdAt, start)),
      )
      .groupBy(appointments.serviceName)
      .orderBy(desc(count()))
      .limit(5),
    db
      .select({ n: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, tenant.id),
          eq(notifications.type, "handoff"),
          gte(notifications.createdAt, start),
        ),
      ),
    db
      .select({ day: dayExpr, direction: messages.direction, n: count() })
      .from(messages)
      .where(msgWindow)
      // Group by output-column ordinals (day, direction): Drizzle renders the
      // day expression unqualified in SELECT but qualified in GROUP BY, so
      // repeating it there trips Postgres' expression matching (42803).
      .groupBy(sql`1`, sql`2`),
    db
      .select({ channel: conversations.channelType, n: count() })
      .from(conversations)
      .where(
        and(
          eq(conversations.tenantId, tenant.id),
          gte(conversations.createdAt, start),
        ),
      )
      .groupBy(conversations.channelType),
  ]);

  const inbound = Number(msgByDir.find((r) => r.direction === "inbound")?.n ?? 0);
  const outbound = Number(msgByDir.find((r) => r.direction === "outbound")?.n ?? 0);
  const convCount = Number(activeConvos[0]?.n ?? 0);
  const handoffCount = Number(handoffs[0]?.n ?? 0);
  const totalAppts = apptByStatus.reduce((s, r) => s + Number(r.n), 0);
  const automation =
    convCount > 0
      ? Math.max(0, Math.round((1 - handoffCount / convCount) * 100))
      : null;

  const statusCounts = new Map(apptByStatus.map((r) => [r.status, Number(r.n)]));
  const maxStatus = Math.max(1, ...APPT_STATUSES.map((s) => statusCounts.get(s.key) ?? 0));
  const maxService = Math.max(1, ...topServices.map((s) => Number(s.n)));

  // Fill a continuous day series so gaps render as empty bars.
  const inMap = new Map<string, number>();
  const outMap = new Map<string, number>();
  for (const r of dailyRows) {
    (r.direction === "inbound" ? inMap : outMap).set(r.day, Number(r.n));
  }
  const series: DayVolume[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = dateKeyInZone(new Date(now.getTime() - i * 86_400_000), tz);
    series.push({ day, inbound: inMap.get(day) ?? 0, outbound: outMap.get(day) ?? 0 });
  }

  const kpis = [
    { label: "Conversations", value: convCount, hint: "Active in this period" },
    { label: "Messages", value: inbound + outbound, hint: `${inbound} in · ${outbound} out` },
    { label: "New customers", value: Number(newCustomers[0]?.n ?? 0), hint: "First seen in period" },
    { label: "Appointments", value: totalAppts, hint: `${Number(aiAppts[0]?.n ?? 0)} booked by AI` },
    { label: "Human handoffs", value: handoffCount, hint: "Escalations to your team" },
    {
      label: "AI resolution",
      value: automation === null ? "—" : `${automation}%`,
      hint: "Handled without a human",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            How your assistant is performing. Times shown in {tz}.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border p-1">
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={`/dashboard/analytics?days=${w}`}
              className={cn(
                "rounded px-3 py-1 text-sm font-medium transition-colors",
                w === days
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {w}d
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="py-5">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Message volume</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyVolume data={series} />
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Appointments by status ({totalAppts})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {totalAppts === 0 ? (
              <p className="text-sm text-muted-foreground">
                No appointments booked in this period.
              </p>
            ) : (
              APPT_STATUSES.map((s) => {
                const n = statusCounts.get(s.key) ?? 0;
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-sm text-muted-foreground">
                      {s.label}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(n / maxStatus) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-sm tabular-nums">
                      {n}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top services</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topServices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              topServices.map((s) => (
                <div key={s.name} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm" title={s.name}>
                    {s.name}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(Number(s.n) / maxService) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm tabular-nums">
                    {Number(s.n)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">New conversations by channel</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          {channelRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            channelRows.map((c) => (
              <div key={c.channel}>
                <p className="text-2xl font-semibold tabular-nums">{Number(c.n)}</p>
                <p className="text-sm text-muted-foreground">
                  {c.channel === "cloud_api" ? "Cloud API" : "QR (Baileys)"}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
