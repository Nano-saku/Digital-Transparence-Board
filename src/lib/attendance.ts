import type { Event, EventSession } from "@/types";

/** The business timezone used for event dates and attendance cutoffs. */
export const ATTENDANCE_TIME_ZONE = "Asia/Manila";

const EVENT_SESSIONS: EventSession[] = ["morning", "afternoon", "evening"];

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