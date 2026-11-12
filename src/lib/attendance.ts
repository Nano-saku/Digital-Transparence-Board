import type { Event, EventSession } from "@/types";
import { timeToMinutes } from "@/lib/format";

/** The business timezone used for event dates and attendance cutoffs. */
export const ATTENDANCE_TIME_ZONE = "Asia/Manila";

const EVENT_SESSIONS: EventSession[] = ["morning", "afternoon", "evening"];

export const EVENT_SESSION_LABELS: Record<EventSession, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

/** Shown beside each session in the Whole Day view. */
export const EVENT_SESSION_ICONS: Record<EventSession, string> = {
  morning: "☀️",
  afternoon: "🌤️",
  evening: "🌙",
};

/** Fallback clock buckets (minutes from midnight, end-exclusive) for sessions without times. */
const DEFAULT_SESSION_BUCKETS: Record<EventSession, [number, number]> = {
  morning: [0, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 24 * 60],
};

/**
 * `YYYY-MM-DD` of an instant in the business timezone; comparing date-only event
 * dates in the browser's zone could move the attendance cutoff to the wrong day.
 */
export function calendarDateInTimeZone(value: Date, timeZone = ATTENDANCE_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** True once the event's calendar day has ended (the date, not a session's times, is the boundary). */
export function hasEventAttendanceDayEnded(
  eventDate: string | undefined,
  now = new Date(),
  timeZone = ATTENDANCE_TIME_ZONE,
): boolean {
  return Boolean(eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate) && calendarDateInTimeZone(now, timeZone) > eventDate);
}

function legacyTimes(event: Event, session: EventSession): [string | undefined, string | undefined] {
  if (session === "morning") return [event.morningTimeIn || event.timeIn, event.morningTimeOut || event.timeOut];
  if (session === "afternoon") return [event.afternoonTimeIn, event.afternoonTimeOut];
  return [event.eveningTimeIn, event.eveningTimeOut];
}

/**
 * Sessions configured for an event. A schedule entry alone defines a session (its
 * times only gate scanning, never Automatic Absent); legacy per-session fields are
 * the fallback for events created before the schedules array.
 */
export function getScheduledEventSessions(event: Event): EventSession[] {
  if (event.schedules?.length) {
    return EVENT_SESSIONS.filter((session) => event.schedules?.some((schedule) => schedule.period === session));
  }
  return EVENT_SESSIONS.filter((session) => legacyTimes(event, session).some(Boolean));
}

/** A session's configured Time In / Time Out, including the legacy fallback. */
export interface EventSessionWindow {
  session: EventSession;
  label: string;
  icon: string;
  timeIn?: string;
  timeOut?: string;
}

export function getEventSessionWindow(event: Event, session: EventSession): EventSessionWindow {
  const schedule = event.schedules?.find((item) => item.period === session);
  const [legacyIn, legacyOut] = legacyTimes(event, session);
  return {
    session,
    label: EVENT_SESSION_LABELS[session],
    icon: EVENT_SESSION_ICONS[session],
    timeIn: schedule?.timeIn || legacyIn || undefined,
    timeOut: schedule?.timeOut || legacyOut || undefined,
  };
}

/** Every configured session with its window (what the Whole Day view renders). */
export function getEventSessionWindows(event: Event): EventSessionWindow[] {
  return getScheduledEventSessions(event).map((session) => getEventSessionWindow(event, session));
}

/**
 * The session a 24h "HH:MM" time belongs to, preferring: the window containing it;
 * the latest session already started; the default clock bucket; the first session.
 * `null` only when the event has no configured session.
 */
export function resolveEventSessionForTime(event: Event, timeHM: string): EventSession | null {
  const windows = getEventSessionWindows(event);
  const minutes = timeToMinutes(timeHM);
  if (windows.length <= 1 || minutes === null) return windows[0]?.session ?? null;

  const withinWindow = windows.find((window) => {
    const [start, end] = [timeToMinutes(window.timeIn), timeToMinutes(window.timeOut)];
    return start !== null && end !== null && minutes >= start && minutes <= end;
  });
  const latestStarted = windows
    .map((window) => ({ window, start: timeToMinutes(window.timeIn) }))
    .filter(({ start }) => start !== null && minutes >= start)
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
    .at(-1)?.window;
  const bucketed = windows.find((window) => {
    const [start, end] = DEFAULT_SESSION_BUCKETS[window.session];
    return minutes >= start && minutes < end;
  });
  return (withinWindow ?? latestStarted ?? bucketed ?? windows[0]).session;
}
