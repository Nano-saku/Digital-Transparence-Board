import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  Camera,
  CameraOff,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  Clock,
  CloudSun,
  LogIn,
  LogOut,
  Moon,
  Pencil,
  QrCode,
  ScanLine,
  ShieldAlert,
  Sun,
  Sunrise,
  SwitchCamera,
  Trash2,
  UserCheck,
  Users,
  UserX,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { attendanceService, classifyAttendanceError, eventsService, lscOfficersService, studentsService } from "@/services/db";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import type { AttendanceRecord, Event, EventSession, Student, UserRole } from "@/types";
import { parseStudentQrText } from "@/lib/qr";
import { composeTime12, formatDate, formatTime12, splitTime24 } from "@/lib/format";
import {
  EVENT_SESSION_LABELS,
  getEventSessionWindows,
  getScheduledEventSessions,
  hasEventAttendanceDayEnded,
  resolveEventSessionForTime,
  type EventSessionWindow,
} from "@/lib/attendance";
import { activeLscOfficerStudentIds } from "@/lib/lscEligibility";
import { cn, matchesSearchWords } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import Page from "@/components/ui/Page";
import Modal from "@/components/ui/Modal";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import SearchInput from "@/components/ui/SearchInput";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton, { LoadingCard } from "@/components/ui/Skeleton";
import { Menu, MenuContent, MenuItem, MenuSeparator, RowActionsTrigger } from "@/components/ui/Menu";

// Recharts is only needed for the analysis card — keep it out of this chunk.
const AttendanceAnalysisChart = lazy(() => import("@/components/AttendanceAnalysisChart"));

interface AttendanceManagementSectionProps {
  onBack: () => void;
  role: UserRole;
  userId?: string;
}

type Status = AttendanceRecord["status"];
type ScanMode = "timeIn" | "timeOut";
type TimePatch = Partial<Pick<AttendanceRecord, "status" | "timeIn" | "timeOut">>;
type TimeParts = ReturnType<typeof splitTime24>;
interface EditForm {
  status: Status;
  timeIn: TimeParts;
  timeOut: TimeParts;
}

const STATUSES: Status[] = ["present", "excuse", "absent"];
const STATUS: Record<Status, { label: string; chip: string; tone: "success" | "brand" | "danger"; icon: LucideIcon }> = {
  present: { label: "Present", chip: "chip-success", tone: "success", icon: UserCheck },
  excuse: { label: "Excused", chip: "chip-brand", tone: "brand", icon: ClipboardCheck },
  absent: { label: "Absent", chip: "chip-danger", tone: "danger", icon: UserX },
};
const SESSION_ICON: Record<EventSession, LucideIcon> = { morning: Sunrise, afternoon: Sun, evening: Moon };
const MODE_LABEL: Record<ScanMode, string> = { timeIn: "Time In", timeOut: "Time Out" };
const REAR_CAMERA = /back|rear|environment|world|外向|后置/i;
const REALTIME_TABLES = ["events", "students", "attendance", "lsc_officers"] as const;
const PAGE_SIZE = 20;
/**
 * Supabase's REST layer can lag slightly behind the realtime event, so a
 * background refresh started this soon after a write may return a snapshot
 * that predates it. Such refreshes keep the locally applied rows.
 */
const WRITE_GRACE_MS = 4_000;

/** Current wall-clock time as 24h "HH:MM". */
const nowClock = () => new Date().toTimeString().slice(0, 5);

/** Readable cause of a Supabase/PostgREST failure, including its details, hint and code. */
function errorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const { message, details, hint, code } = error as Record<string, unknown>;
  const codeText = typeof code === "string" ? code.trim() : "";
  if (codeText === "42501") {
    // attendanceService already refreshed the session, retried once, and
    // replaced the raw error with the specific cause. Show that cause as-is.
    return error instanceof Error && error.message
      ? error.message
      : "This session is not authorized to write attendance. Sign in again with an admin or secretary account.";
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

function windowSummary({ timeIn, timeOut }: EventSessionWindow): { text: string; chip: string } {
  if (!timeIn && !timeOut) return { text: "Schedule times not configured", chip: "chip-warning" };
  return {
    text: `${timeIn ? formatTime12(timeIn) : "Time In not set"} – ${timeOut ? formatTime12(timeOut) : "Time Out not set"}`,
    chip: timeIn && timeOut ? "chip-success" : "chip-brand",
  };
}

/** Empty string = deliberately blank (clears the time); null = invalid input. */
const parseTime = ({ hour, minute, period }: TimeParts) => (hour.trim() || minute.trim() ? composeTime12(hour, minute, period) : "");

/** Keeps the previous array when a realtime refresh returns identical data, so pagination isn't reset. */
const keepIfEqual = <T,>(prev: T, next: T) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next);

