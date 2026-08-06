export interface DayVolume {
  /** YYYY-MM-DD in the tenant's timezone. */
  day: string;
  inbound: number;
  outbound: number;
}

/**
 * Lightweight stacked daily-volume bar chart (inbound vs outbound messages).
 * Rendered with plain divs — no chart dependency. Server-safe.
 */
export function DailyVolume({ data }: { data: DayVolume[] }) {
  const max = Math.max(1, ...data.map((d) => d.inbound + d.outbound));
  const hasData = data.some((d) => d.inbound + d.outbound > 0);

  return (
    <div>
      <div className="flex h-40 items-end gap-px">
        {data.map((d) => {
          const total = d.inbound + d.outbound;
          const barPct = (total / max) * 100;
          const outPct = total > 0 ? (d.outbound / total) * 100 : 0;
          return (
            <div
              key={d.day}
              className="flex flex-1 flex-col justify-end"
              title={`${d.day}: ${d.inbound} in · ${d.outbound} out`}
            >
              <div
                className="w-full overflow-hidden rounded-t-sm"
                style={{ height: `${barPct}%` }}
              >
                <div className="bg-primary/30" style={{ height: `${100 - outPct}%` }} />
                <div className="bg-primary" style={{ height: `${outPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {!hasData && (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          No messages in this period yet.
        </p>
      )}

      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.day}</span>
        <span>{data[data.length - 1]?.day}</span>
      </div>

      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary/30" /> Inbound
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" /> Outbound
        </span>
      </div>
    </div>
  );
}
