import type { Event, EventSession } from "@/types";
import { timeToMinutes } from "@/lib/format";

/** The business timezone used for event dates and attendance cutoffs. */
export const ATTENDANCE_TIME_ZONE = "Asia/Manila";

const EVENT_SESSIONS: EventSession[] = ["morning", "afternoon", "evening"];

/** Display label for each scheduled session. */
export const EVENT_SESSION_LABELS: Record<EventSession, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

/** Icon shown beside each scheduled session in the Whole Day view. */
export const EVENT_SESSION_ICONS: Record<EventSession, string> = {
  morning: "☀️",
  afternoon: "🌤️",
  evening: "🌙",
};

/**
 * Default clock buckets used only when an event's schedules carry no Time In
 * or Time Out values. Minutes from midnight, end-exclusive.
 */
const DEFAULT_SESSION_BUCKETS: Record<EventSession, [number, number]> = {
  morning: [0, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 24 * 60],
};

/**
 * Returns the calendar date at an instant in the application's business
 * timezone. Event dates are date-only values, so comparing them in the
 * browser's timezone can move the attendance cutoff to the wrong day.
 */
export function calendarDateInTimeZone(
  value: Date,
  timeZone = ATTENDANCE_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Returns true once the event's configured calendar day has ended. The event
 * date, not a session's Time In or Time Out, is the attendance boundary.
 */
export function hasEventAttendanceDayEnded(
  eventDate: string | undefined,
  now = new Date(),
  timeZone = ATTENDANCE_TIME_ZONE,
): boolean {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return false;

  return calendarDateInTimeZone(now, timeZone) > eventDate;
}

/**
 * Returns the sessions configured for an event. A schedule entry itself is
 * enough to define a session; its clock values only control when scanning is
 * available and must not control Automatic Absent.
 *
 * The legacy fields are retained as a fallback for events created before the
 * schedules array was introduced.
 */
export function getScheduledEventSessions(event: Event): EventSession[] {
  if (event.schedules?.length) {
    return EVENT_SESSIONS.filter((session) =>
      event.schedules?.some((schedule) => schedule.period === session),
    );
  }

  const legacySessionConfigured: Record<EventSession, boolean> = {
    morning: Boolean(event.morningTimeIn || event.morningTimeOut),
    afternoon: Boolean(event.afternoonTimeIn || event.afternoonTimeOut),
    evening: Boolean(event.eveningTimeIn || event.eveningTimeOut),
  };

  if (event.timeIn || event.timeOut) legacySessionConfigured.morning = true;

  return EVENT_SESSIONS.filter((session) => legacySessionConfigured[session]);
}

/** A session's configured Time In / Time Out, including the legacy fallback. */
export interface EventSessionWindow {
  session: EventSession;
  label: string;
  icon: string;
  timeIn?: string;
  timeOut?: string;
}

/**
 * Returns the configured clock window for one session of an event. Reads the
 * schedules array first and falls back to the legacy per-session fields so
 * older events keep working untouched.
 */
export function getEventSessionWindow(
  event: Event,
  session: EventSession,
): EventSessionWindow {
  const schedule = event.schedules?.find((item) => item.period === session);

  const legacyTimeIn =
    session === "morning"
      ? (event.morningTimeIn || event.timeIn)
      : session === "afternoon"
        ? event.afternoonTimeIn
        : event.eveningTimeIn;
  const legacyTimeOut =
    session === "morning"
      ? (event.morningTimeOut || event.timeOut)
      : session === "afternoon"
        ? event.afternoonTimeOut
        : event.eveningTimeOut;

  return {
    session,
    label: EVENT_SESSION_LABELS[session],
    icon: EVENT_SESSION_ICONS[session],
    timeIn: schedule?.timeIn || legacyTimeIn || undefined,
    timeOut: schedule?.timeOut || legacyTimeOut || undefined,
  };
}

/**
 * Returns every session configured for an event together with its clock
 * window. This is what the Whole Day attendance view renders, so the secretary
 * sees all scheduled sessions at once instead of switching tabs.
 */
export function getEventSessionWindows(event: Event): EventSessionWindow[] {
  return getScheduledEventSessions(event).map((session) =>
    getEventSessionWindow(event, session),
  );
}

/**
 * Auto-detects which scheduled session a clock time ("HH:MM") belongs to.
 *
 * Preference order:
 *  1. the session whose configured Time In - Time Out window contains the time;
 *  2. the latest session whose configured Time In has already started;
 *  3. the session matching the default morning/afternoon/evening clock bucket;
 *  4. the first configured session.
 *
 * Returns null only when the event has no configured session at all.
 */
export function resolveEventSessionForTime(
  event: Event,
  timeHM: string,
): EventSession | null {
  const windows = getEventSessionWindows(event);
  if (windows.length === 0) return null;
  if (windows.length === 1) return windows[0].session;

  const minutes = timeToMinutes(timeHM);
  if (minutes === null) return windows[0].session;

  // 1. Inside a fully configured Time In - Time Out window.
  const withinWindow = windows.find((window) => {
    const start = timeToMinutes(window.timeIn);
    const end = timeToMinutes(window.timeOut);
    if (start === null || end === null) return false;
    return minutes >= start && minutes <= end;
  });
  if (withinWindow) return withinWindow.session;

  // 2. The latest session that has already started.
  const started = windows
    .filter((window) => {
      const start = timeToMinutes(window.timeIn);
      return start !== null && minutes >= start;
    })
    .sort(
      (a, b) => (timeToMinutes(a.timeIn) ?? 0) - (timeToMinutes(b.timeIn) ?? 0),
    );
  if (started.length > 0) return started[started.length - 1].session;

  // 3. The default clock bucket for the scan time.
  const bucketed = windows.find((window) => {
    const [start, end] = DEFAULT_SESSION_BUCKETS[window.session];
    return minutes >= start && minutes < end;
  });
  if (bucketed) return bucketed.session;

  // 4. The earliest configured session (e.g. a scan before any Time In).
  return windows[0].session;
}