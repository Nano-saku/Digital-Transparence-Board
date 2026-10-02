import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Calendar,
  Users,
  CheckCircle,
  XCircle,
  Search,
  Layers,
  Clock,
  LogIn,
  LogOut,
  QrCode,
  ScanLine,
  Camera,
  CameraOff,
  SwitchCamera,
  Trash2,
  Edit2,
  Save,
} from "lucide-react";
import jsQR from "jsqr";
import {
  eventsService,
  studentsService,
  attendanceService,
  subscribeToTables,
} from "@/services/db";
import type {
  Event,
  EventSession,
  Student,
  AttendanceRecord,
  UserRole,
} from "@/types";
import { parseStudentQrText } from "@/lib/qr";
import { toast } from "sonner";
import {
  formatDate,
  formatTime12,
  compareTime24,
  splitTime24,
  composeTime12,
} from "@/lib/format";
import { matchesSearchWords } from "@/lib/utils";
import {
  EVENT_SESSION_ICONS,
  EVENT_SESSION_LABELS,
  getEventSessionWindow,
  getEventSessionWindows,
  getScheduledEventSessions,
  hasEventAttendanceDayEnded,
  resolveEventSessionForTime,
} from "@/lib/attendance";
import { useSectionEntrance } from "@/hooks/useSectionEntrance";
import SectionLoader from "@/components/SectionLoader";
import SectionEmptyState from "@/components/SectionEmptyState";
import SectionBackButton from "@/components/SectionBackButton";
import AttendanceAnalysisChart from "@/features/events/AttendanceAnalysisChart";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import Pagination from "@/components/common/Pagination";
import Skeleton from "@/components/Skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AttendanceManagementSectionProps {
  onBack: () => void;
  role: UserRole;
  userId?: string;
}

/** Current wall-clock time as 24h "HH:MM". */
const nowClock = () => new Date().toTimeString().slice(0, 5);

