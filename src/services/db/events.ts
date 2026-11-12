import { calendarDateInTimeZone } from "../../lib/attendance";
import type { Event, EventEvaluation, EventSchedule } from "../../types";
import {
  browserOffline,
  defineColumns,
  defineTable,
  field,
  flag,
  nullable,
  opt,
  readOnly,
  sb,
  unwrap,
  DESC,
} from "./core";

function parseSchedules(value: unknown): EventSchedule[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value : []);

const events = defineTable<Event>({
  name: "events",
  entity: "event",
  columns: {
    name: field("name", undefined, (name) => String(name).trim()),
    allocationAmount: field("allocation_amount", undefined, (amount) => Number(amount) || 0),
    isNonConducting: flag("is_non_conducting"),
    isNoContribution: flag("is_no_contribution"),
    autoMarkAbsent: field("auto_mark_absent", (value) => value === true, Boolean),
    date: nullable("date"),
    contributionDeadline: opt("contribution_deadline"),
    evaluationActive: flag("evaluation_active"),
    evaluationFormUrl: opt("evaluation_form_url"),
    schedules: field("schedules", parseSchedules),
    assignedMembers: {
      read: (row) => {
        const names = strings(row.assigned_member_names);
        return strings(row.assigned_member_ids).map((memberId, index) => ({
          memberId,
          memberName: names[index] || "Board Member",
        }));
      },
      write: (members) => ({
        assigned_member_ids: members.map((member) => member.memberId),
        assigned_member_names: members.map((member) => member.memberName),
      }),
    },
    // Legacy per-session time columns: read when present, never written.
    timeIn: readOnly(opt("time_in")),
    timeOut: readOnly(opt("time_out")),
    morningTimeIn: readOnly(opt("morning_time_in")),
    morningTimeOut: readOnly(opt("morning_time_out")),
    afternoonTimeIn: readOnly(opt("afternoon_time_in")),
    afternoonTimeOut: readOnly(opt("afternoon_time_out")),
    eveningTimeIn: readOnly(opt("evening_time_in")),
    eveningTimeOut: readOnly(opt("evening_time_out")),
  },
  order: [["date", DESC]],
  memoize: true,
  createDefaults: {
    allocation_amount: 0,
    is_non_conducting: false,
    is_no_contribution: false,
    auto_mark_absent: false,
    date: null,
    contribution_deadline: "",
    evaluation_active: false,
    evaluation_form_url: "",
    schedules: [],
    assigned_member_ids: [],
    assigned_member_names: [],
  },
  errorMessage: (code, kind, event) => {
    if (code === "23505") return `An event named "${event.name}" already exists.`;
    if (code === "42501") return `You do not have permission to ${kind} events. Officer access required.`;
  },
});

/**
 * Update an event without the offline queue. Automatic Absent is a server
 * policy, so changing its switch must reach Supabase now or fail; an
 * IndexedDB-local value would claim the policy was saved when it was not.
 */
async function updateOnlineOnly(id: string, event: Partial<Event>): Promise<Event> {
  if (browserOffline()) {
    throw new Error("Automatic Absent settings require an online connection and were not saved.");
  }
  const result = await events.write("update", id, events.toRow(event), event);
  events.invalidate();
  return result;
}

export const eventsService = {
  getAll: (forceRefresh = false): Promise<Event[]> => events.getAll(forceRefresh),

  /**
   * Student-facing feed: upcoming events from the full catalog. Do not narrow
   * this to a `.select(...)` of newer columns: a project that hasn't run a
   * migration yet would then fail the whole panel. Dates are date-only
   * Asia/Manila values, compared against today's Manila date.
   */
  async getUpcomingForStudents(forceRefresh = false): Promise<Event[]> {
    const todayInManila = calendarDateInTimeZone(new Date());
    // `date` is text; keep malformed legacy values such as "TBD" out.
    const upcoming = (await events.getAll(forceRefresh)).filter((event): event is Event & { date: string } => {
      const date = event.date ?? "";
      return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= todayInManila;
    });
    return upcoming.sort((left, right) => left.date.localeCompare(right.date));
  },

  create: (event: Omit<Event, "id">): Promise<Event> =>
    events.create(event, `Created event ${event.name}.`, {
      name: event.name,
      allocationAmount: event.allocationAmount,
    }),

  // Automatic Absent must never be queued/replayed, whoever the caller is.
  update: (id: string, event: Partial<Event>): Promise<Event> =>
    event.autoMarkAbsent !== undefined ? updateOnlineOnly(id, event) : events.update(id, event),

  updateOnlineOnly,

  delete: (id: string): Promise<void> => events.delete(id),
};

// ============================================
// EVENT EVALUATIONS
// ============================================
// Rows are written by a per-event Google Apps Script trigger with the service
// role key (see supabase/migrations/2026-09-15_event_evaluations.sql and
// event-evaluation-sync.gs); this app only reads them.
const evaluations = defineColumns<EventEvaluation>({
  eventId: "event_id",
  studentId: "student_id",
  studentName: "student_name",
  submittedAt: "submitted_at",
});

export const eventEvaluationsService = {
  async hasSubmitted(eventId: string, studentId: string): Promise<boolean> {
    const row = await unwrap(
      sb()
        .from("event_evaluations")
        .select("id")
        .eq("event_id", eventId)
        .eq("student_id", studentId.trim().toLowerCase())
        .maybeSingle(),
    );
    return row !== null;
  },

  /**
   * The record-search gate: the most recent (getAll() is date-descending)
   * evaluation-active event this student hasn't evaluated, or null.
   */
  async getPendingGate(studentId: string): Promise<Event | null> {
    const activeEvent = (await events.getAll()).find((event) => event.evaluationActive);
    if (!activeEvent) return null;
    return (await eventEvaluationsService.hasSubmitted(activeEvent.id, studentId)) ? null : activeEvent;
  },

  getForEvent: (eventId: string): Promise<EventEvaluation[]> =>
    evaluations.list(
      sb().from("event_evaluations").select("*").eq("event_id", eventId).order("submitted_at", DESC),
    ),
};
