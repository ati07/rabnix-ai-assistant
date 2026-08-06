/**
 * Timezone helpers for appointment scheduling.
 *
 * We deliberately avoid a date library (iteration 1 keeps deps lean). All the
 * math we need — converting a tenant's wall-clock time to a UTC instant and
 * back — is done with `Intl.DateTimeFormat`, which is timezone-aware and
 * available in Node.
 */

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

interface WallParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
}

/** Break a UTC instant into its wall-clock components in the given IANA zone. */
function partsInZone(date: Date, timeZone: string): WallParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour, // some engines emit 24 for midnight
    minute: map.minute,
    second: map.second,
  };
}

/**
 * Convert a wall-clock time in `timeZone` to the corresponding UTC `Date`.
 *
 * Works across DST changes by measuring the zone's offset at that instant and
 * correcting for it (the standard two-pass approach).
 */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = partsInZone(new Date(utcGuess), timeZone);
  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offset = wallAsUtc - utcGuess;
  return new Date(utcGuess - offset);
}

/** The weekday key (`mon`…`sun`) for a UTC instant, as seen in `timeZone`. */
export function weekdayKeyInZone(date: Date, timeZone: string): WeekdayKey {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short);
  return WEEKDAY_KEYS[idx < 0 ? 0 : idx];
}

/** Human-friendly label for a UTC instant in the tenant's timezone. */
export function formatInZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** Parse "HH:MM" into minutes-since-midnight. Returns null when malformed. */
export function parseHhMm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Validate a YYYY-MM-DD string and return its numeric parts. */
export function parseDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/**
 * Best-effort parse of a free-form service duration into minutes.
 * Handles "30 min", "45m", "1 hour", "1.5 hours", "1h30", "90".
 * Falls back to {@link DEFAULT_DURATION_MINUTES}.
 */
export const DEFAULT_DURATION_MINUTES = 30;

export function parseDurationMinutes(input?: string | null): number {
  if (!input) return DEFAULT_DURATION_MINUTES;
  const s = input.toLowerCase().trim();

  // "1h30" / "1h 30m"
  const hm = /(\d+)\s*h\w*\s*(\d+)\s*m/.exec(s);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);

  const hours = /(\d+(?:\.\d+)?)\s*(?:h(?:ou)?r?s?|hr)/.exec(s);
  if (hours) return Math.round(Number(hours[1]) * 60);

  const mins = /(\d+)\s*(?:m(?:in)?)/.exec(s);
  if (mins) return Number(mins[1]);

  const bare = /^(\d+)$/.exec(s);
  if (bare) return Number(bare[1]);

  return DEFAULT_DURATION_MINUTES;
}