function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  disabled,
}: {
  value: T | null;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; icon?: LucideIcon }[];
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("max-w-full overflow-x-auto", className)}>
      <div role="radiogroup" aria-label={label} className="inline-flex gap-1 rounded-full border border-line bg-surface-2 p-1">
        {options.map(({ value: v, label, icon: Icon }) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={v === value}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition disabled:opacity-60",
              v === value ? "bg-brand-500 text-white shadow-glow" : "text-muted hover:bg-surface hover:text-ink",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

const StatusChip = ({ status }: { status?: Status }) =>
  status ? <span className={cn("chip", STATUS[status].chip)}>{STATUS[status].label}</span> : <span className="chip chip-neutral">Not recorded</span>;

export default function AttendanceManagementSection({ onBack, role }: AttendanceManagementSectionProps) {
  const canRecordAttendance = role === "admin" || role === "secretary";

  const [events, setEvents] = useState<Event[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [officerIds, setOfficerIds] = useState<string[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [eventId, setEventId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [scanFilter, setScanFilter] = useState<{ program: string; section: string } | null>(null);
  const [lastScan, setLastScan] = useState<{ studentId: string; time: string } | null>(null);
  const [clearTarget, setClearTarget] = useState<{ id: string; name: string; sessionLabel: string } | null>(null);
  const [clearing, setClearing] = useState(false);
  // The opened row is kept so Save updates that exact record; null = new draft.
  const [editing, setEditing] = useState<{ student: Student; record: AttendanceRecord | null } | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // QR scanner
  const [scanMode, setScanMode] = useState<ScanMode>("timeIn");
  const [scannerActive, setScannerActive] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<{ ok: boolean; text: string; id: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastScanRef = useRef({ data: "", at: 0 });
  const autoPickedRef = useRef(false);

  // Automatic Absent: one run at a time; each distinct failure is toasted once.
  const autoMarkingRef = useRef(false);
  const autoAbsentErrorRef = useRef<string | null>(null);
  // Write/refresh ordering: a refresh that started before (or just after) a
  // save completed must not replace the just-saved rows with an older snapshot.
  const writeVersionRef = useRef(0);
  const loadVersionRef = useRef(0);
  const lastWriteAtRef = useRef(0);
  const markWritten = () => {
    writeVersionRef.current += 1;
    lastWriteAtRef.current = Date.now();
  };

  const attendanceEvents = useMemo(() => events.filter((e) => !e.isNonConducting), [events]);
  const event = attendanceEvents.find((e) => e.id === eventId);
  const scanning = scannerActive && !!event;

  // Active LSC officers are exempt from attendance and left out of every list and total.
  const officerSet = useMemo(() => new Set(officerIds), [officerIds]);
  const eligibleStudents = useMemo(() => students.filter((s) => !officerSet.has(s.id)), [students, officerSet]);

  const loadData = useCallback(async (background = false) => {
    const loadVersion = ++loadVersionRef.current;
    const writeVersionAtStart = writeVersionRef.current;
    const writeAtStart = lastWriteAtRef.current;
    const startedAt = Date.now();
    try {
      const [e, s, a, officers] = await Promise.all([
        eventsService.getAll(),
        studentsService.getAll(),
        attendanceService.getAll(),
        lscOfficersService.getAll(),
      ]);
      setEvents((prev) => keepIfEqual(prev, e));
      setStudents((prev) => keepIfEqual(prev, s));
      setOfficerIds((prev) => keepIfEqual(prev, [...activeLscOfficerStudentIds(s, officers)].sort()));
      setRecords((current) => {
        const stale =
          loadVersion !== loadVersionRef.current ||
          writeVersionAtStart !== writeVersionRef.current ||
          (background && (writeAtStart !== lastWriteAtRef.current || startedAt - lastWriteAtRef.current < WRITE_GRACE_MS));
        return stale ? current : a;
      });
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Reconnect-aware sync: attendance, exemptions and officer changes from other devices.
  useRealtimeSync({ tables: REALTIME_TABLES, onChange: () => void loadData(true), channelPrefix: "attendance-management" });

  // Ticking clock that badges the scheduled session running right now.
  const [nowHM, setNowHM] = useState(nowClock);
  useEffect(() => {
    const interval = setInterval(() => setNowHM(nowClock()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Whole Day view: every session configured for the event is handled on one screen.
  const sessionWindows = useMemo(() => (event ? getEventSessionWindows(event) : []), [event]);
  const activeSession = event ? resolveEventSessionForTime(event, nowHM) : null;

  // Scoped by event + date: an event can keep rows from before its date was
  // edited, and Automatic Absent writes against the configured date.
  const eventRecords = useMemo(
    () => records.filter((r) => r.eventId === eventId && (!event?.date || r.date === event.date)),
    [records, eventId, event?.date],
  );

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
    const target = known ?? (event && { eventId: event.id, eventName: event.name, date: event.date ?? new Date().toISOString().slice(0, 10) });
    if (!target) {
      toast.error("Select an event before recording attendance");
      return null;
    }
    // Automatic Absent or another tab may have created the row since it was
    // opened; re-check the natural key so an edit never inserts a duplicate.
    const existing =
      known ?? (navigator.onLine ? await attendanceService.getByStudentEventAndDate(studentId, target.eventId, target.date) : null);
    // The session is derived from the event's schedules and the recorded time, never picked by hand.
    const session =
      sessionForWrite ??
      existing?.session ??
      (event && resolveEventSessionForTime(event, patch.timeIn || patch.timeOut || nowClock())) ??
      "morning";
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
    writeVersionRef.current += 1;
    const saved = existing ? await attendanceService.update(existing.id, payload) : await attendanceService.create(payload);
    // Advance again so a refresh that began mid-write cannot apply its older snapshot.
    markWritten();
    setRecords((prev) => {
      const i = prev.findIndex(
        (r) => r.id === saved.id || (r.studentId === saved.studentId && r.eventId === saved.eventId && r.date === saved.date),
      );
      return i >= 0 ? prev.map((r, j) => (j === i ? saved : r)) : [...prev, saved];
    });
    return saved;
  };

  /** Stamps the current time as Time In / Time Out (QR scan or row menu). Valid scans always record Present. */
  const recordNow = async (student: Student, mode: ScanMode) => {
    if (!event) {
      toast.error("Select an event before recording attendance");
      return;
    }
    if (officerSet.has(student.id)) {
      toast.info(`${student.name} is an active LSC officer and is exempt from this attendance requirement.`);
      return;
    }
    const existing = recordByStudent.get(student.id);
    const time = nowClock();
    let patch: TimePatch;
    let session: EventSession | null;
    if (mode === "timeIn") {
      if (existing?.timeIn) {
        toast.info(`${student.name} already has Time In recorded`);
        return;
      }
      // Time In detects the scheduled session from the event configuration.
      patch = { status: "present", timeIn: time };
      session = resolveEventSessionForTime(event, time);
    } else {
      if (!existing?.timeIn) {
        toast.error(`${student.name} has no Time In yet for this event`);
        return;
      }
      if (existing.timeOut) {
        toast.info(`${student.name} already has Time Out recorded`);
        return;
      }
      // Time Out reuses the session stored with Time In.
      patch = { status: existing.status, timeOut: time };
      session = existing.session;
    }
    const sessionLabel = session ? EVENT_SESSION_LABELS[session] : "Whole Day";
    try {
      await persist(student.id, patch, existing, session ?? undefined);
      toast.success(`${student.name} ${MODE_LABEL[mode]} recorded at ${formatTime12(time)} for the ${sessionLabel} session`);
    } catch (error) {
      console.error(`Error recording ${MODE_LABEL[mode]}:`, error);
      toast.error(`Failed to record ${MODE_LABEL[mode]} — ${errorMessage(error)}`);
    }
  };

  const openEdit = (student: Student, record?: AttendanceRecord) => {
    if (!event) {
      toast.error("Select an event before editing attendance");
      return;
    }
    setEditForm({ status: record?.status ?? "absent", timeIn: splitTime24(record?.timeIn), timeOut: splitTime24(record?.timeOut) });
    setEditing({ student, record: record ?? null });
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !editForm) return;
    const timeIn = parseTime(editForm.timeIn);
    const timeOut = parseTime(editForm.timeOut);
    if (timeIn === null || timeOut === null) {
      toast.error(`${timeIn === null ? "Time In" : "Time Out"} hour must be 1-12 and minutes must be 00-59.`);
      return;
    }
    setSavingEdit(true);
    try {
      const saved = await persist(editing.student.id, { status: editForm.status, timeIn, timeOut }, editing.record ?? undefined);
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
      markWritten();
      setRecords((prev) => prev.filter((r) => r.id !== clearTarget.id));
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

  // ── QR scanning ───────────────────────────────────────────
  const onScan = useEffectEvent((raw: string) => {
    const now = Date.now();
    if (lastScanRef.current.data === raw && now - lastScanRef.current.at < 2500) return;
    lastScanRef.current = { data: raw, at: now };

    const payload = parseStudentQrText(raw);
    const student = payload && students.find((s) => s.studentId === payload.studentId);
    if (!student) {
      setScanMessage({
        ok: false,
        id: now,
        text: payload
          ? `No student matches ID "${payload.studentId}" — use the manual search below.`
          : "Unrecognized QR code — please scan a student attendance QR.",
      });
      return;
    }
    setScanMessage({ ok: true, id: now, text: `Scanned ${student.name} (${student.studentId}) — recording ${MODE_LABEL[scanMode]}…` });
    setScanFilter({ program: student.program, section: student.section });
    setLastScan({ studentId: student.id, time: nowClock() });
    void recordNow(student, scanMode);
  });

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!scanning || !video || !canvas) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let raf = 0;

    const start = async () => {
      try {
        const media = navigator.mediaDevices;
        if (!media?.getUserMedia) throw new Error("Camera API unavailable");
        const decoder = import("jsqr"); // ~130 kB — only fetched once the camera starts
        try {
          stream = await media.getUserMedia({ video: cameraId ? { deviceId: { exact: cameraId } } : { facingMode: { ideal: "environment" } } });
        } catch {
          if (cameraId) {
            if (!cancelled) setCameraId(null); // chosen camera vanished — fall back to the default one
            return;
          }
          stream = await media.getUserMedia({ video: true }); // no rear camera — any camera will do
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play().catch(() => undefined); // autoplay restrictions
        lastScanRef.current = { data: "", at: 0 };

        const current = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
        const devices = ((await media.enumerateDevices?.()) ?? []).filter((d) => d.kind === "videoinput");
        if (cancelled) return;
        setCameras(devices);
        setActiveCameraId(current);
        if (!cameraId && !autoPickedRef.current && devices.length > 1) {
          // Browsers often open the front camera first; prefer the rear one once.
          autoPickedRef.current = true;
          const rear = devices.find((d) => REAR_CAMERA.test(d.label));
          if (rear && rear.deviceId !== current) {
            setCameraId(rear.deviceId);
            return;
          }
        }

        const { default: jsQR } = await decoder;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        let lastDecode = 0;
        const tick = (t: number) => {
          raf = requestAnimationFrame(tick);
          // Decoding every frame pegs the CPU; ~10 scans/s is plenty.
          if (!ctx || t - lastDecode < 100 || video.readyState < video.HAVE_ENOUGH_DATA || !video.videoWidth) return;
          lastDecode = t;
          if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
          if (code?.data) onScan(code.data);
        };
        if (!cancelled) raf = requestAnimationFrame(tick);
      } catch (error) {
        console.error("Error starting QR scanner camera:", error);
        if (!cancelled) {
          setScanMessage({ ok: false, id: Date.now(), text: "Unable to access the camera. Grant camera permission or use the manual search below." });
          setScannerActive(false);
        }
      }
    };
    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [scanning, cameraId]);

  const switchCamera = () => {
    const next = cameras[(cameras.findIndex((d) => d.deviceId === activeCameraId) + 1) % cameras.length];
    if (next) setCameraId(next.deviceId);
  };

  // ── Automatic Absent ──────────────────────────────────────
  // Once an event's calendar day has ended and Auto Mark Absent is on, the
  // mark_absent_if_missing RPC inserts Absent rows for students with no row.
  // Online only and never queued: rechecked on load, every minute, and on reconnect.
  useEffect(() => {
    if (!canRecordAttendance) return;
    const run = async () => {
      if (autoMarkingRef.current || !navigator.onLine) return;
      const now = new Date();
      const due = events.filter((e) => e.autoMarkAbsent === true && !e.isNonConducting && e.date && hasEventAttendanceDayEnded(e.date, now));
      if (!due.length) return;

      autoMarkingRef.current = true;
      try {
        for (const ev of due) {
          // An event-date cutoff, not a schedule-window one: the session only labels the inserted rows.
          const session = getScheduledEventSessions(ev)[0] ?? "morning";
          const inserted = await attendanceService.markAbsentIfMissing({ eventId: ev.id, session });
          if (!inserted.length) continue;
          setRecords((prev) => [...new Map([...prev, ...inserted].map((r) => [r.id, r])).values()]);
          markWritten();
        }
        autoAbsentErrorRef.current = null;
      } catch (error) {
        const kind = classifyAttendanceError(error);
        if (kind === "network") {
          // Supabase unreachable — nothing was written; the next check retries.
          console.warn("Automatic Absent skipped; Supabase unreachable:", error);
          return;
        }
        console.error("Auto-marking absent students failed:", error);
        const message =
          kind === "auth"
            ? "not authorized. Sign out and sign in again; if it persists, an admin must run supabase/attendance_fix.sql."
            : errorMessage(error);
        if (autoAbsentErrorRef.current !== message) {
          autoAbsentErrorRef.current = message;
          toast.error(`Failed to auto-mark absent students — ${message}`);
        }
      } finally {
        autoMarkingRef.current = false;
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
  }, [canRecordAttendance, events]);

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
            <StatCard
              key={s}
              label={STATUS[s].label}
              value={event ? counts[s] : "—"}
              icon={STATUS[s].icon}
              tone={STATUS[s].tone}
              hint={event ? "Whole day" : "Select an event"}
            />
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
              {/* QR scanner */}
              <section className="card grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
                <div
                  className={cn(
                    "relative aspect-[4/3] overflow-hidden rounded-2xl bg-brand-950 ring-4 transition-shadow",
                    scanMessage ? (scanMessage.ok ? "ring-success/50" : "ring-danger/40") : "ring-transparent",
                  )}
                >
                  <video ref={videoRef} className={cn("absolute inset-0 h-full w-full object-cover", !scanning && "invisible")} muted playsInline />
                  <canvas ref={canvasRef} className="hidden" />
                  {scanning ? (
                    <>
                      <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square h-3/5 -translate-x-1/2 -translate-y-1/2">
                        {["left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"].map((c) => (
                          <span key={c} className={cn("absolute h-8 w-8 border-white/90", c)} />
                        ))}
                        <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse rounded-full bg-powder" />
                      </div>
                      <span className="chip absolute left-3 top-3 bg-brand-950/60 text-white backdrop-blur">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
                        Live · {MODE_LABEL[scanMode]}
                      </span>
                      <div className="absolute inset-x-3 bottom-3 flex justify-between gap-2">
                        {cameras.length > 1 ? (
                          <button type="button" onClick={switchCamera} className="btn btn-sm bg-brand-950/60 text-white backdrop-blur hover:bg-brand-950/80">
                            <SwitchCamera className="h-3.5 w-3.5" /> Switch
                          </button>
                        ) : (
                          <span />
                        )}
                        <button type="button" onClick={() => setScannerActive(false)} className="btn btn-sm bg-brand-950/60 text-white backdrop-blur hover:bg-brand-950/80">
                          <CameraOff className="h-3.5 w-3.5" /> Stop camera
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/70">
                      <div className="grid h-16 w-16 place-items-center rounded-full border border-white/20 bg-white/5">
                        <ScanLine className="h-7 w-7" />
                      </div>
                      <p className="text-sm">Camera is off</p>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          setScanMessage(null);
                          autoPickedRef.current = false;
                          setScannerActive(true);
                        }}
                      >
                        <Camera className="h-4 w-4" /> Start {MODE_LABEL[scanMode]} scanner
                      </button>
                    </div>
                  )}
                </div>

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
                        className={cn(
                          "flex animate-fade-up items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm font-medium",
                          scanMessage.ok ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger",
                        )}
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
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/10 text-sm font-bold text-brand-600">
                          {lastScanned.name.charAt(0).toUpperCase()}
                        </div>
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
        {editForm && (
          <form id="attendance-edit" onSubmit={saveEdit} className="space-y-5">
            <div>
              <p className="label">Status</p>
              <Segmented
                label="Status"
                value={editForm.status}
                onChange={(status) => setEditForm({ ...editForm, status })}
                options={STATUSES.map((s) => ({ value: s, label: STATUS[s].label, icon: STATUS[s].icon }))}
                disabled={savingEdit}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["timeIn", "timeOut"] as const).map((field) => (
                <TimeFields
                  key={field}
                  label={MODE_LABEL[field]}
                  value={editForm[field]}
                  onChange={(value) => setEditForm({ ...editForm, [field]: value })}
                  disabled={savingEdit}
                />
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

function WholeDayPanel({
  event,
  windows,
  activeSession,
  records,
}: {
  event: Event;
  windows: EventSessionWindow[];
  activeSession: EventSession | null;
  records: AttendanceRecord[];
}) {
  return (
    <div className="space-y-4 border-t border-line pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="icon-tile">
            <CloudSun className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink">Whole Day attendance</p>
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <CalendarDays className="h-4 w-4" />
              {event.date ? formatDate(event.date) : "Event date not set"}
              <span aria-hidden>·</span>
              {windows.length
                ? `${windows.length} scheduled session${windows.length > 1 ? "s" : ""} handled automatically`
                : "No sessions configured for this event"}
            </p>
          </div>
        </div>
        <p className="max-w-xs text-xs text-muted sm:text-right">Time In / Time Out are matched to the right scheduled session automatically — no session tabs to switch.</p>
      </div>

      {windows.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {windows.map((w) => {
            const Icon = SESSION_ICON[w.session];
            const active = w.session === activeSession;
            const summary = windowSummary(w);
            const tally = (status: Status) => records.filter((r) => r.session === w.session && r.status === status).length;
            return (
              <div key={w.session} className={cn("rounded-2xl border p-4 transition-colors", active ? "border-brand-500/40 bg-brand-500/[.06]" : "border-line bg-surface-2")}>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Icon className="h-4 w-4 text-brand-500" />
                    {w.label} session
                  </p>
                  {active && (
                    <span className="chip chip-brand">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
                      Now
                    </span>
                  )}
                </div>
                <span className={cn("chip mt-2", summary.chip)}>
                  <Clock className="h-3.5 w-3.5" />
                  {summary.text}
                </span>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <span key={s} className={cn("chip", STATUS[s].chip)}>
                      {STATUS[s].label} {tally(s)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm font-medium text-warning">
          <CircleAlert className="h-4 w-4 shrink-0" />
          Add a Morning, Afternoon, or Evening schedule in the Event section so the Whole Day view can detect it.
        </p>
      )}

      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span className="chip chip-success">Present</span> QR pass scanned for this event
        <span className="chip chip-brand">Excused</span> set by an officer
        <span className="chip chip-danger">Absent</span> no scan recorded — auto-marked at 12:00 AM after the event day
        <span className={cn("chip", event.autoMarkAbsent ? "chip-success" : "chip-neutral")}>Auto Mark Absent {event.autoMarkAbsent ? "on" : "off"}</span>
      </p>
    </div>
  );
}

function TimeFields({ label, value, onChange, disabled }: { label: string; value: TimeParts; onChange: (value: TimeParts) => void; disabled?: boolean }) {
  const digits = (key: "hour" | "minute") => (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value.replace(/\D/g, "") });
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center gap-1.5" role="group" aria-label={label}>
        <input
          className="input w-14 px-1 text-center"
          inputMode="numeric"
          maxLength={2}
          placeholder="hh"
          title="Hour (1-12)"
          aria-label={`${label} hour`}
          value={value.hour}
          onChange={digits("hour")}
          disabled={disabled}
        />
        <span className="font-semibold text-muted">:</span>
        <input
          className="input w-14 px-1 text-center"
          inputMode="numeric"
          maxLength={2}
          placeholder="mm"
          title="Minutes (00-59)"
          aria-label={`${label} minutes`}
          value={value.minute}
          onChange={digits("minute")}
          disabled={disabled}
        />
        <select
          className="input min-w-0 flex-1 px-2"
          title="AM or PM"
          aria-label={`${label} AM or PM`}
          value={value.period}
          onChange={(e) => onChange({ ...value, period: e.target.value as TimeParts["period"] })}
          disabled={disabled}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}

interface AttendanceTableProps {
  students: Student[];
  recordByStudent: Map<string, AttendanceRecord>;
  lastScanId?: string;
  toolbar: ReactNode;
  emptyText: string;
  onEdit: (student: Student, record?: AttendanceRecord) => void;
  onRecordNow: (student: Student, mode: ScanMode) => void;
  onClear: (student: Student, record: AttendanceRecord) => void;
}

function AttendanceTable({ students, recordByStudent, lastScanId, toolbar, emptyText, onEdit, onRecordNow, onClear }: AttendanceTableProps) {
  const { pageItems, pagination } = usePagination(students, PAGE_SIZE);

  return (
    <section className="card overflow-hidden">
      {toolbar}
      {students.length === 0 ? (
        <EmptyState icon={Users} title="No students found" description={emptyText} />
      ) : (
        <div data-lenis-prevent className="table-scroll">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th>Student</th>
                <th>Program</th>
                <th>Status</th>
                <th>Session</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((student) => {
                const record = recordByStudent.get(student.id);
                const scanned = student.id === lastScanId;
                const SessionIcon = record && SESSION_ICON[record.session];
                return (
                  <tr key={student.id} className={cn(scanned && "bg-success/[.06]")}>
                    <td>
                      <div className="flex items-center gap-2 font-semibold">
                        {scanned && <span className="h-2 w-2 shrink-0 rounded-full bg-success" title="Last scanned" />}
                        {student.name}
                      </div>
                      <div className="text-xs text-muted">{student.studentId}</div>
                    </td>
                    <td>
                      <div>{student.program}</div>
                      <div className="text-xs text-muted">Section {student.section}</div>
                    </td>
                    <td>
                      <StatusChip status={record?.status} />
                    </td>
                    <td className="text-sm">
                      {record ? (
                        <span className="inline-flex items-center gap-1.5">
                          {SessionIcon && <SessionIcon className="h-3.5 w-3.5 text-muted" />}
                          {EVENT_SESSION_LABELS[record.session] ?? "—"}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="tabular-nums">{formatTime12(record?.timeIn)}</td>
                    <td className="tabular-nums">{formatTime12(record?.timeOut)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(student, record)} title="Edit attendance record">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <Menu>
                          <RowActionsTrigger label={`More actions for ${student.name}`} />
                          <MenuContent>
                            <MenuItem onSelect={() => onRecordNow(student, "timeIn")}>
                              <LogIn /> Time In now
                            </MenuItem>
                            <MenuItem onSelect={() => onRecordNow(student, "timeOut")}>
                              <LogOut /> Time Out now
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem danger disabled={!record} onSelect={() => record && onClear(student, record)}>
                              <Trash2 /> Clear record
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination {...pagination} />
    </section>
  );
}
