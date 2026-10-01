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
  const date =
    dateString instanceof Date
      ? dateString
      : parseCalendarDate(dateString) ?? new Date(dateString);
  if (Number.isNaN(date.getTime())) return String(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats an authoritative ISO/PostgreSQL timestamp in Philippine Time.
 *
 * The timezone is deliberately explicit so log timestamps do not change when
 * an officer views the application from a device configured for another zone.
 */
export function formatPhilippineDateTime(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("month")} ${part("day")}, ${part("year")} • ${part("hour")}:${part("minute")} ${part("dayPeriod")}`;
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

/**
 * Parses a date-only value as a local calendar date.
 *
 * `new Date("YYYY-MM-DD")` parses the value as UTC, which can display the
 * previous day in timezones west of UTC. Event and deadline dates are calendar
 * dates selected by an administrator, so they must not go through that
 * conversion.
 */
export function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ? date
    : null;
}

/** Creates a local wall-clock Date from a configured calendar date and time. */
export function dateAtLocalTime(dateValue: string, timeValue?: string): Date | null {
  const date = parseCalendarDate(dateValue);
  if (!date) return null;

  const minutes = timeToMinutes(timeValue);
  if (minutes === null) return date;

  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

/** Returns the earliest configured scheduled start time. */
export function getEarliestScheduledTime(
  schedules?: Array<{ timeIn?: string }>,
): string | undefined {
  return schedules
    ?.map((schedule) => schedule.timeIn?.trim())
    .filter((time): time is string => Boolean(time))
    .sort((a, b) => (timeToMinutes(a) ?? Infinity) - (timeToMinutes(b) ?? Infinity))[0];
}

/** Whole days (rounded up) until a local calendar date and optional time. */
export function daysUntil(date: string, time?: string): number {
  const target = dateAtLocalTime(date, time);
  if (!target) return NaN;
  return Math.ceil((target.getTime() - Date.now()) / 86400000);
}

/** Today's local calendar date as a `YYYY-MM-DD` string. */
export function today(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
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

/**
 * Splits a 24h `"HH:MM"` time into typeable 12-hour Hour / Minute / AM·PM
 * parts for editable time fields (separate hour and minute inputs plus an
 * AM/PM dropdown, with the `:` rendered between them rather than typed).
 * Returns blank hour/minute (defaulting to AM) when the value is empty or
 * unparseable, so the fields start empty instead of showing "12:00 AM".
 */
export function splitTime24(value?: string): {
  hour: string;
  minute: string;
  period: "AM" | "PM";
} {
  const match = value ? /^(\d{1,2}):(\d{2})/.exec(value.trim()) : null;
  if (!match) return { hour: "", minute: "", period: "AM" };
  const hour24 = Number(match[1]);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    hour: String(hour12),
    minute: match[2],
    period: hour24 >= 12 ? "PM" : "AM",
  };
}

/**
 * Combines typed 12-hour Hour / Minute / AM·PM fields into the 24h `"HH:MM"`
 * format the database stores. Returns `null` when the hour or minute is not
 * a plain number or is out of range (hour 1-12, minute 00-59).
 */
export function composeTime12(
  hour: string,
  minute: string,
  period: "AM" | "PM",
): string | null {
  const h = hour.trim();
  const m = minute.trim();
  if (!/^\d{1,2}$/.test(h) || !/^\d{1,2}$/.test(m)) return null;
  const hourNum = Number(h);
  const minuteNum = Number(m);
  if (hourNum < 1 || hourNum > 12 || minuteNum > 59) return null;
  const hour24 = (hourNum % 12) + (period === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${String(minuteNum).padStart(2, "0")}`;
}