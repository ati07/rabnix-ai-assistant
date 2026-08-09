/**
 * Minimal in-memory rate limiter for the public web chat routes.
 *
 * v1 only: this is a per-process token bucket, so it does NOT coordinate across
 * multiple server instances. It's here to stop a single abusive visitor from
 * hammering the AI, not as production-grade abuse protection. Swap for a shared
 * store (Redis/Upstash) when the app runs on more than one node.
 */

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

/** Max messages per visitor within {@link WINDOW_MS}. */
const CAPACITY = 15;
const WINDOW_MS = 60_000;
const REFILL_PER_MS = CAPACITY / WINDOW_MS;

/** Drop buckets untouched for a while so the map can't grow unbounded. */
const IDLE_TTL_MS = 10 * 60_000;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number };

/**
 * Consume one token for `key` (typically `publicKey:sessionId`). Returns
 * `{ ok: false, retryAfterMs }` when the bucket is empty.
 */
export function consume(key: string): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: CAPACITY, updatedAt: now };

  // Refill based on elapsed time, capped at capacity.
  const elapsed = now - bucket.updatedAt;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_PER_MS);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    const retryAfterMs = Math.ceil((1 - bucket.tokens) / REFILL_PER_MS);
    return { ok: false, retryAfterMs };
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  sweep(now);
  return { ok: true };
}

let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < IDLE_TTL_MS) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now - b.updatedAt > IDLE_TTL_MS) buckets.delete(k);
  }
}
