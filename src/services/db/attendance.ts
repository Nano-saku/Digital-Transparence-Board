import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { AttendanceRecord, EventSession } from "../../types";
import {
  browserOffline,
  cachedQuery,
  defineTable,
  field,
  nullable,
  pgCode,
  sb,
  unwrap,
  DESC,
  type Row,
} from "./core";

/** Roles allowed by the attendance_write_staff RLS policy. */
const ATTENDANCE_WRITE_ROLES = ["admin", "secretary"];
const SESSION_EXPIRED = "Your officer session has expired. Sign in again to record attendance.";

/** Postgres 42501 / RLS rejection (insufficient_privilege). */
function isPermissionDenied(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "42501" || (typeof message === "string" && message.toLowerCase().includes("row-level security"));
}

/** Carries a Postgres-style code so the retry logic recognizes it. */
const permissionError = (message: string): Error => Object.assign(new Error(message), { code: "42501" });

/**
 * Why an attendance request failed, so callers can react to the real cause:
 * - "network": Supabase was unreachable (postgrest-js reports fetch failures
 *   with an empty code and a "Failed to fetch"-style message). Retry later.
 * - "auth": the database rejected the officer (42501, expired JWT).
 * - "database": any other Postgres/PostgREST error.
 */
export type AttendanceErrorKind = "network" | "auth" | "database";

export function classifyAttendanceError(error: unknown): AttendanceErrorKind {
  if (isAuthRetryableFetchError(error)) return "network";
  if (typeof error !== "object" || error === null) return "database";
  const { code, message } = error as { code?: unknown; message?: unknown };
  const codeText = typeof code === "string" ? code.trim() : "";
  if (isPermissionDenied(error) || codeText === "PGRST301" || codeText === "PGRST302") return "auth";
  if (
    !codeText &&
    typeof message === "string" &&
    /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|aborted/i.test(message)
  ) {
    return "network";
  }
  return "database";
}

/** Explains a denial that survived a session refresh by its actual cause. */
async function describeAttendanceDenial(): Promise<string> {
  const { data } = await sb().auth.getSession();
  const user = data.session?.user;
  if (!user) return SESSION_EXPIRED;

  const { data: roleRecord } = await sb().from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  const role = (roleRecord?.role as string | undefined) ?? null;
  if (!role || !ATTENDANCE_WRITE_ROLES.includes(role)) {
    return `This account (${role ?? "no officer role"}) is not allowed to record attendance. Only admin and secretary accounts can.`;
  }
  return "The database rejected this attendance write even though your account is an admin/secretary. Ask the system administrator to run supabase/attendance_fix.sql in the Supabase SQL Editor.";
}

/**
 * Runs an attendance write. A 42501 most often means the access token
 * expired while the tab was open (so the request ran as `anon`): refresh the
 * session once and retry under the same RLS policies.
 */
async function withAuthRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;

    const { data, error: refreshError } = await sb().auth.refreshSession();
    // A network failure while refreshing says nothing about the session.
    if (refreshError && isAuthRetryableFetchError(refreshError)) throw refreshError;
    if (refreshError || !data.session) throw permissionError(SESSION_EXPIRED);

    try {
      return await operation();
    } catch (retryError) {
      if (!isPermissionDenied(retryError)) throw retryError;
      throw permissionError(await describeAttendanceDenial());
    }
  }
}

const isNaturalKeyConflict = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const { code, message, details } = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = [message, details].filter((value) => typeof value === "string").join(" ");
  return (
    code === "23505" &&
    /attendance_student_event_date_key|student_id[\s_,]+event_id[\s_,]+date/i.test(text)
  );
};

async function persistAttendance(kind: "create" | "update", id: string, payload: Row): Promise<Row> {
  const table = () => sb().from("attendance");
  return withAuthRetry(async () => {
    if (kind === "create") {
      const { data, error } = await table().insert({ id, ...payload }).select().single();
      if (!error) return data;
      if (!isNaturalKeyConflict(error)) throw error;

      // Automatic Absent or another tab created the row after the caller's
      // lookup. The unique key is right; merge this edit into the winner.
      const existing = await unwrap<Row | null>(
        table()
          .select("*")
          .eq("student_id", payload.student_id)
          .eq("event_id", payload.event_id)
          .eq("date", payload.date)
          .maybeSingle(),
      );
      if (!existing) throw error;
      const { event_name, status, session, time_in, time_out } = payload;
      return unwrap<Row>(
        table().update({ event_name, status, session, time_in, time_out }).eq("id", existing.id).select().single(),
      );
    }

    const updated = await unwrap<Row | null>(table().update(payload).eq("id", id).select().maybeSingle());
    if (updated) return updated;

    // RLS filters an UPDATE silently (0 rows, no error): tell a missing row
    // from a denied one. A denial is retried and explained by withAuthRetry.
    const existing = await unwrap<Row | null>(table().select("id").eq("id", id).maybeSingle());
    if (!existing) {
      throw new Error("This attendance record no longer exists. Refresh the attendance list and try again.");
    }
    throw permissionError("Attendance was not updated: this session is not authorized to write attendance.");
  });
}

