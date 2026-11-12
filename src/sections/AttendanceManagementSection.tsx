import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BarChart3, CircleAlert, CircleCheck, LogIn, LogOut, Pencil, QrCode, ShieldAlert, UserCheck, Users, X } from "lucide-react";
import { toast } from "sonner";
import { attendanceService, classifyAttendanceError, eventsService, lscOfficersService, studentsService } from "@/services/db";
import { useLiveData } from "@/hooks/useLiveData";
import type { AttendanceRecord, EventSession, Student, UserRole } from "@/types";
import { parseStudentQrText } from "@/lib/qr";
import { composeTime12, formatTime12, splitTime24 } from "@/lib/format";
import {
  calendarDateInTimeZone,
  EVENT_SESSION_LABELS,
  getEventSessionWindows,
  getScheduledEventSessions,
  hasEventAttendanceDayEnded,
  resolveEventSessionForTime,
} from "@/lib/attendance";
import { activeLscOfficerStudentIds } from "@/lib/lscEligibility";
import { canAccess } from "@/lib/roles";
import { matchesSearchWords } from "@/lib/utils";
import Page from "@/components/ui/Page";
import Modal from "@/components/ui/Modal";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import SearchInput from "@/components/ui/SearchInput";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton, { LoadingCard } from "@/components/ui/Skeleton";
import QrScanner from "./attendance/QrScanner";
import { AttendanceTable, Segmented, StatusChip, TimeFields, WholeDayPanel, type TimeParts } from "./attendance/parts";
import { MODE_LABEL, STATUS, STATUSES, type ScanMode, type Status } from "./attendance/status";

// Recharts is only needed for the analysis card — keep it out of this chunk.
const AttendanceAnalysisChart = lazy(() => import("@/components/AttendanceAnalysisChart"));

interface AttendanceManagementSectionProps {
  onBack: () => void;
  role: UserRole;
  userId?: string;
}

type TimePatch = Partial<Pick<AttendanceRecord, "status" | "timeIn" | "timeOut">>;
interface EditForm {
  status: Status;
  timeIn: TimeParts;
  timeOut: TimeParts;
}

const REALTIME_TABLES = ["events", "students", "attendance", "lsc_officers"] as const;

/** Current wall-clock time as 24h "HH:MM". */
const nowClock = () => new Date().toTimeString().slice(0, 5);

/** Empty string = deliberately blank (clears the time); null = invalid input. */
const parseTime = ({ hour, minute, period }: TimeParts) => (hour.trim() || minute.trim() ? composeTime12(hour, minute, period) : "");

/** Readable cause of a Supabase/PostgREST failure, including its details, hint and code. */
function errorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const { message, details, hint, code } = error as Record<string, unknown>;
  const codeText = typeof code === "string" ? code.trim() : "";
  if (codeText === "42501") {
    // attendanceService already refreshed the session, retried once, and
    // replaced the raw error with the specific cause. Show that cause as-is.
    return error instanceof Error && error.message ? error.message : "This session is not authorized to write attendance. Sign in again with an admin or secretary account.";
  }
  if (codeText === "PGRST116") return "The attendance row was not returned after saving. Refresh the attendance list and try again.";
  const parts = [message, details, hint].filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim());
  if (codeText) parts.push(`code ${codeText}`);
  if (parts.length) return parts.join(" — ");
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown database error";
  }
}

