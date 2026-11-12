/** e.g. `Sep 8, 2026`; "-" for empty input, the raw value when unparseable. */
export function formatDate(value: string | Date): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : parseCalendarDate(value) ?? new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * e.g. `September 8, 2026 • 3:05 PM`, always in Philippine Time so log timestamps
 * read the same from devices set to another zone. "—" when empty or invalid.
 */
export function formatPhilippineDateTime(value?: string | null): string {
  const date = new Date(value ?? "");
  if (!value || Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("month")} ${part("day")}, ${part("year")} • ${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
}

/** e.g. `1500 -> "₱1,500"`. */
export function formatPeso(amount: number | null | undefined): string {
  // Missing figures (e.g. a report field the server left out) read as ₱0 instead of crashing.
  return `₱${(Number(amount) || 0).toLocaleString("en-US")}`;
}

/** e.g. `1 -> "st"`, `22 -> "nd"`, `13 -> "th"`. */
export function getOrdinalSuffix(num: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = num % 100;
  return suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0];
}

/**
 * Parses `YYYY-MM-DD` as a local calendar date (`new Date("YYYY-MM-DD")` is UTC and
 * shows the previous day west of UTC). `null` when not a real date in that format.
 */
export function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
}

/** Local wall-clock Date from a calendar date and optional 24h "HH:MM" time. */
export function dateAtLocalTime(dateValue: string, timeValue?: string): Date | null {
  const date = parseCalendarDate(dateValue);
  const minutes = timeToMinutes(timeValue);
  if (date && minutes !== null) date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

/** The earliest configured schedule start time. */
export function getEarliestScheduledTime(schedules?: Array<{ timeIn?: string }>): string | undefined {
  return schedules
    ?.map((schedule) => schedule.timeIn?.trim())
    .filter((time): time is string => Boolean(time))
    .sort((a, b) => (timeToMinutes(a) ?? Infinity) - (timeToMinutes(b) ?? Infinity))[0];
}

/** Whole days (rounded up) from now until a local calendar date and optional time; NaN when invalid. */
export function daysUntil(date: string, time?: string): number {
  const target = dateAtLocalTime(date, time);
  return target ? Math.ceil((target.getTime() - Date.now()) / 86400000) : NaN;
}

/** Today's local calendar date as `YYYY-MM-DD`. */
export function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 24h "HH:MM" -> "6:30 AM"; "—" when empty, the raw value when not a time. */
export function formatTime12(value?: string): string {
  if (!value) return "—";
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

/** e.g. "6:00 AM – 12:00 PM". */
export function formatTimeRange(timeIn?: string, timeOut?: string): string {
  return `${formatTime12(timeIn)} – ${formatTime12(timeOut)}`;
}

/** Minutes since midnight for a 24h "HH:MM" time; `null` when missing or invalid. */
export function timeToMinutes(value?: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec((value ?? "").trim());
  if (!match) return null;
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  return hour > 23 || minute > 59 ? null : hour * 60 + minute;
}

/** Splits 24h "HH:MM" into 12-hour field values; blank (AM) when empty or unparseable. */
export function splitTime24(value?: string): { hour: string; minute: string; period: "AM" | "PM" } {
  const match = value ? /^(\d{1,2}):(\d{2})/.exec(value.trim()) : null;
  if (!match) return { hour: "", minute: "", period: "AM" };
  const hour = Number(match[1]);
  return { hour: String(hour % 12 || 12), minute: match[2], period: hour >= 12 ? "PM" : "AM" };
}

/** Combines 12-hour fields into 24h "HH:MM"; `null` unless hour is 1-12 and minute 0-59. */
export function composeTime12(hour: string, minute: string, period: "AM" | "PM"): string | null {
  const [h, m] = [hour.trim(), minute.trim()];
  if (!/^\d{1,2}$/.test(h) || !/^\d{1,2}$/.test(m)) return null;
  const [hourNum, minuteNum] = [Number(h), Number(m)];
  if (hourNum < 1 || hourNum > 12 || minuteNum > 59) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad((hourNum % 12) + (period === "PM" ? 12 : 0))}:${pad(minuteNum)}`;
}