const attendance = defineTable<AttendanceRecord>({
  name: "attendance",
  entity: "attendance",
  noun: "attendance record",
  label: "attendance record",
  columns: {
    studentId: "student_id",
    eventId: "event_id",
    eventName: "event_name",
    date: "date",
    // Legacy `late` rows stay in the database but read as Present in the
    // current three-status model.
    status: field("status", (status) => (status === "absent" || status === "excuse" ? status : "present")),
    session: field("session", (session) => session ?? "morning"),
    timeIn: nullable("time_in"),
    timeOut: nullable("time_out"),
  },
  order: [
    ["date", DESC],
    ["id", DESC],
  ],
  createDefaults: { session: "morning", time_in: "", time_out: "" },
  persist: persistAttendance,
});

const byDateDesc = (a: AttendanceRecord, b: AttendanceRecord) => new Date(b.date).getTime() - new Date(a.date).getTime();

const cachedAttendance = (matches: (record: AttendanceRecord) => boolean, query: PromiseLike<{ data: Row[] | null; error: unknown }>) =>
  cachedQuery("attendance", () => attendance.list(query), matches).then((records) => records.sort(byDateDesc));

export const attendanceService = {
  getAll: (): Promise<AttendanceRecord[]> => attendance.getAll(),

  getByStudentId: (studentId: string): Promise<AttendanceRecord[]> =>
    cachedAttendance((record) => record.studentId === studentId, attendance.query().eq("student_id", studentId)),

  getByEventIdAndSession: (eventId: string, session: EventSession): Promise<AttendanceRecord[]> =>
    cachedAttendance(
      (record) => record.eventId === eventId && record.session === session,
      attendance.query().eq("event_id", eventId).eq("session", session),
    ),

  getByEventIdAndDate: (eventId: string, date: string): Promise<AttendanceRecord[]> =>
    attendance.list(attendance.query().eq("event_id", eventId).eq("date", date)),

  async getByStudentEventAndDate(studentId: string, eventId: string, date: string): Promise<AttendanceRecord | null> {
    const records = await attendanceService.getByEventIdAndDate(eventId, date);
    return records.find((record) => record.studentId === studentId) ?? null;
  },

  /**
   * Automatic Absent: inserts an "absent" row for every student without an
   * attendance row for the event's date and returns only the new rows;
   * existing rows are never modified.
   *
   * ONLINE ONLY: never cached, queued or replayed. Failures are thrown
   * unchanged for classifyAttendanceError() ("network" = try again on the
   * next check). The mark_absent_if_missing RPC (supabase/attendance_fix.sql)
   * authorizes admin/secretary itself; there is deliberately no direct-insert
   * fallback that would weaken the server-side event/date policy.
   */
  async markAbsentIfMissing(params: { eventId: string; session: EventSession }): Promise<AttendanceRecord[]> {
    if (browserOffline()) return [];

    // Without an officer session PostgREST would run this as `anon`.
    // getSession() refreshes an expired token; a network failure there is a
    // network failure, not an authorization problem.
    const { data, error: sessionError } = await sb().auth.getSession();
    if (sessionError && isAuthRetryableFetchError(sessionError)) throw sessionError;
    if (!data.session) throw permissionError(SESSION_EXPIRED);

    return withAuthRetry(async () => {
      const { data: rows, error } = await sb().rpc("mark_absent_if_missing", {
        p_event_id: params.eventId,
        p_session: params.session,
      });
      if (error) {
        // The RPC has not been installed yet.
        if (pgCode(error) === "PGRST202" || pgCode(error) === "42883") {
          throw new Error("Automatic Absent is not deployed. Run supabase/attendance_fix.sql before enabling it.");
        }
        throw error;
      }
      return ((rows ?? []) as Row[]).map(attendance.fromRow);
    });
  },

  create: (record: Omit<AttendanceRecord, "id">): Promise<AttendanceRecord> =>
    attendance.create(record, `Recorded attendance for student ${record.studentId} at ${record.eventName}.`, {
      studentId: record.studentId,
      eventId: record.eventId,
      status: record.status,
    }),

  update: (id: string, record: Partial<AttendanceRecord>): Promise<AttendanceRecord> => attendance.update(id, record),

  delete: (id: string): Promise<void> => attendance.delete(id),
};