export default function AttendanceManagementSection({ onBack, role }: AttendanceManagementSectionProps) {
  const canRecordAttendance = canAccess(role, "attendance-management") === true;

  // Reconnect-aware sync: attendance, exemptions and officer changes from other devices.
  const { data, loading, mutate } = useLiveData({
    sources: {
      events: () => eventsService.getAll(),
      students: () => studentsService.getAll(),
      records: () => attendanceService.getAll(),
      officers: () => lscOfficersService.getAll(),
    },
    tables: REALTIME_TABLES,
    channel: "attendance-management",
    enabled: canRecordAttendance,
    onError: () => toast.error("Failed to load data"),
  });
  const { events = [], students = [], records = [], officers = [] } = data ?? {};

  const [eventId, setEventId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [scanFilter, setScanFilter] = useState<{ program: string; section: string } | null>(null);
  const [lastScan, setLastScan] = useState<{ studentId: string; time: string } | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>("timeIn");
  const [scanMessage, setScanMessage] = useState<{ ok: boolean; text: string; id: number } | null>(null);
  const [clearTarget, setClearTarget] = useState<{ id: string; name: string; sessionLabel: string } | null>(null);
  const [clearing, setClearing] = useState(false);
  // The opened row is kept so Save updates that exact record; null = new draft.
  const [editing, setEditing] = useState<{ student: Student; record: AttendanceRecord | null; form: EditForm } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  // Ticking clock that badges the scheduled session running right now.
  const [nowHM, setNowHM] = useState(nowClock);

  const attendanceEvents = useMemo(() => events.filter((e) => !e.isNonConducting), [events]);
  const event = attendanceEvents.find((e) => e.id === eventId);

  // Active LSC officers are exempt from attendance and left out of every list and total.
  const officerSet = useMemo(() => activeLscOfficerStudentIds(students, officers), [students, officers]);
  const eligibleStudents = useMemo(() => students.filter((s) => !officerSet.has(s.id)), [students, officerSet]);

  useEffect(() => {
    const interval = setInterval(() => setNowHM(nowClock()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Whole Day view: every session configured for the event is handled on one screen.
  const sessionWindows = useMemo(() => (event ? getEventSessionWindows(event) : []), [event]);
  const activeSession = event ? resolveEventSessionForTime(event, nowHM) : null;

  // Scoped by event + date: an event can keep rows from before its date was
  // edited, and Automatic Absent writes against the configured date.
  const eventRecords = useMemo(() => records.filter((r) => r.eventId === eventId && (!event?.date || r.date === event.date)), [records, eventId, event?.date]);

  const recordByStudent = useMemo(() => {
    // Prefer a real result over an auto-created Absent row, then the row carrying a Time In.
    const score = (r: AttendanceRecord) => (r.status === "absent" ? 0 : 2) + (r.timeIn ? 1 : 0);
    const map = new Map<string, AttendanceRecord>();
    for (const r of eventRecords) {
      const existing = map.get(r.studentId);
      if (!existing || score(r) > score(existing)) map.set(r.studentId, r);
    }
    return map;
  }, [eventRecords]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { present: 0, excuse: 0, absent: 0 };
    for (const s of eligibleStudents) {
      const status = recordByStudent.get(s.id)?.status;
      if (status) c[status]++;
    }
    return c;
  }, [eligibleStudents, recordByStudent]);

  // ── Persistence ───────────────────────────────────────────
  /** Creates or updates this student's single row for the selected event + date. */
  const persist = async (studentId: string, patch: TimePatch, recordToUpdate?: AttendanceRecord, sessionForWrite?: EventSession) => {
    const known = recordToUpdate ?? recordByStudent.get(studentId) ?? null;
    const target = known ?? (event && { eventId: event.id, eventName: event.name, date: event.date ?? calendarDateInTimeZone(new Date()) });
    if (!target) {
      toast.error("Select an event before recording attendance");
      return null;
    }
    // Automatic Absent or another tab may have created the row since it was
    // opened; re-check the natural key so an edit never inserts a duplicate.
    const existing = known ?? (navigator.onLine ? await attendanceService.getByStudentEventAndDate(studentId, target.eventId, target.date) : null);
    // The session is derived from the event's schedules and the recorded time, never picked by hand.
    const session = sessionForWrite ?? existing?.session ?? (event && resolveEventSessionForTime(event, patch.timeIn || patch.timeOut || nowClock())) ?? "morning";
    const payload = {
      studentId,
      eventId: target.eventId,
      eventName: existing?.eventName ?? target.eventName,
      date: target.date,
      session,
      status: patch.status ?? existing?.status ?? "present",
      // Time columns are NOT NULL; an empty string is a deliberately cleared time.
      timeIn: patch.timeIn ?? existing?.timeIn ?? "",
      timeOut: patch.timeOut ?? existing?.timeOut ?? "",
    };
    const saved = existing ? await attendanceService.update(existing.id, payload) : await attendanceService.create(payload);
    // A refresh that began before (or just after) this write keeps the saved row.
    mutate("records", (prev) => {
      const i = prev.findIndex((r) => r.id === saved.id || (r.studentId === saved.studentId && r.eventId === saved.eventId && r.date === saved.date));
      return i >= 0 ? prev.map((r, j) => (j === i ? saved : r)) : [...prev, saved];
    });
    return saved;
  };

  /** Stamps the current time as Time In / Time Out (QR scan or row menu). Valid scans always record Present. */
  const recordNow = async (student: Student, mode: ScanMode) => {
    if (!event) return void toast.error("Select an event before recording attendance");
    if (officerSet.has(student.id)) return void toast.info(`${student.name} is an active LSC officer and is exempt from this attendance requirement.`);
    const existing = recordByStudent.get(student.id);
    const time = nowClock();
    let patch: TimePatch;
    let session: EventSession | null;
    if (mode === "timeIn") {
      if (existing?.timeIn) return void toast.info(`${student.name} already has Time In recorded`);
      // Time In detects the scheduled session from the event configuration.
      patch = { status: "present", timeIn: time };
      session = resolveEventSessionForTime(event, time);
    } else {
      if (!existing?.timeIn) return void toast.error(`${student.name} has no Time In yet for this event`);
      if (existing.timeOut) return void toast.info(`${student.name} already has Time Out recorded`);
      // Time Out reuses the session stored with Time In.
      patch = { status: existing.status, timeOut: time };
      session = existing.session;
    }
    try {
      await persist(student.id, patch, existing, session ?? undefined);
      toast.success(`${student.name} ${MODE_LABEL[mode]} recorded at ${formatTime12(time)} for the ${session ? EVENT_SESSION_LABELS[session] : "Whole Day"} session`);
    } catch (error) {
      console.error(`Error recording ${MODE_LABEL[mode]}:`, error);
      toast.error(`Failed to record ${MODE_LABEL[mode]} — ${errorMessage(error)}`);
    }
  };

  const openEdit = (student: Student, record?: AttendanceRecord) => {
    if (!event) return void toast.error("Select an event before editing attendance");
    setEditing({ student, record: record ?? null, form: { status: record?.status ?? "absent", timeIn: splitTime24(record?.timeIn), timeOut: splitTime24(record?.timeOut) } });
  };
  const setForm = (patch: Partial<EditForm>) => setEditing((e) => e && { ...e, form: { ...e.form, ...patch } });

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const timeIn = parseTime(editing.form.timeIn);
    const timeOut = parseTime(editing.form.timeOut);
    if (timeIn === null || timeOut === null) return void toast.error(`${timeIn === null ? "Time In" : "Time Out"} hour must be 1-12 and minutes must be 00-59.`);
    setSavingEdit(true);
    try {
      const saved = await persist(editing.student.id, { status: editing.form.status, timeIn, timeOut }, editing.record ?? undefined);
      if (!saved) throw new Error("No attendance record was returned after saving.");
      toast.success(`${editing.student.name}'s attendance ${editing.record ? "updated" : "created"}.`);
      setEditing(null);
    } catch (error) {
      console.error("Error saving attendance:", error);
      toast.error(`Failed to save attendance — ${errorMessage(error)}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmClear = async () => {
    if (!clearTarget) return;
    setClearing(true);
    try {
      await attendanceService.delete(clearTarget.id);
      mutate("records", (prev) => prev.filter((r) => r.id !== clearTarget.id));
      if (lastScan && recordByStudent.get(lastScan.studentId)?.id === clearTarget.id) setLastScan(null);
      toast.success(`${clearTarget.name}'s ${clearTarget.sessionLabel} attendance has been cleared.`);
      setClearTarget(null);
    } catch (error) {
      console.error("Error clearing attendance:", error);
      toast.error(`Failed to clear ${clearTarget.name}'s attendance.`);
    } finally {
      setClearing(false);
    }
  };

  const onScan = (raw: string) => {
    const id = Date.now();
    const payload = parseStudentQrText(raw);
    const student = payload && students.find((s) => s.studentId === payload.studentId);
    if (!student) {
      return setScanMessage({
        ok: false,
        id,
        text: payload ? `No student matches ID "${payload.studentId}" — use the manual search below.` : "Unrecognized QR code — please scan a student attendance QR.",
      });
    }
    setScanMessage({ ok: true, id, text: `Scanned ${student.name} (${student.studentId}) — recording ${MODE_LABEL[scanMode]}…` });
    setScanFilter({ program: student.program, section: student.section });
    setLastScan({ studentId: student.id, time: nowClock() });
    void recordNow(student, scanMode);
  };

  // ── Automatic Absent ──────────────────────────────────────
  // Once an event's calendar day has ended and Auto Mark Absent is on, the
  // mark_absent_if_missing RPC inserts Absent rows for students with no row.
  // Online only and never queued: rechecked on load, every minute, and on reconnect.
  // One run at a time; each distinct failure is toasted once.
  const autoMarking = useRef(false);
  const autoAbsentError = useRef<string | null>(null);
  useEffect(() => {
    if (!canRecordAttendance) return;
    const run = async () => {
      if (autoMarking.current || !navigator.onLine) return;
      const now = new Date();
      const due = events.filter((e) => e.autoMarkAbsent === true && !e.isNonConducting && e.date && hasEventAttendanceDayEnded(e.date, now));
      if (!due.length) return;

      autoMarking.current = true;
      try {
        for (const ev of due) {
          // An event-date cutoff, not a schedule-window one: the session only labels the inserted rows.
          const session = getScheduledEventSessions(ev)[0] ?? "morning";
          const inserted = await attendanceService.markAbsentIfMissing({ eventId: ev.id, session });
          if (inserted.length) mutate("records", (prev) => [...new Map([...prev, ...inserted].map((r) => [r.id, r])).values()]);
        }
        autoAbsentError.current = null;
      } catch (error) {
        const kind = classifyAttendanceError(error);
        if (kind === "network") {
          // Supabase unreachable — nothing was written; the next check retries.
          console.warn("Automatic Absent skipped; Supabase unreachable:", error);
          return;
        }
        console.error("Auto-marking absent students failed:", error);
        const message = kind === "auth" ? "not authorized. Sign out and sign in again; if it persists, an admin must run supabase/attendance_fix.sql." : errorMessage(error);
        if (autoAbsentError.current !== message) {
          autoAbsentError.current = message;
          toast.error(`Failed to auto-mark absent students — ${message}`);
        }
      } finally {
        autoMarking.current = false;
      }
    };
    const retry = () => void run();
    retry();
    const interval = setInterval(retry, 60_000);
    window.addEventListener("online", retry);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", retry);
    };
  }, [canRecordAttendance, events, mutate]);

  // ── Table rows ────────────────────────────────────────────
  // Only depend on records when filtering by status, so saving a row doesn't jump back to page 1.
  const statusSource = statusFilter === "all" ? null : recordByStudent;
  const visibleStudents = useMemo(() => {
    const list = eligibleStudents.filter(
      (s) =>
        (!scanFilter || (s.program === scanFilter.program && s.section === scanFilter.section)) &&
        matchesSearchWords(`${s.name} ${s.studentId}`, query) &&
        (!statusSource || statusSource.get(s.id)?.status === statusFilter),
    );
    const pinned = lastScan && list.find((s) => s.id === lastScan.studentId);
    return pinned ? [pinned, ...list.filter((s) => s !== pinned)] : list;
  }, [eligibleStudents, scanFilter, query, statusSource, statusFilter, lastScan]);

  const lastScanned = lastScan && students.find((s) => s.id === lastScan.studentId);
  const officerCount = students.length - eligibleStudents.length;

  if (!canRecordAttendance) {
    return (
      <Page eyebrow="Events" title="Attendance" onBack={onBack}>
        <div className="card">
          <EmptyState icon={ShieldAlert} title="Access denied" description="You don't have permission to access attendance management." />
        </div>
      </Page>
    );
  }

  return (
    <Page
      eyebrow="Events"
      title="Attendance"
      subtitle="Scan student QR passes for the whole event day — each Time In and Time Out lands in the right scheduled session automatically."
      onBack={onBack}
      hero={
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatCard
            featured
            label="Students tracked"
            value={eligibleStudents.length}
            icon={Users}
            hint={officerCount ? `${officerCount} LSC officer${officerCount > 1 ? "s" : ""} exempt` : `${attendanceEvents.length} events`}
          />
          {STATUSES.map((s) => (
            <StatCard key={s} label={STATUS[s].label} value={event ? counts[s] : "—"} icon={STATUS[s].icon} tone={STATUS[s].tone} hint={event ? "Whole day" : "Select an event"} />
          ))}
        </div>
      }
    >
      {loading ? (
        <LoadingCard label="Loading attendance…" />
      ) : (
        <>
          {/* Event picker + Whole Day sessions */}
          <section className="card space-y-5 p-5 sm:p-6">
            {attendanceEvents.length === 0 ? (
              <EmptyState icon={QrCode} title="No events yet" description="Create an event that tracks attendance to start recording." />
            ) : (
              <>
                <div>
                  <p className="label">Event</p>
                  <Segmented label="Event" value={event ? eventId : null} onChange={setEventId} options={attendanceEvents.map((e) => ({ value: e.id, label: e.name }))} />
                </div>
                {event && <WholeDayPanel event={event} windows={sessionWindows} activeSession={activeSession} records={eventRecords} />}
              </>
            )}
          </section>

          {!event ? (
            attendanceEvents.length > 0 && (
              <div className="card">
                <EmptyState icon={UserCheck} title="Select an event to track attendance" description="Pick an event above to open the scanner and the student list." />
              </div>
            )
          ) : (
            <>
              <section className="card grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
                <QrScanner
                  modeLabel={MODE_LABEL[scanMode]}
                  tone={scanMessage ? (scanMessage.ok ? "ok" : "error") : null}
                  onScan={onScan}
                  onStart={() => setScanMessage(null)}
                  onError={(text) => setScanMessage({ ok: false, id: Date.now(), text })}
                />

                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <div className="icon-tile">
                      <QrCode className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg">QR scanner</h2>
                      <p className="text-sm text-muted">Pick a mode, then hold a student's QR pass up to the camera — the scan time is recorded automatically.</p>
                    </div>
                  </div>
                  <Segmented
                    label="Scan mode"
                    value={scanMode}
                    onChange={setScanMode}
                    options={[
                      { value: "timeIn", label: "Scan Time In", icon: LogIn },
                      { value: "timeOut", label: "Scan Time Out", icon: LogOut },
                    ]}
                  />

                  <div aria-live="polite">
                    {scanMessage && (
                      <div
                        key={scanMessage.id}
                        className={`flex animate-fade-up items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm font-medium ${
                          scanMessage.ok ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger"
                        }`}
                      >
                        {scanMessage.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
                        {scanMessage.text}
                      </div>
                    )}
                  </div>

                  {lastScan && lastScanned && (
                    <div className="rounded-2xl border border-line bg-surface-2 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Last scanned</p>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/10 text-sm font-bold text-brand-600">{lastScanned.name.charAt(0).toUpperCase()}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{lastScanned.name}</p>
                          <p className="truncate text-xs text-muted">
                            {lastScanned.program} · Section {lastScanned.section}
                          </p>
                        </div>
                        <StatusChip status={recordByStudent.get(lastScanned.id)?.status} />
                      </div>
                      <p className="mt-3 text-xs text-muted">
                        Scanned at <b className="text-ink">{formatTime12(lastScan.time)}</b> · {event.name}
                      </p>
                    </div>
                  )}

                  <p className="mt-auto text-xs text-muted">Can't scan a QR pass? Find the student in the list below and use Edit to record attendance manually.</p>
                </div>
              </section>

              <AttendanceTable
                key={eventId}
                students={visibleStudents}
                recordByStudent={recordByStudent}
                lastScanId={lastScan?.studentId}
                toolbar={
                  <div className="flex flex-col gap-3 border-b border-line p-4 sm:p-5 lg:flex-row lg:items-center">
                    <SearchInput value={query} onChange={setQuery} placeholder="Search by name or student ID…" className="flex-1" />
                    <Segmented
                      label="Filter by status"
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={[{ value: "all" as const, label: "All" }, ...STATUSES.map((s) => ({ value: s, label: `${STATUS[s].label} · ${counts[s]}` }))]}
                    />
                    {scanFilter && (
                      <button
                        type="button"
                        className="chip chip-brand self-start hover:bg-brand-500/20 lg:self-auto"
                        onClick={() => {
                          setScanFilter(null);
                          setLastScan(null);
                        }}
                        title="Clear the filter set by the last QR scan"
                      >
                        {scanFilter.program} · Section {scanFilter.section}
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                }
                emptyText={
                  scanFilter
                    ? `No students found in ${scanFilter.program} — Section ${scanFilter.section}${query ? ` matching "${query}"` : ""}.`
                    : query
                      ? `No students match "${query}".`
                      : "No students match the current filter."
                }
                onEdit={openEdit}
                onRecordNow={(student, mode) => void recordNow(student, mode)}
                onClear={(student, record) => setClearTarget({ id: record.id, name: student.name, sessionLabel: EVENT_SESSION_LABELS[record.session] ?? "Whole Day" })}
              />
            </>
          )}

          {/* Analysis */}
          <section className="card p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="icon-tile">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg">Event attendance analysis</h2>
                <p className="text-sm text-muted">Students tracked vs. students who attended (present or excused), per event.</p>
              </div>
            </div>
            <Suspense fallback={<Skeleton className="h-72 w-full" />}>
              <AttendanceAnalysisChart events={attendanceEvents} students={eligibleStudents} records={records} />
            </Suspense>
          </section>
        </>
      )}

      <Modal
        open={!!editing}
        onClose={() => !savingEdit && setEditing(null)}
        title={editing?.record ? "Edit attendance" : "Set attendance"}
        size="lg"
        description={
          <>
            <b className="text-ink">{editing?.student.name}</b> — {editing?.record?.eventName ?? event?.name ?? "—"}
          </>
        }
        icon={<Pencil className="h-5 w-5 text-brand-500" />}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)} disabled={savingEdit}>
              Cancel
            </button>
            <button type="submit" form="attendance-edit" className="btn btn-primary" disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {editing && (
          <form id="attendance-edit" onSubmit={saveEdit} className="space-y-5">
            <div>
              <p className="label">Status</p>
              <Segmented
                label="Status"
                value={editing.form.status}
                onChange={(status) => setForm({ status })}
                options={STATUSES.map((s) => ({ value: s, label: STATUS[s].label, icon: STATUS[s].icon }))}
                disabled={savingEdit}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["timeIn", "timeOut"] as const).map((field) => (
                <TimeFields key={field} label={MODE_LABEL[field]} value={editing.form[field]} onChange={(value) => setForm({ [field]: value })} disabled={savingEdit} />
              ))}
            </div>
            <p className="text-xs text-muted">Type Hour (1-12) and Minutes (00-59), then choose AM or PM. Leave both blank to clear.</p>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!clearTarget}
        onClose={() => setClearTarget(null)}
        onConfirm={confirmClear}
        loading={clearing}
        title="Clear attendance?"
        confirmLabel="Clear attendance"
        description={
          <>
            Clear <b className="text-ink">{clearTarget?.name}</b>'s <b className="text-ink">{clearTarget?.sessionLabel}</b> attendance? The record is
            permanently removed and the student can be marked again afterward.
          </>
        }
      />
    </Page>
  );
}
