/**
 * Instant skeleton shown while a dashboard page's server component (and its DB
 * queries) resolve. Next.js paints this the moment a nav link is clicked, so
 * navigation feels immediate instead of blocking on the server render.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      {/* Page heading */}
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-md bg-muted" />
        <div className="h-4 w-80 max-w-full rounded bg-muted/70" />
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl border border-border/50 bg-card p-4"
          >
            <div className="h-3 w-20 rounded bg-muted/70" />
            <div className="mt-3 h-6 w-14 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Main content panel */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-4">
        <div className="h-5 w-40 rounded bg-muted" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-9 shrink-0 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 rounded bg-muted/80" />
              <div className="h-3 w-2/3 rounded bg-muted/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