export default function AttendanceManagementSection({
  onBack,
  role,
}: AttendanceManagementSectionProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const attendanceEvents = useMemo(
    () => events.filter((event) => !event.isNonConducting),
    [events],
  );
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [showAttendanceClearConfirm, setShowAttendanceClearConfirm] =
    useState(false);
  const [attendanceToClear, setAttendanceToClear] = useState<{
    id: string;
    studentName: string;
    /** Scheduled session the cleared record belongs to, e.g. "Morning". */
    sessionLabel: string;
  } | null>(null);

  // Edit attendance record (Status + Time In + Time Out) via explicit dialog.
  // Keep the selected row as well as the student so Save always updates the
  // exact database record that was opened, rather than looking it up again by
  // student/event/session.
  const [editingAttendance, setEditingAttendance] = useState<{
    student: Student;
    record: AttendanceRecord;
  } | null>(null);
  const emptyAttendanceEditForm = {
    status: "present" as "present" | "late" | "absent",
    timeInHour: "",
    timeInMinute: "",
    timeInPeriod: "AM" as "AM" | "PM",
    timeOutHour: "",
    timeOutMinute: "",
    timeOutPeriod: "AM" as "AM" | "PM",
  };
  const [attendanceEditForm, setAttendanceEditForm] = useState(
    emptyAttendanceEditForm,
  );
  const [savingAttendanceEdit, setSavingAttendanceEdit] = useState(false);

  // Role-based permissions
  const canRecordAttendance = role === "admin" || role === "secretary";

  // Attendance
  const [selectedEventForAttendance, setSelectedEventForAttendance] =
    useState("");
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState<
    "all" | "present" | "late" | "absent"
  >("all");
  const [attendancePage, setAttendancePage] = useState(1);

  const ATTENDANCE_PAGE_SIZE = 20;

  // Auto-filter state set by QR scan
  const [scannedCourse, setScannedCourse] = useState<string | null>(null);
  const [scannedSection, setScannedSection] = useState<string | null>(null);
  const [lastScannedStudentId, setLastScannedStudentId] = useState<
    string | null
  >(null);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);

  // QR Code Scanner
  const [scanMode, setScanMode] = useState<"timeIn" | "timeOut">("timeIn");
  const [scannerActive, setScannerActive] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastScanRef = useRef({ data: "", at: 0 });
  const autoMarkingAbsentRef = useRef(false);

  const selectedAttendanceEvent = events.find(
    (e) => e.id === selectedEventForAttendance,
  );

  // Whole Day view: every session configured in the Event section is handled
  // on this one screen, so the secretary never switches session tabs.
  const scheduledSessionWindows = useMemo(
    () =>
      selectedAttendanceEvent
        ? getEventSessionWindows(selectedAttendanceEvent)
        : [],
    [selectedAttendanceEvent],
  );

  // Ticking clock used to highlight the scheduled session running right now.
  const [nowHM, setNowHM] = useState(() => nowClock());
  useEffect(() => {
    const interval = setInterval(() => setNowHM(nowClock()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const activeSession = useMemo(
    () =>
      selectedAttendanceEvent
        ? resolveEventSessionForTime(selectedAttendanceEvent, nowHM)
        : null,
    [selectedAttendanceEvent, nowHM],
  );

  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoading(true);
      }

      const [eventsData, studentsData, attendanceData] = await Promise.all([
        eventsService.getAll(),
        studentsService.getAll(),
        attendanceService.getAll(),
      ]);

      setEvents(eventsData);
      setStudents(studentsData);
      setAttendanceRecords(attendanceData);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load data");
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return subscribeToTables(
      ["events", "students", "attendance"],
      () => loadData(false),
      "attendance-management",
    );
  }, [loadData]);

  useSectionEntrance(sectionRef, [
    {
      ref: contentRef,
      from: { y: "6vh", opacity: 0 },
      to: { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" },
    },
  ]);

  // Whole Day records: every scheduled session of the selected event at once.
  // The database keeps one attendance row per student + event + date
  // (attendance_student_event_date_key), which is exactly the Whole Day row.
  const selectedAttendanceRecords = useMemo(
    () =>
      selectedEventForAttendance
        ? attendanceRecords.filter(
            (r) => r.eventId === selectedEventForAttendance,
          )
        : [],
    [attendanceRecords, selectedEventForAttendance],
  );

  const attendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    selectedAttendanceRecords.forEach((record) => {
      const existing = map.get(record.studentId);
      // Prefer a real result over an auto-created absent placeholder, then the
      // row that already carries a Time In.
      if (!existing) {
        map.set(record.studentId, record);
        return;
      }
      const score = (r: AttendanceRecord) =>
        (r.status === "absent" ? 0 : 2) + (r.timeIn ? 1 : 0);
      if (score(record) > score(existing)) map.set(record.studentId, record);
    });
    return map;
  }, [selectedAttendanceRecords]);

  const persistAttendance = useCallback(
    async (
      studentId: string,
      patch: Partial<Pick<AttendanceRecord, "status" | "timeIn" | "timeOut">>,
      recordToUpdate?: AttendanceRecord,
      /** Scheduled session auto-detected for this write. */
      sessionForWrite?: EventSession,
    ): Promise<AttendanceRecord | null> => {
      const event = selectedAttendanceEvent;
      const existing =
        recordToUpdate ??
        attendanceMap.get(studentId) ??
        null;

      if (!event && !existing) {
        toast.error("Select an event before recording attendance");
        return null;
      }

      // Whole Day view: the scheduled session is derived from the event's
      // configured schedules and the recorded time, never from a tab.
      const resolvedSession =
        sessionForWrite ??
        existing?.session ??
        (event
          ? (resolveEventSessionForTime(
              event,
              patch.timeIn || patch.timeOut || nowClock(),
            ) ?? "morning")
          : "morning");

      const payload = {
        studentId,
        eventId: existing?.eventId ?? event!.id,
        eventName: existing?.eventName ?? event!.name,
        date:
          existing?.date ??
          event!.date ??
          new Date().toISOString().slice(0, 10),
        session: resolvedSession,
        status: patch.status ?? existing?.status ?? "present",
        // Attendance time columns are TEXT NOT NULL. An empty string is the
        // persisted representation for a deliberately cleared time.
        timeIn: patch.timeIn !== undefined ? patch.timeIn : existing?.timeIn ?? "",
        timeOut:
          patch.timeOut !== undefined ? patch.timeOut : existing?.timeOut ?? "",
      };
      const saved = existing
        ? await attendanceService.update(existing.id, payload)
        : await attendanceService.create(payload);
      setAttendanceRecords((prev) => {
        const index = prev.findIndex((r) => r.id === saved.id);
        if (index >= 0) {
          const copy = [...prev];
          copy[index] = saved;
          return copy;
        }
        return [...prev, saved];
      });
      return saved;
    },
    [selectedAttendanceEvent, attendanceMap],
  );

  const confirmClearAttendance = async () => {
    if (!attendanceToClear) return;

    try {
      await attendanceService.delete(attendanceToClear.id);
      setAttendanceRecords((prev) =>
        prev.filter((record) => record.id !== attendanceToClear.id),
      );
      if (
        lastScannedStudentId &&
        attendanceMap.get(lastScannedStudentId)?.id === attendanceToClear.id
      ) {
        setLastScannedStudentId(null);
        setLastScanTime(null);
      }
      toast.success(
        `${attendanceToClear.studentName}'s ${attendanceToClear.sessionLabel} attendance has been cleared.`,
      );
      setShowAttendanceClearConfirm(false);
      setAttendanceToClear(null);
    } catch (error) {
      console.error("Error clearing attendance:", error);
      toast.error(
        `Failed to clear ${attendanceToClear.studentName}'s attendance.`,
      );
    }
  };

  const handleClearAttendance = (student: Student) => {
    const record = attendanceMap.get(student.id);
    if (!record) {
      toast.error("No attendance record exists for this student.");
      return;
    }
    setAttendanceToClear({
      id: record.id,
      studentName: student.name,
      sessionLabel: EVENT_SESSION_LABELS[record.session] ?? "Whole Day",
    });
    setShowAttendanceClearConfirm(true);
  };

  const openAttendanceEditModal = (student: Student) => {
    const record = attendanceMap.get(student.id);
    if (!record) {
      toast.error("No attendance record exists for this student.");
      return;
    }
    const timeIn = splitTime24(record?.timeIn);
    const timeOut = splitTime24(record?.timeOut);
    setAttendanceEditForm({
      status: record?.status ?? "present",
      timeInHour: timeIn.hour,
      timeInMinute: timeIn.minute,
      timeInPeriod: timeIn.period,
      timeOutHour: timeOut.hour,
      timeOutMinute: timeOut.minute,
      timeOutPeriod: timeOut.period,
    });
    setEditingAttendance({ student, record });
  };

  const closeAttendanceEditModal = () => {
    setEditingAttendance(null);
    setAttendanceEditForm(emptyAttendanceEditForm);
  };

  const handleSaveAttendanceEdit = async () => {
    if (!editingAttendance) return;

    const timeInProvided =
      attendanceEditForm.timeInHour.trim() ||
      attendanceEditForm.timeInMinute.trim();
    const timeOutProvided =
      attendanceEditForm.timeOutHour.trim() ||
      attendanceEditForm.timeOutMinute.trim();
    const parsedTimeIn = timeInProvided
      ? composeTime12(
          attendanceEditForm.timeInHour,
          attendanceEditForm.timeInMinute,
          attendanceEditForm.timeInPeriod,
        )
      : "";
    const parsedTimeOut = timeOutProvided
      ? composeTime12(
          attendanceEditForm.timeOutHour,
          attendanceEditForm.timeOutMinute,
          attendanceEditForm.timeOutPeriod,
        )
      : "";

    if (timeInProvided && parsedTimeIn === null) {
      toast.error("Time In hour must be 1-12 and minutes must be 00-59.");
      return;
    }
    if (timeOutProvided && parsedTimeOut === null) {
      toast.error("Time Out hour must be 1-12 and minutes must be 00-59.");
      return;
    }

    setSavingAttendanceEdit(true);
    try {
      const saved = await persistAttendance(editingAttendance.record.studentId, {
        status: attendanceEditForm.status,
        timeIn: parsedTimeIn ?? "",
        timeOut: parsedTimeOut ?? "",
      }, editingAttendance.record);
      if (!saved) {
        throw new Error("No attendance record was returned after the update.");
      }
      toast.success(`${editingAttendance.student.name}'s attendance updated.`);
      closeAttendanceEditModal();
    } catch (error) {
      console.error("Error saving attendance:", error);
      toast.error(`Failed to save attendance — ${errorMessage(error)}`);
    } finally {
      setSavingAttendanceEdit(false);
    }
  };

  const deriveScanStatus = (
    scanTimeHM: string,
    event?: Event,
    session?: EventSession | null,
  ): "present" | "late" => {
    if (!event || !session) return "present";
    const sessionIn = getEventSessionWindow(event, session).timeIn;
    return sessionIn && compareTime24(scanTimeHM, sessionIn) > 0
      ? "late"
      : "present";
  };

  const errorMessage = (error: unknown): string => {
    const details =
      typeof error === "object" && error !== null
        ? (error as {
            message?: unknown;
            details?: unknown;
            hint?: unknown;
            code?: unknown;
          })
        : null;
    if (details) {
      const code =
        typeof details.code === "string" ? details.code.trim() : "";
      if (code === "42501") {
        return "Your account is not authorized to write attendance. Run supabase/attendance_fix.sql, then sign in again.";
      }
      if (code === "PGRST116") {
        return "The attendance row was not returned after saving. Refresh the attendance list and try again.";
      }
      const parts = [details.message, details.details, details.hint]
        .filter(
          (part): part is string =>
            typeof part === "string" && part.trim().length > 0,
        )
        .map((part) => part.trim());
      if (code) parts.push(`code ${code}`);
      if (parts.length > 0) return parts.join(" — ");
      try {
        return JSON.stringify(error);
      } catch {
        return "Unknown database error";
      }
    }
    if (error instanceof Error) return error.message;
    return String(error);
  };

  const handleManualAttendance = async (
    student: Student,
    action: "timeIn" | "timeOut",
  ) => {
    const event = selectedAttendanceEvent;
    if (!event) {
      toast.error("Select an event before recording attendance");
      return;
    }
    const existing = attendanceMap.get(student.id) ?? null;

    if (action === "timeIn") {
      if (existing?.timeIn) {
        toast.info(`${student.name} already has Time In recorded`);
        return;
      }
      const scanTime = nowClock();
      // Whole Day: detect the scheduled session from the event configuration.
      const session = resolveEventSessionForTime(event, scanTime);
      const sessionLabel = session
        ? EVENT_SESSION_LABELS[session]
        : "Whole Day";
      try {
        await persistAttendance(
          student.id,
          {
            status: deriveScanStatus(scanTime, event, session),
            timeIn: scanTime,
          },
          existing ?? undefined,
          session ?? undefined,
        );
        toast.success(
          `${student.name} Time In recorded at ${formatTime12(scanTime)} for the ${sessionLabel} session`,
        );
      } catch (error) {
        console.error("Error recording Time In:", error);
        toast.error(`Failed to record Time In — ${errorMessage(error)}`);
      }
    } else {
      if (!existing?.timeIn) {
        toast.error(`${student.name} has no Time In yet for this event`);
        return;
      }
      if (existing.timeOut) {
        toast.info(`${student.name} already has Time Out recorded`);
        return;
      }
      const scanTime = nowClock();
      const sessionLabel =
        EVENT_SESSION_LABELS[existing.session] ?? "Whole Day";
      try {
        await persistAttendance(
          student.id,
          {
            status: existing.status,
            timeOut: scanTime,
          },
          existing,
          existing.session,
        );
        toast.success(
          `${student.name} Time Out recorded at ${formatTime12(scanTime)} for the ${sessionLabel} session`,
        );
      } catch (error) {
        console.error("Error recording Time Out:", error);
        toast.error(`Failed to record Time Out — ${errorMessage(error)}`);
      }
    }
  };

  const handleQrScan = (rawData: string) => {
    const now = Date.now();
    if (
      lastScanRef.current.data === rawData &&
      now - lastScanRef.current.at < 2500
    )
      return;
    lastScanRef.current = { data: rawData, at: now };

    const payload = parseStudentQrText(rawData);
    if (!payload) {
      setScanMessage({
        type: "error",
        text: "Unrecognized QR code — please scan a student attendance QR.",
      });
      return;
    }

    const student = students.find((s) => s.studentId === payload.studentId);
    if (!student) {
      setScanMessage({
        type: "error",
        text: `No student matches ID "${payload.studentId}" — use the manual search below.`,
      });
      return;
    }

    setScanMessage({
      type: "success",
      text: `Scanned ${student.name} (${student.studentId}) — recording ${scanMode === "timeIn" ? "Time In" : "Time Out"}…`,
    });
    setScannedCourse(student.program);
    setScannedSection(student.section);
    setLastScannedStudentId(student.id);
    setLastScanTime(nowClock());
    setAttendancePage(1);
    void handleManualAttendance(student, scanMode);
  };

  const qrScanHandlerRef = useRef<(data: string) => void>(() => undefined);
  qrScanHandlerRef.current = handleQrScan;

  useEffect(() => {
    if (!scannerActive) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId = 0;
    const video = videoRef.current;

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const canvas = canvasRef.current;
      if (
        !video ||
        !canvas ||
        video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA
      )
        return;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      const code = jsQR(image.data, image.width, image.height, {
        inversionAttempts: "dontInvert",
      });
      if (code?.data) qrScanHandlerRef.current(code.data);
    };

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera API unavailable");
        }

        const constraints: MediaStreamConstraints = selectedCameraId
          ? { video: { deviceId: { exact: selectedCameraId } } }
          : { video: { facingMode: { ideal: "environment" } } };
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (selectedCameraError) {
          if (!selectedCameraId) throw selectedCameraError;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: "environment" } },
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }
          if (!cancelled) setSelectedCameraId(null);
        }
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (video) {
          video.muted = true;
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            /* autoplay restrictions */
          }
        }
        lastScanRef.current = { data: "", at: 0 };

        if (navigator.mediaDevices.enumerateDevices) {
          const devices = (
            await navigator.mediaDevices.enumerateDevices()
          ).filter((device) => device.kind === "videoinput");
          if (!cancelled) {
            setCameraDevices(devices);
            if (!selectedCameraId && devices.length > 1) {
              const rearCamera = devices.find((device) =>
                /back|rear|environment|world|外向|后置/i.test(device.label),
              );
              const currentCameraId = stream
                .getVideoTracks()[0]
                ?.getSettings().deviceId;
              if (rearCamera && rearCamera.deviceId !== currentCameraId) {
                setSelectedCameraId(rearCamera.deviceId);
                return;
              }
              if (currentCameraId) setSelectedCameraId(currentCameraId);
            }
          }
        }
        tick();
      } catch (error) {
        console.error("Error starting QR scanner camera:", error);
        if (!cancelled) {
          setScanMessage({
            type: "error",
            text: "Unable to access the camera. Grant camera permission or use the manual search below.",
          });
          setScannerActive(false);
        }
      }
    };
    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [scannerActive, selectedCameraId]);

  const autoMarkAbsent = useCallback(async () => {
    if (!canRecordAttendance) return;
    if (autoMarkingAbsentRef.current) return;
    autoMarkingAbsentRef.current = true;
    const now = new Date();
    const completedEvents = events.filter(
      (event) =>
        !event.isNonConducting && hasEventAttendanceDayEnded(event.date, now),
    );
    if (completedEvents.length === 0) {
      autoMarkingAbsentRef.current = false;
      return;
    }

    try {
      for (const event of completedEvents) {
        const sessions = getScheduledEventSessions(event);
        if (!event.date || sessions.length === 0) continue;

        // The database uniqueness rule is student + event + event date, not
        // student + event + session. Read all sessions together so a Present,
        // Late, or Absent row in any session prevents another insert.
        const existing = await attendanceService.getByEventIdAndDate(
          event.id,
          event.date,
        );
        const recordsByStudent = new Map(
          existing.map((record) => [record.studentId, record]),
        );

        for (const student of students) {
          if (recordsByStudent.has(student.id)) continue;

          const record = await attendanceService.createAbsentIfMissing({
            studentId: student.id,
            eventId: event.id,
            eventName: event.name,
            date: event.date,
            // A single row is required by attendance_student_event_date_key.
            // Use the first configured session for newly-created absent rows.
            session: sessions[0],
            status: "absent",
          });
          recordsByStudent.set(student.id, record);
        }

        const resolved = [...recordsByStudent.values()];
        setAttendanceRecords((prev) => {
          const byId = new Map(prev.map((record) => [record.id, record]));
          resolved.forEach((record) => byId.set(record.id, record));
          return [...byId.values()];
        });
      }
    } catch (error) {
      console.error("Auto-marking absent students failed:", error);
      toast.error(
        `Failed to auto-mark absent students — ${errorMessage(error)}`,
      );
    } finally {
      autoMarkingAbsentRef.current = false;
    }
  }, [canRecordAttendance, events, students]);

  useEffect(() => {
    autoMarkAbsent();
    const interval = setInterval(autoMarkAbsent, 60_000);
    return () => clearInterval(interval);
  }, [autoMarkAbsent]);

  const attendanceSearchTerm = attendanceSearch.trim().toLowerCase();
  const filteredStudents = useMemo(() => {
    let result = students;

    if (scannedCourse && scannedSection) {
      result = result.filter(
        (s) => s.program === scannedCourse && s.section === scannedSection,
      );
    }

    if (attendanceSearchTerm) {
      result = result.filter((s) =>
        matchesSearchWords(`${s.name} ${s.studentId}`, attendanceSearchTerm),
      );
    }

    if (attendanceStatusFilter !== "all") {
      result = result.filter((s) => {
        const status = attendanceMap.get(s.id)?.status;
        return status === attendanceStatusFilter;
      });
    }

    if (lastScannedStudentId) {
      const scanned = result.find((s) => s.id === lastScannedStudentId);
      if (scanned) {
        result = [
          scanned,
          ...result.filter((s) => s.id !== lastScannedStudentId),
        ];
      }
    }

    return result;
  }, [
    students,
    attendanceSearchTerm,
    attendanceStatusFilter,
    attendanceMap,
    scannedCourse,
    scannedSection,
    lastScannedStudentId,
  ]);

  useEffect(() => {
    setAttendancePage(1);
  }, [
    selectedEventForAttendance,
    attendanceSearchTerm,
    attendanceStatusFilter,
    scannedCourse,
    scannedSection,
    lastScannedStudentId,
  ]);

  const attendanceTotalPages = Math.max(
    1,
    Math.ceil(filteredStudents.length / ATTENDANCE_PAGE_SIZE),
  );
  const currentAttendancePage = Math.min(attendancePage, attendanceTotalPages);
  const attendancePageStartIndex =
    (currentAttendancePage - 1) * ATTENDANCE_PAGE_SIZE;
  const paginatedStudents = filteredStudents.slice(
    attendancePageStartIndex,
    attendancePageStartIndex + ATTENDANCE_PAGE_SIZE,
  );

  useEffect(() => {
    if (attendancePage > attendanceTotalPages) {
      setAttendancePage(attendanceTotalPages);
    }
  }, [attendancePage, attendanceTotalPages]);

  const lastScannedStudent = lastScannedStudentId
    ? (students.find((s) => s.id === lastScannedStudentId) ?? null)
    : null;

  const attendanceAnalysisData = useMemo(() => {
    const registeredStudentIds = new Set(students.map((student) => student.id));
    const totalPopulation = registeredStudentIds.size;

    return [...events]
      .filter((event) => !event.isNonConducting)
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
      .map((event) => {
        const attendeeIds = new Set(
          attendanceRecords
            .filter(
              (record) =>
                record.eventId === event.id &&
                registeredStudentIds.has(record.studentId) &&
                (record.status === "present" || record.status === "late"),
            )
            .map((record) => record.studentId),
        );
        const actualPopulationAttended = attendeeIds.size;

        return {
          eventId: event.id,
          eventName: event.name,
          eventLabel: event.date
            ? `${event.name} — ${formatDate(event.date)}`
            : event.name,
          totalPopulation,
          actualPopulationAttended,
          attendanceGap: Math.max(
            0,
            totalPopulation - actualPopulationAttended,
          ),
        };
      });
  }, [attendanceRecords, events, students]);

  if (!canRecordAttendance) {
    return (
      <section
        ref={sectionRef}
        className="min-h-screen w-full gradient-bg-orange relative overflow-hidden py-20 lg:py-24"
      >
        <div
          ref={contentRef}
          className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12"
        >
          <div className="flex items-center gap-4 mb-6">
            <SectionBackButton onClick={onBack} />
            <div>
              <h1 className="font-display font-bold text-2xl lg:text-3xl text-dark">
                Access Denied
              </h1>
              <p className="text-text-secondary text-sm">
                You don't have permission to access attendance management
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-orange relative overflow-hidden py-20 lg:py-24"
    >
      <div
        ref={contentRef}
        className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12"
      >
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <SectionBackButton onClick={onBack} />
            <div>
              <h1 className="font-display font-bold text-2xl lg:text-3xl text-dark">
                Attendance Management
              </h1>
              <p className="text-text-secondary text-sm">
                Track and manage student attendance
              </p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && <SectionLoader message="Loading data..." />}

        {/* Attendance Content */}
        {!loading && (
          <div className="glass-card p-5 lg:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-red" />
                </div>
                <h3 className="font-display font-semibold text-lg text-dark">
                  Attendance Tracking
                </h3>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-dark mb-1.5">
                Select Event
              </label>
              <select
                value={selectedEventForAttendance}
                onChange={(e) => setSelectedEventForAttendance(e.target.value)}
                className="glass-input w-full px-4 py-3 text-sm"
              >
                <option value="">Choose an event</option>
                {attendanceEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Whole Day attendance view - every scheduled session at once */}
            {selectedAttendanceEvent && (
              <div className="mb-5 overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-blue-50/60 shadow-sm">
                <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
                  {/* Whole Day header */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-2xl shadow-inner">
                        🗓️
                      </div>
                      <div className="min-w-0">
                        <p className="font-display text-lg font-semibold text-blue-700">
                          Whole Day Attendance
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-text-secondary">
                          <Calendar className="h-4 w-4 text-slate-500" />
                          {selectedAttendanceEvent.date
                            ? formatDate(selectedAttendanceEvent.date)
                            : "Event date not set"}
                          <span aria-hidden="true">·</span>
                          {scheduledSessionWindows.length > 0
                            ? `${scheduledSessionWindows.length} scheduled session${
                                scheduledSessionWindows.length > 1 ? "s" : ""
                              } handled automatically`
                            : "No sessions configured for this event"}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-left text-sm text-text-secondary sm:text-right">
                      <p className="font-medium text-dark">
                        {selectedAttendanceEvent.name}
                      </p>
                      <p className="text-xs">
                        Time In / Time Out are matched to the right scheduled
                        session automatically — no session tabs to switch.
                      </p>
                    </div>
                  </div>

                  {/* Scheduled sessions detected from the Event section */}
                  {scheduledSessionWindows.length > 0 ? (
                    <div className="grid gap-3 border-t border-blue-100 pt-3 sm:grid-cols-2 lg:grid-cols-3">
                      {scheduledSessionWindows.map((window) => {
                        const isActive = window.session === activeSession;
                        const sessionRecords = selectedAttendanceRecords.filter(
                          (record) => record.session === window.session,
                        );
                        const presentCount = sessionRecords.filter(
                          (record) => record.status === "present",
                        ).length;
                        const lateCount = sessionRecords.filter(
                          (record) => record.status === "late",
                        ).length;
                        const absentCount = sessionRecords.filter(
                          (record) => record.status === "absent",
                        ).length;

                        return (
                          <div
                            key={window.session}
                            className={`rounded-xl border p-3 transition-colors ${
                              isActive
                                ? "border-red/40 bg-red/5"
                                : "border-white/60 bg-white/70"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="flex items-center gap-1.5 text-sm font-semibold text-dark">
                                <span aria-hidden="true">{window.icon}</span>
                                {window.label} Session
                              </p>
                              {isActive && (
                                <span className="rounded-full bg-red px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                  Now
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-text-secondary">
                              {window.timeIn && window.timeOut ? (
                                <span className="font-medium text-green-600">
                                  {formatTime12(window.timeIn)} -{" "}
                                  {formatTime12(window.timeOut)}
                                </span>
                              ) : window.timeIn ? (
                                <span className="font-medium text-blue-600">
                                  {formatTime12(window.timeIn)} - Time Out not
                                  set
                                </span>
                              ) : window.timeOut ? (
                                <span className="font-medium text-blue-600">
                                  Time In not set -{" "}
                                  {formatTime12(window.timeOut)}
                                </span>
                              ) : (
                                <span className="font-medium text-amber-600">
                                  Schedule times not configured
                                </span>
                              )}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-600">
                                Present {presentCount}
                              </span>
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                                Late {lateCount}
                              </span>
                              <span className="rounded-full bg-red/10 px-2 py-0.5 text-red-500">
                                Absent {absentCount}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="border-t border-blue-100 pt-3 text-sm font-medium text-amber-600">
                      Add a Morning, Afternoon, or Evening schedule in the Event
                      section so the Whole Day view can detect it.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Scheduled windows + auto-status rules */}
            {selectedAttendanceEvent && (
              <div className="mb-4 rounded-xl border border-white/50 bg-white/30 p-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-dark">
                    <Clock className="w-4 h-4 text-red" />
                    Attendance rules
                  </span>
                  <span className="text-xs text-text-secondary">
                    Present = recorded on/before the detected session's
                    scheduled Time In | Late = recorded after that scheduled
                    Time In | Absent = never recorded (auto-marked at 12:00 AM)
                  </span>
                </div>
              </div>
            )}

            {/* QR Code Scanner */}
            {selectedAttendanceEvent && (
              <div className="mb-6 border border-white/50 rounded-xl p-4 lg:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-red/10 flex items-center justify-center">
                      <QrCode className="w-4 h-4 text-red" />
                    </div>
                    <div>
                      <h4 className="font-display font-semibold text-dark">
                        QR Code Scanner
                      </h4>
                      <p className="text-xs text-text-secondary">
                        Pick a mode, then hold a student's QR code in front of
                        the camera — the scan time is recorded automatically.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setScanMode("timeIn")}
                      className={`px-3 py-1.5 text-xs rounded-lg ${
                        scanMode === "timeIn"
                          ? "bg-green-600 text-white"
                          : "bg-green-100 text-green-700 hover:bg-green-200"
                      }`}
                      title="Scanned students will be recorded as Time In"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      Scan Time In
                    </button>
                    <button
                      type="button"
                      onClick={() => setScanMode("timeOut")}
                      className={`px-3 py-1.5 text-xs rounded-lg ${
                        scanMode === "timeOut"
                          ? "bg-blue-600 text-white"
                          : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                      }`}
                      title="Scanned students will be recorded as Time Out"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Scan Time Out
                    </button>
                  </div>
                </div>

                {/* Camera preview */}
                <div className="relative h-64 max-w-md mx-auto rounded-xl overflow-hidden bg-black/80">
                  <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: "scaleX(1)" }}
                    muted
                    playsInline
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  {!scannerActive ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
                      <ScanLine className="w-10 h-10 opacity-60" />
                      <p className="text-xs">Camera is off</p>
                      <button
                        type="button"
                        onClick={() => {
                          setScanMessage(null);
                          setScannerActive(true);
                        }}
                        className="px-4 py-2 text-sm"
                      >
                        <Camera className="w-4 h-4" />
                        Start {scanMode === "timeIn"
                          ? "Time In"
                          : "Time Out"}{" "}
                        Scanner
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-red/70 animate-pulse pointer-events-none"
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        onClick={() => setScannerActive(false)}
                        className="absolute bottom-3 right-3 px-3 py-1.5 text-xs rounded-lg bg-black/60 text-white hover:bg-black/80"
                      >
                        <CameraOff className="w-3.5 h-3.5" />
                        Stop Camera
                      </button>
                      {cameraDevices.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentIndex = cameraDevices.findIndex(
                              (device) => device.deviceId === selectedCameraId,
                            );
                            const nextCamera =
                              cameraDevices[
                                (currentIndex + 1) % cameraDevices.length
                              ];
                            if (nextCamera)
                              setSelectedCameraId(nextCamera.deviceId);
                          }}
                          className="absolute bottom-3 left-3 px-3 py-1.5 text-xs rounded-lg bg-black/60 text-white hover:bg-black/80"
                          title="Switch camera"
                        >
                          <SwitchCamera className="w-3.5 h-3.5" />
                          Switch Camera
                        </button>
                      )}
                    </>
                  )}
                </div>

                {scanMessage && (
                  <div
                    className={`mt-3 max-w-md mx-auto text-sm rounded-lg px-3 py-2 ${
                      scanMessage.type === "error"
                        ? "bg-red/10 text-red-500"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {scanMessage.text}
                  </div>
                )}

                <p className="mt-2 text-xs text-text-secondary text-center">
                  Can't scan a student's QR code? Use the manual search below to
                  record their attendance.
                </p>
              </div>
            )}

            {selectedEventForAttendance && (
              <>
                {/* Search and status controls */}
                <div className="mb-4 flex flex-col items-stretch gap-4 rounded-2xl border border-blue-50 bg-white/80 p-4 shadow-sm sm:flex-row sm:items-center sm:gap-6 sm:p-5">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary" />
                    <input
                      type="text"
                      value={attendanceSearch}
                      onChange={(e) => setAttendanceSearch(e.target.value)}
                      placeholder="Search by full name or student ID..."
                      className="glass-input w-full rounded-xl py-3.5 pl-12 pr-16 text-sm sm:text-base"
                    />
                    {attendanceSearch && (
                      <button
                        type="button"
                        onClick={() => setAttendanceSearch("")}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-text-secondary hover:text-dark"
                        title="Clear search"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <label
                      htmlFor="attendance-status-filter"
                      className="text-sm font-medium text-dark whitespace-nowrap"
                    >
                      Show students:
                    </label>
                    <select
                      id="attendance-status-filter"
                      value={attendanceStatusFilter}
                      onChange={(e) =>
                        setAttendanceStatusFilter(
                          e.target.value as
                            | "all"
                            | "present"
                            | "late"
                            | "absent",
                        )
                      }
                      className="glass-input min-w-[180px] rounded-xl px-4 py-3 text-sm sm:text-base"
                    >
                      <option value="all">All Students</option>
                      <option value="present">Present</option>
                      <option value="late">Late</option>
                      <option value="absent">Absent</option>
                    </select>
                  </div>
                </div>

                {scannedCourse && scannedSection && (
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setScannedCourse(null);
                        setScannedSection(null);
                        setLastScannedStudentId(null);
                        setLastScanTime(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium hover:bg-blue-200 transition-colors"
                      title="Clear auto-filters set by QR scan"
                    >
                      <span>
                        Filtered: {scannedCourse} — Section {scannedSection}
                      </span>
                      <XCircle className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Last Scanned Student Banner */}
                {lastScannedStudent && lastScannedStudentId && (
                  <div className="mb-4 border border-green-200 bg-green-50/60 rounded-xl p-4 lg:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-1">
                          ✓ Last Scanned — Marked Present
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="font-semibold text-dark">
                            {lastScannedStudent.name}
                          </span>
                          <span className="text-sm text-text-secondary">
                            Course:{" "}
                            <span className="font-medium text-dark">
                              {lastScannedStudent.program}
                            </span>
                          </span>
                          <span className="text-sm text-text-secondary">
                            Section:{" "}
                            <span className="font-medium text-dark">
                              {lastScannedStudent.section}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1 text-sm">
                            <span className="text-text-secondary">Status:</span>
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                attendanceMap.get(lastScannedStudentId!)
                                  ?.status === "late"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-green-100 text-green-600"
                              }`}
                            >
                              {attendanceMap.get(lastScannedStudentId!)
                                ?.status === "late"
                                ? "Late"
                                : "Present"}
                            </span>
                          </span>
                          <span className="text-sm text-text-secondary">
                            Event:{" "}
                            <span className="font-medium text-dark">
                              {selectedAttendanceEvent?.name ?? "—"}
                            </span>
                          </span>
                          <span className="text-sm text-text-secondary">
                            Scan Time:{" "}
                            <span className="font-medium text-dark">
                              {lastScanTime ? formatTime12(lastScanTime) : "—"}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-xl overflow-hidden border border-gray-200">
                  <div className="overflow-x-auto">
                    <table className="glass-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Student ID</th>
                          <th>Course</th>
                          <th>Section</th>
                          <th className="text-center">Status</th>
                          <th>Event</th>
                          <th>Session</th>
                          <th>Time In</th>
                          <th>Time Out</th>
                          <th className="text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedStudents.map((student) => {
                          const record = attendanceMap.get(student.id);
                          const isLastScanned =
                            student.id === lastScannedStudentId;
                          return (
                            <tr
                              key={student.id}
                              className={
                                isLastScanned
                                  ? "bg-green-50/70 border-l-2 border-l-green-500"
                                  : ""
                              }
                            >
                              <td className="font-medium text-dark">
                                <div className="flex items-center gap-2">
                                  {isLastScanned && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                  )}
                                  {student.name}
                                </div>
                              </td>
                              <td className="text-text-secondary">
                                {student.studentId}
                              </td>
                              <td className="text-text-secondary">
                                {student.program}
                              </td>
                              <td className="text-text-secondary">
                                {student.section}
                              </td>
                              <td className="text-center">
                                {record ? (
                                  <span
                                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                      record.status === "late"
                                        ? "bg-amber-100 text-amber-700"
                                        : record.status === "present"
                                          ? "bg-green-100 text-green-600"
                                          : "bg-red/10 text-red-500"
                                    }`}
                                  >
                                    {record.status === "late"
                                      ? "Late"
                                      : record.status === "present"
                                        ? "Present"
                                        : "Absent"}
                                  </span>
                                ) : (
                                  <span className="text-text-secondary text-xs">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="text-text-secondary text-sm">
                                {selectedAttendanceEvent?.name ?? "—"}
                              </td>
                              <td className="text-text-secondary text-sm">
                                {record
                                  ? `${EVENT_SESSION_ICONS[record.session] ?? ""} ${
                                      EVENT_SESSION_LABELS[record.session] ??
                                      "—"
                                    }`.trim()
                                  : "—"}
                              </td>
                              <td className="text-text-secondary text-sm">
                                {formatTime12(record?.timeIn)}
                              </td>
                              <td className="text-text-secondary text-sm">
                                {formatTime12(record?.timeOut)}
                              </td>
                              <td className="text-center">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openAttendanceEditModal(student)}
                                    disabled={!canRecordAttendance}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                      canRecordAttendance
                                        ? "text-primary hover:bg-primary/10"
                                        : "text-text-secondary/40 cursor-not-allowed"
                                    }`}
                                    title="Edit attendance record"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleClearAttendance(student)}
                                    disabled={!record}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                      record
                                        ? "text-red-500 hover:bg-red/10 hover:text-red-600"
                                        : "text-text-secondary/40 cursor-not-allowed"
                                    }`}
                                    title={
                                      record
                                        ? "Clear attendance record"
                                        : "No attendance record to clear"
                                    }
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Clear
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredStudents.length === 0 && (
                          <tr>
                            <td
                              colSpan={10}
                              className="text-center text-text-secondary py-6"
                            >
                              {scannedCourse && scannedSection
                                ? `No students found in ${scannedCourse} \u2014 Section ${scannedSection}${attendanceSearch ? ` matching "${attendanceSearch}"` : ""}`
                                : `No students match "${attendanceSearch}"`}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <Pagination
                  page={currentAttendancePage}
                  totalPages={attendanceTotalPages}
                  totalItems={filteredStudents.length}
                  startIndex={attendancePageStartIndex}
                  endIndex={attendancePageStartIndex + paginatedStudents.length}
                  onPrev={() =>
                    setAttendancePage((page) => Math.max(1, page - 1))
                  }
                  onNext={() =>
                    setAttendancePage((page) =>
                      Math.min(attendanceTotalPages, page + 1),
                    )
                  }
                  onJump={setAttendancePage}
                />
              </>
            )}

            {!selectedEventForAttendance && (
              <SectionEmptyState
                message="Select an event to track attendance"
                icon={Calendar}
              />
            )}

            {/* Event Attendance Analysis */}
            <div className="mt-6 border-t border-white/50 pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-red" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-lg text-dark">
                    Event Attendance Analysis
                  </h3>
                  <p className="text-xs text-text-secondary">
                    K-Means attendance comparison using live registered-student
                    and attendance records for every event.
                  </p>
                </div>
              </div>

              <AttendanceAnalysisChart data={attendanceAnalysisData} />
            </div>
          </div>
        )}
      </div>

      {/* Edit Attendance Modal */}
      <Dialog
        open={editingAttendance != null}
        onOpenChange={(open) => {
          if (!open) closeAttendanceEditModal();
        }}
      >
        <DialogContent className="glass-card-strong max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              Edit Attendance
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <p className="text-sm text-text-secondary">
              <span className="font-semibold text-dark">
                {editingAttendance?.student.name}
              </span>{" "}
              — {editingAttendance?.record.eventName ?? "—"}
            </p>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Status
              </label>
              <select
                value={attendanceEditForm.status}
                onChange={(e) =>
                  setAttendanceEditForm({
                    ...attendanceEditForm,
                    status: e.target.value as "present" | "late" | "absent",
                  })
                }
                className="glass-input w-full px-4 py-2"
                disabled={savingAttendanceEdit}
              >
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  Time In
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={attendanceEditForm.timeInHour}
                    onChange={(e) =>
                      setAttendanceEditForm({
                        ...attendanceEditForm,
                        timeInHour: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    className="glass-input w-12 px-1 py-2 text-center"
                    placeholder="3"
                    title="Hour (1-12)"
                    disabled={savingAttendanceEdit}
                  />
                  <span className="text-text-secondary font-medium">:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={attendanceEditForm.timeInMinute}
                    onChange={(e) =>
                      setAttendanceEditForm({
                        ...attendanceEditForm,
                        timeInMinute: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    className="glass-input w-12 px-1 py-2 text-center"
                    placeholder="37"
                    title="Minutes (00-59)"
                    disabled={savingAttendanceEdit}
                  />
                  <select
                    value={attendanceEditForm.timeInPeriod}
                    onChange={(e) =>
                      setAttendanceEditForm({
                        ...attendanceEditForm,
                        timeInPeriod: e.target.value as "AM" | "PM",
                      })
                    }
                    className="glass-input flex-1 px-1 py-2"
                    title="AM or PM"
                    disabled={savingAttendanceEdit}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  Time Out
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={attendanceEditForm.timeOutHour}
                    onChange={(e) =>
                      setAttendanceEditForm({
                        ...attendanceEditForm,
                        timeOutHour: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    className="glass-input w-12 px-1 py-2 text-center"
                    placeholder="9"
                    title="Hour (1-12)"
                    disabled={savingAttendanceEdit}
                  />
                  <span className="text-text-secondary font-medium">:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={attendanceEditForm.timeOutMinute}
                    onChange={(e) =>
                      setAttendanceEditForm({
                        ...attendanceEditForm,
                        timeOutMinute: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    className="glass-input w-12 px-1 py-2 text-center"
                    placeholder="46"
                    title="Minutes (00-59)"
                    disabled={savingAttendanceEdit}
                  />
                  <select
                    value={attendanceEditForm.timeOutPeriod}
                    onChange={(e) =>
                      setAttendanceEditForm({
                        ...attendanceEditForm,
                        timeOutPeriod: e.target.value as "AM" | "PM",
                      })
                    }
                    className="glass-input flex-1 px-1 py-2"
                    title="AM or PM"
                    disabled={savingAttendanceEdit}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>
            </div>
            <p className="text-xs text-text-secondary">
              Type Hour (1-12) and Minutes (00-59), then choose AM or PM.
              Leave both blank to clear.
            </p>

            <div className="flex gap-3 pt-4">
              <button
                onClick={closeAttendanceEditModal}
                className="flex-1 glass-button px-4 py-2.5"
                disabled={savingAttendanceEdit}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAttendanceEdit}
                className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2"
                disabled={savingAttendanceEdit}
              >
                {savingAttendanceEdit ? (
                  <>
                    <Skeleton className="h-4 w-4 rounded-full" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showAttendanceClearConfirm && attendanceToClear != null}
        onClose={() => {
          setShowAttendanceClearConfirm(false);
          setAttendanceToClear(null);
        }}
        onConfirm={confirmClearAttendance}
        title="Clear Attendance?"
        confirmLabel="Clear Attendance"
        warningText="This will permanently remove the attendance record. The student will become unrecorded and can be marked again afterward."
      >
        <p className="text-sm text-text-secondary leading-relaxed">
          Are you sure you want to clear{" "}
          <span className="font-semibold text-dark">
            {attendanceToClear?.studentName ?? ""}
          </span>
          's{" "}
          <span className="font-semibold text-dark">
            {attendanceToClear?.sessionLabel ?? "Whole Day"}
          </span>{" "}
          attendance?
        </p>
      </ConfirmDialog>
    </section>
  );
}
