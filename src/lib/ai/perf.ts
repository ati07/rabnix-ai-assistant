import { env } from "@/lib/env";

/**
 * Lightweight perf tracing for the AI response path, gated by `AI_PERF_LOG`
 * (default "on"). Emits one structured `console.log` line per message so real
 * latency can be read straight off prod logs (Vercel / worker stdout) without a
 * tracing dependency. Deliberately dumb: no spans, no async context — just
 * `since()` deltas and a formatter. Remove the call sites once the hotspots are
 * confirmed and optimized.
 *
 * Read a line like:
 *   [perf][brain] ch=web conv=1a2b3c4d setupMs=210 modelMs=1480 persistMs=40 totalMs=1730 turns=2 tools=get_customer,search_knowledge
 *   [perf][gemini] model=gemini-flash-latest turns=2 genMs=1400[720,680] toolMs=60 in=3200 out=88 cacheRead=3000
 * to see whether time is going to the DB, the model round-trips, or tools.
 */
export function perfEnabled(): boolean {
  return env.AI_PERF_LOG === "on";
}

/** Milliseconds elapsed since a `performance.now()` mark, rounded. */
export function since(start: number): number {
  return Math.round(performance.now() - start);
}

/** Emit one `[perf][<scope>] k=v k=v` line. Skips empty/undefined fields. */
export function perfLog(scope: string, fields: Record<string, unknown>): void {
  if (!perfEnabled()) return;
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${v}`);
  if (parts.length > 0) console.log(`[perf][${scope}] ${parts.join(" ")}`);
}
