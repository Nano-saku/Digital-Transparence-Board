/**
 * Shared date & formatting helpers.
 *
 * These were previously declared independently in several section components;
 * import them from here instead of re-declaring local copies.
 */

/**
 * Formats a date (ISO string or Date) as e.g. `Sep 8, 2026`.
 * Returns "-" for empty input and the original string for invalid dates.
 */
export function formatDate(dateString: string | Date): string {
  if (!dateString) return "-";
  const date = dateString instanceof Date ? dateString : new Date(dateString);
  if (Number.isNaN(date.getTime())) return String(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats a peso amount the way the rest of the app displays money, e.g.
 * `1500 -> "₱1,500"`. Use this instead of inline `₱{n.toLocaleString()}`.
 */
export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString("en-US")}`;
}

/** Ordinal suffix for a number, e.g. `1 -> "st"`, `22 -> "nd"`. */
export function getOrdinalSuffix(num: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = num % 100;
  return suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0];
}

/** Whole days (rounded up) between now and the given ISO date. */
export function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

/** Today's date as a UTC `YYYY-MM-DD` string (same as the original helper). */
export function today(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Today's date in the *local* timezone as a `YYYY-MM-DD` string (the plain
 * `today()` helper uses UTC, which can be a calendar day behind/behind ahead of
 * the user's local date). Used for the 10:00 PM auto-absent check so an event
 * scheduled on the user's local "today" is the one that gets closed out.
 */
export function todayLocal(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().split("T")[0];
}

/**
 * Converts a 24h `HH:MM` (or `H:MM`) time to a 12-hour label, e.g.
 * `"06:30" -> "6:30 AM"`, `"17:00" -> "5:00 PM"`. Returns "—" for empty
 * input and the raw string when it does not look like a time.
 */
export function formatTime12(value?: string): string {
  if (!value) return "—";
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

/** "HH:MM AM" range label, e.g. "6:00 AM – 12:00 PM". */
export function formatTimeRange(timeIn?: string, timeOut?: string): string {
  return `${formatTime12(timeIn)} – ${formatTime12(timeOut)}`;
}

/**
 * Parses a 24h `HH:MM` (or `H:MM`) time into minutes since midnight. Returns
 * `null` when the value is missing or does not look like a valid clock time.
 */
export function timeToMinutes(value?: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec((value ?? "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Compares two 24h `HH:MM` times: negative when `a` is earlier than `b`, `0`
 * when equal (or either is unparseable), positive when `a` is later. Used to
 * decide attendance status from a QR scan time vs. the event's scheduled time.
 */
export function compareTime24(a?: string, b?: string): number {
  const minutesA = timeToMinutes(a);
  const minutesB = timeToMinutes(b);
  if (minutesA === null || minutesB === null) return 0;
  return minutesA - minutesB;
}