import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Calendar,
  Plus,
  CreditCard,
  Users,
  User,
  CheckCircle,
  XCircle,
  Save,
  DollarSign,
  FileText,
  Loader2,
  UserCheck,
  Search,
  Pencil,
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
} from "lucide-react";
import jsQR from "jsqr";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  eventsService,
  studentsService,
  paymentsService,
  attendanceService,
  contributionsService,
  boardMembersService,
  subscribeToTables,
} from "@/services/db";
import type {
  Event,
  Student,
  PaymentRecord,
  AttendanceRecord,
  ContributionRecord,
  UserRole,
  BoardMember,
} from "@/types";
import { autoCreateReceipt, officialReceiptNumber } from "@/lib/receipts";
import { parseStudentQrText } from "@/lib/qr";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  formatDate,
  daysUntil,
  today,
  formatTime12,
  formatTimeRange,
  compareTime24,
  todayLocal,
  formatPeso,
} from "@/lib/format";
import { useSectionEntrance } from "@/hooks/useSectionEntrance";
import SectionLoader from "@/components/SectionLoader";
import SectionEmptyState from "@/components/SectionEmptyState";
import SectionBackButton from "@/components/SectionBackButton";
interface EventManagementSectionProps {
  onBack: () => void;
  initialTab?: string;
  role: UserRole;
  staffName: string;
  userId?: string;
}

/**
 * A 12-hour time input (hour + minutes + AM/PM) that stores the value as
 * 24h "HH:MM" (e.g. "06:00" for 6:00 AM, "17:00" for 5:00 PM) so the
 * database column stays sortable and consistent with the rest of the app.
 */
function TimeInput12({
  value = "",
  onChange,
  disabled,
  ariaLabel,
}: {
  value?: string;
  onChange: (value24: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  const hour24 = match ? Number(match[1]) : NaN;
  const hour12 = Number.isNaN(hour24)
    ? 1
    : hour24 % 12 === 0
      ? 12
      : hour24 % 12;
  const minute = match ? match[2] : "00";
  const period = Number.isNaN(hour24) ? "AM" : hour24 >= 12 ? "PM" : "AM";

  const to24 = (h: number, m: string, p: "AM" | "PM") => {
    const hour = Math.min(12, Math.max(1, Math.round(h)));
    let h24: number;
    if (hour === 12) {
      h24 = p === "AM" ? 0 : 12; // 12 AM = 00:00, 12 PM = 12:00
    } else {
      h24 = p === "PM" ? hour + 12 : hour;
    }
    return `${String(h24).padStart(2, "0")}:${m}`;
  };

  const setHour = (raw: string) => {
    const h = parseInt(raw, 10);
    const clamped = Math.min(
      12,
      Math.max(1, Number.isFinite(h) ? Math.round(h) : 12),
    );
    onChange(to24(clamped, minute, period));
  };

  const setMinute = (raw: string) => {
    const m = parseInt(raw, 10);
    const mm = String(
      Math.min(59, Math.max(0, Number.isFinite(m) ? Math.round(m) : 0)),
    ).padStart(2, "0");
    onChange(to24(hour12, mm, period));
  };

  const setPeriod = (p: "AM" | "PM") => {
    onChange(to24(hour12, minute, p));
  };

  return (
    <div className="flex items-center gap-1" aria-label={ariaLabel}>
      <input
        type="number"
        min={1}
        max={12}
        inputMode="numeric"
        placeholder="6"
        value={Number.isFinite(hour24) ? hour12 : ""}
        onChange={(e) => setHour(e.target.value)}
        disabled={disabled}
        className="glass-input w-11 px-1 py-1.5 text-sm text-center"
        title="Hour (1-12)"
      />
      <span className="text-text-secondary text-xs">:</span>
      <input
        type="number"
        min={0}
        max={59}
        inputMode="numeric"
        placeholder="00"
        value={Number.isFinite(hour24) ? minute : ""}
        onChange={(e) => setMinute(e.target.value)}
        disabled={disabled}
        className="glass-input w-11 px-1 py-1.5 text-sm text-center"
        title="Minutes (00-59)"
      />
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value as "AM" | "PM")}
        disabled={disabled}
        className="glass-input px-1 py-1.5 text-sm w-14"
        title="AM or PM"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

export default function EventManagementSection({
  onBack,
  initialTab = "event-management",
  role,
  staffName,
}: EventManagementSectionProps) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [events, setEvents] = useState<Event[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [setContributions] = useState<ContributionRecord[]>([]);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Role-based permissions
  const canRecordPayments =
    role === "admin" || role === "treasurer" || role === "auditor";
  const canManageEvents = role === "admin" || role === "board-member";
  const canRecordAttendance = role === "admin" || role === "secretary";

  // Event form (shared by the create and edit flows)
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  // Delete confirmation dialog state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [eventForm, setEventForm] = useState({
    name: "",
    allocationAmount: 0,
    date: "",
    morningTimeIn: "",
    morningTimeOut: "",
    afternoonTimeIn: "",
    afternoonTimeOut: "",
  });

  // Payment form
  const [paymentForm, setPaymentForm] = useState({
    studentId: "",
    eventId: "",
    amount: 0,
  });

  // Searchable student picker for the "Record Payment" form (name or ID).
  const [paymentStudentSearch, setPaymentStudentSearch] = useState("");
  const [paymentStudentOpen, setPaymentStudentOpen] = useState(false);
  const paymentSearchRef = useRef<HTMLDivElement>(null);

  const paymentStudentMatches = useMemo(() => {
    const query = paymentStudentSearch.trim().toLowerCase();
    if (!query) return [];
    return students
      .filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.studentId.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [paymentStudentSearch, students]);

  // Close the picker when clicking anywhere outside of it.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        paymentSearchRef.current &&
        !paymentSearchRef.current.contains(event.target as Node)
      ) {
        setPaymentStudentOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePaymentStudentSelect = (student: Student) => {
    setPaymentForm((prev) => ({ ...prev, studentId: student.id }));
    setPaymentStudentSearch(`${student.name} (${student.studentId})`);
    setPaymentStudentOpen(false);
  };

  // Attendance
  const [selectedEventForAttendance, setSelectedEventForAttendance] =
    useState("");
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendanceSession, setAttendanceSession] = useState<
    "morning" | "afternoon"
  >("morning");
  const [manualSearchQuery, setManualSearchQuery] = useState("");

  // Auto-filter state set by QR scan — when a student is scanned, the table
  // auto-filters to their Course & Section and highlights them at the top.
  const [scannedCourse, setScannedCourse] = useState<string | null>(null);
  const [scannedSection, setScannedSection] = useState<string | null>(null);
  const [lastScannedStudentId, setLastScannedStudentId] = useState<
    string | null
  >(null);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);

  // QR Code Scanner (Time In / Time Out)
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
  /** Last decoded payload + timestamp so repeated reads of the same code are ignored. */
  const lastScanRef = useRef({ data: "", at: 0 });

  // The event selected in the attendance tab (undefined until one is chosen).
  const selectedAttendanceEvent = events.find(
    (e) => e.id === selectedEventForAttendance,
  );

  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        eventsData,
        studentsData,
        paymentsData,
        contributionsData,
        attendanceData,
      ] = await Promise.all([
        eventsService.getAll(),
        studentsService.getAll(),
        paymentsService.getAll(),
        contributionsService.getAll(),
        attendanceService.getAll(),
      ]);
      setEvents(eventsData);
      setStudents(studentsData);
      setPayments(paymentsData);
      setAttendanceRecords(attendanceData);

      // Board members are read from the production catalog; the list powers the
      // "assign members" picker. Falls back to an empty list when the
      // RLS policy has not been provisioned yet.
      try {
        setBoardMembers(await boardMembersService.listBoardMembers());
      } catch (membersError) {
        console.warn("Could not load board members:", membersError);
        setBoardMembers([]);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial read plus live re-queries for every table displayed in this view.
  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return subscribeToTables(
      [
        "events",
        "students",
        "contributions",
        "payments",
        "attendance",
        "board_members",
      ],
      loadData,
      "event-management",
    );
  }, [loadData]);

  useSectionEntrance(sectionRef, [
    {
      ref: contentRef,
      from: { y: "6vh", opacity: 0 },
      to: { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" },
    },
  ]);

  const openAddEventModal = () => {
    setEditingEvent(null);
    setEventForm({
      name: "",
      allocationAmount: 0,
      date: "",
      morningTimeIn: "",
      morningTimeOut: "",
      afternoonTimeIn: "",
      afternoonTimeOut: "",
    });
    setShowEventModal(true);
  };

  const handleOpenEditEvent = (event: Event) => {
    setEditingEvent(event);
    setEventForm({
      name: event.name,
      allocationAmount: event.allocationAmount,
      date: event.date ?? "",
      morningTimeIn: event.morningTimeIn ?? "",
      morningTimeOut: event.morningTimeOut ?? "",
      afternoonTimeIn: event.afternoonTimeIn ?? "",
      afternoonTimeOut: event.afternoonTimeOut ?? "",
    });
    setShowEventModal(true);
  };

  const handleAddEvent = async () => {
    try {
      setSaving(true);
      const newEvent = await eventsService.create({
        name: eventForm.name,
        allocationAmount: eventForm.allocationAmount,
        date: eventForm.date,
        morningTimeIn: eventForm.morningTimeIn || undefined,
        morningTimeOut: eventForm.morningTimeOut || undefined,
        afternoonTimeIn: eventForm.afternoonTimeIn || undefined,
        afternoonTimeOut: eventForm.afternoonTimeOut || undefined,
      });
      setEvents([...events, newEvent]);
      setShowEventModal(false);
      setEventForm({
        name: "",
        allocationAmount: 0,
        date: "",
        morningTimeIn: "",
        morningTimeOut: "",
        afternoonTimeIn: "",
        afternoonTimeOut: "",
      });
      toast.success("Event created successfully");
    } catch (error) {
      console.error("Error creating event:", error);
      toast.error("Failed to create event");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateEvent = async () => {
    if (!editingEvent) return;
    try {
      setSaving(true);
      const updated = await eventsService.update(editingEvent.id, {
        name: eventForm.name,
        allocationAmount: eventForm.allocationAmount,
        date: eventForm.date,
        morningTimeIn: eventForm.morningTimeIn || undefined,
        morningTimeOut: eventForm.morningTimeOut || undefined,
        afternoonTimeIn: eventForm.afternoonTimeIn || undefined,
        afternoonTimeOut: eventForm.afternoonTimeOut || undefined,
      });
      setEvents(events.map((e) => (e.id === editingEvent.id ? updated : e)));
      setEditingEvent(null);
      setShowEventModal(false);
      setEventForm({
        name: "",
        allocationAmount: 0,
        date: "",
        morningTimeIn: "",
        morningTimeOut: "",
        afternoonTimeIn: "",
        afternoonTimeOut: "",
      });
      toast.success("Event updated successfully");
    } catch (error) {
      console.error("Error updating event:", error);
      toast.error("Failed to update event");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDeleteConfirm = (event: Event) => {
    setEventToDelete(event);
    setShowDeleteConfirm(true);
  };

  const handleDeleteEvent = async () => {
    if (!eventToDelete) return;
    try {
      setSaving(true);
      await eventsService.delete(eventToDelete.id);
      setEvents(events.filter((e) => e.id !== eventToDelete.id));
      setEventToDelete(null);
      setShowDeleteConfirm(false);
      toast.success("Event deleted successfully");
    } catch (error) {
      console.error("Error deleting event:", error);
      toast.error("Failed to delete event");
    } finally {
      setSaving(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const student = students.find((s) => s.id === paymentForm.studentId);
      const event = events.find((e) => e.id === paymentForm.eventId);

      if (!student || !event) {
        toast.error("Please select both student and event");
        return;
      }

      // An official receipt is generated automatically (as SVG, uploaded to
      // the "receipts" Storage bucket) and attached to the payment.
      let receiptUrl: string | undefined;
      if (role === "admin" || role === "treasurer" || role === "auditor") {
        try {
          const orNumber = await officialReceiptNumber();
          receiptUrl = await autoCreateReceipt({
            tag: "PAYMENT",
            receiptNumber: orNumber,
            issuedTo: student.name,
            eventName: event.name,
            description: `Payment for ${event.name}`,
            amount: paymentForm.amount,
            type: "income",
            date: today(),
            recordedBy: staffName || "Council Officer",
          });
          toast.success(
            "An official receipt was generated and attached automatically.",
          );
        } catch (receiptError) {
          console.warn("Auto receipt generation failed:", receiptError);
        }
      }

      await paymentsService.create({
        studentId: paymentForm.studentId,
        studentName: student.name,
        eventId: paymentForm.eventId,
        eventName: event.name,
        amount: paymentForm.amount,
        date: today(),
        recordedBy: staffName || "Council Officer",
        receiptUrl,
      });

      // Update contribution record (create it first when this student has no
      // row for the event — e.g. a student added without seeded contribution
      // data — so the student's "Contribution Records" panel stays accurate).
      const contributions = await contributionsService.getByStudentId(
        student.id,
      );
      const contribution = contributions.find((c) => c.eventId === event.id);
      if (contribution) {
        await contributionsService.update(contribution.id, {
          amountPaid: contribution.amountPaid + paymentForm.amount,
          remainingBalance: Math.max(
            0,
            contribution.remainingBalance - paymentForm.amount,
          ),
        });
      } else {
        await contributionsService.create({
          studentId: student.id,
          eventId: event.id,
          eventName: event.name,
          requiredAmount: event.allocationAmount,
          amountPaid: paymentForm.amount,
          remainingBalance: Math.max(
            0,
            event.allocationAmount - paymentForm.amount,
          ),
        });
      }

      toast.success("Payment recorded successfully!");
      setPaymentForm({ studentId: "", eventId: "", amount: 0 });
      setPaymentStudentSearch("");
      setPaymentStudentOpen(false);

      // Refresh payments
      const updatedPayments = await paymentsService.getAll();
      setPayments(updatedPayments);
    } catch (error) {
      console.error("Error recording payment:", error);
      toast.error("Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const selectedAttendanceRecords = useMemo(
    () =>
      selectedEventForAttendance
        ? attendanceRecords.filter(
            (r) =>
              r.eventId === selectedEventForAttendance &&
              r.session === attendanceSession,
          )
        : [],
    [attendanceRecords, selectedEventForAttendance, attendanceSession],
  );

  const manualSearchResults = useMemo(() => {
    const query = manualSearchQuery.trim().toLowerCase();
    if (!query) return [];
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.studentId.toLowerCase().includes(query),
    );
  }, [manualSearchQuery, students]);

  // Attendance lookup map for O(1) access instead of O(n) find() in render loops
  const attendanceMap = useMemo(
    () => new Map(selectedAttendanceRecords.map((r) => [r.studentId, r])),
    [selectedAttendanceRecords],
  );

  /**
   * Upserts one student's attendance row for the selected event and session and saves it
   * immediately - QR scans and manual edits both persist right away (there is
   * no separate "Save Attendance" step). The saved record is written straight
   * into state so the attendance table shows it instantly.
   */
  const persistAttendance = useCallback(
    async (
      studentId: string,
      patch: Partial<Pick<AttendanceRecord, "status" | "timeIn" | "timeOut">>,
    ): Promise<AttendanceRecord | null> => {
      const event = selectedAttendanceEvent;
      if (!event) {
        toast.error("Select an event before recording attendance");
        return null;
      }
      const existing =
        attendanceRecords.find(
          (r) =>
            r.studentId === studentId &&
            r.eventId === selectedEventForAttendance &&
            r.session === attendanceSession,
        ) ?? null;
      const payload = {
        studentId,
        eventId: event.id,
        eventName: event.name,
        date: event.date ?? today(),
        session: attendanceSession,
        status: patch.status ?? existing?.status ?? "present",
        timeIn: patch.timeIn !== undefined ? patch.timeIn : existing?.timeIn,
        timeOut:
          patch.timeOut !== undefined ? patch.timeOut : existing?.timeOut,
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
    [
      selectedAttendanceEvent,
      attendanceRecords,
      selectedEventForAttendance,
      attendanceSession,
    ],
  );

  const handleMarkAttendance = async (
    studentId: string,
    status: "present" | "absent",
  ) => {
    try {
      await persistAttendance(studentId, { status });
      toast.success(
        status === "present" ? "Marked as Present" : "Marked as Absent",
      );
    } catch (error) {
      console.error("Error saving attendance status:", error);
      toast.error(`Failed to save attendance — ${errorMessage(error)}`);
    }
  };

  /** Manual time-in / time-out edit (24h "HH:MM") - saved immediately. */
  const handleSetAttendanceTime = async (
    studentId: string,
    field: "timeIn" | "timeOut",
    value: string,
  ) => {
    try {
      const record = attendanceMap.get(studentId);
      // Re-derive Present/Late from the edited time-in so the status always
      // follows the event schedule for the selected session.
      const status =
        field === "timeIn" &&
        value &&
        record?.status !== "absent" &&
        selectedAttendanceEvent
          ? deriveScanStatus(value, selectedAttendanceEvent, attendanceSession)
          : undefined;
      await persistAttendance(studentId, { [field]: value, status });
    } catch (error) {
      console.error("Error saving attendance time:", error);
      toast.error(`Failed to save attendance time — ${errorMessage(error)}`);
    }
  };

  const deriveScanStatus = (
    scanTimeHM: string,
    event?: Event,
    session?: "morning" | "afternoon",
  ): "present" | "late" => {
    if (!event) return "present";
    let sessionIn: string | undefined;
    if (session === "afternoon") {
      sessionIn = event.afternoonTimeIn || event.morningTimeIn || event.timeIn;
    } else {
      sessionIn = event.morningTimeIn || event.timeIn;
    }
    return sessionIn && compareTime24(scanTimeHM, sessionIn) > 0
      ? "late"
      : "present";
  };

  const nowClock = () => new Date().toTimeString().slice(0, 5);

  /** Readable message from an unknown thrown value, shown in error toasts. */
  const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  const handleManualAttendance = async (
    student: Student,
    action: "timeIn" | "timeOut",
  ) => {
    const event = selectedAttendanceEvent;
    if (!event) {
      toast.error("Select an event before recording attendance");
      return;
    }
    const existing =
      attendanceRecords.find(
        (r) =>
          r.studentId === student.id &&
          r.eventId === selectedEventForAttendance &&
          r.session === attendanceSession,
      ) ?? null;

    if (action === "timeIn") {
      if (existing?.timeIn) {
        toast.info(`${student.name} already has Time In recorded`);
        return;
      }
      const scanTime = nowClock();
      try {
        await persistAttendance(student.id, {
          status: deriveScanStatus(scanTime, event, attendanceSession),
          timeIn: scanTime,
        });
        toast.success(
          `${student.name} Time In recorded at ${formatTime12(scanTime)} for ${attendanceSession} session`,
        );
      } catch (error) {
        console.error("Error recording Time In:", error);
        toast.error(`Failed to record Time In — ${errorMessage(error)}`);
      }
    } else {
      if (!existing?.timeIn) {
        toast.error(
          `${student.name} has no Time In yet for ${attendanceSession} session`,
        );
        return;
      }
      if (existing.timeOut) {
        toast.info(`${student.name} already has Time Out recorded`);
        return;
      }
      const scanTime = nowClock();
      try {
        await persistAttendance(student.id, {
          status: existing.status,
          timeOut: scanTime,
        });
        toast.success(
          `${student.name} Time Out recorded at ${formatTime12(scanTime)} for ${attendanceSession} session`,
        );
      } catch (error) {
        console.error("Error recording Time Out:", error);
        toast.error(`Failed to record Time Out — ${errorMessage(error)}`);
      }
    }
  };

  // =====================================================================
  // QR Code Scanner — camera-based scanning for Time In / Time Out.
  // Frames from the camera are decoded with jsQR; a valid student QR is
  // resolved to a student and recorded through handleManualAttendance,
  // which stamps the actual scan time as the student's Time In/Out.
  // =====================================================================
  const handleQrScan = (rawData: string) => {
    // Debounce: the decoder runs on every frame, so ignore repeated reads
    // of the same code within a short window.
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
    // Auto-apply course & section filters from the scanned student's record
    setScannedCourse(student.program);
    setScannedSection(student.section);
    setLastScannedStudentId(student.id);
    setLastScanTime(nowClock());
    void handleManualAttendance(student, scanMode);
  };

  // Keep a ref to the latest handler so the camera loop never goes stale.
  const qrScanHandlerRef = useRef<(data: string) => void>(() => undefined);
  qrScanHandlerRef.current = handleQrScan;

  useEffect(() => {
    if (!scannerActive) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId = 0;
    // Capture the video element up front so the cleanup below doesn't touch
    // a ref that may have changed by the time it runs.
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

        // Request the rear camera first. This also prompts for permission on
        // iOS, after which enumerateDevices() exposes camera labels/IDs.
        const constraints: MediaStreamConstraints = selectedCameraId
          ? { video: { deviceId: { exact: selectedCameraId } } }
          : { video: { facingMode: { ideal: "environment" } } };
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (selectedCameraError) {
          // A device ID can become stale when a camera is disconnected or the
          // browser reorders inputs. Retry by facing mode, then use any camera
          // as a final fallback so scanning remains available.
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
            /* autoplay restrictions — the stream still renders */
          }
        }
        lastScanRef.current = { data: "", at: 0 };

        // Device labels are commonly blank until permission has been granted.
        // Enumerate only after the stream starts, then prefer cameras whose
        // labels identify them as rear-facing across Android and iOS.
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

  /**
   * The 10:00 PM auto-absent sweep: every event scheduled for today gets its
   * unrecorded students marked Absent for each session the event holds.
   * Triggered when the Attendance tab opens, then once per minute.
   */
  const autoMarkAbsent = useCallback(async () => {
    if (!canRecordAttendance) return;
    if (new Date().getHours() < 22) return; // only runs after 10:00 PM local time

    const todaysDate = todayLocal();
    const todaysEvents = events.filter((e) => e.date === todaysDate);
    if (todaysEvents.length === 0) return;

    try {
      for (const event of todaysEvents) {
        for (const session of ["morning", "afternoon"] as const) {
          // Skip sessions this event does not hold.
          const holdsSession =
            session === "morning"
              ? !!(event.morningTimeIn || event.morningTimeOut)
              : !!(event.afternoonTimeIn || event.afternoonTimeOut);
          if (!holdsSession) continue;

          // Authoritative check against the DB so repeated sweeps never
          // create duplicate Absent rows.
          const existing = await attendanceService.getByEventIdAndSession(
            event.id,
            session,
          );
          const recordedIds = new Set(existing.map((r) => r.studentId));
          const missing = students.filter((s) => !recordedIds.has(s.id));
          if (missing.length === 0) continue;

          const saved = await Promise.all(
            missing.map((student) =>
              attendanceService.create({
                studentId: student.id,
                eventId: event.id,
                eventName: event.name,
                date: event.date ?? todaysDate,
                session,
                status: "absent",
              }),
            ),
          );

          // Merge into state, replacing any stale rows for this event+session.
          setAttendanceRecords((prev) => [
            ...prev.filter(
              (r) => !(r.eventId === event.id && r.session === session),
            ),
            ...existing,
            ...saved,
          ]);
        }
      }
    } catch (error) {
      console.error("Auto-marking absent students failed:", error);
      toast.error(
        `Failed to auto-mark absent students — ${errorMessage(error)}`,
      );
    }
  }, [canRecordAttendance, events, students]);

  // Checks right when the Attendance tab opens, then re-checks every minute
  // so members are marked Absent as soon as 10:00 PM passes.
  useEffect(() => {
    if (activeTab !== "attendance-management") return;
    autoMarkAbsent();
    const interval = setInterval(autoMarkAbsent, 60_000);
    return () => clearInterval(interval);
  }, [activeTab, autoMarkAbsent]);

  // Required contributions are authoritative per student and event. Do not
  // infer a collection target from the event allocation or student count.
  const expectedCollection = (event: Event) => {
    const allocation = Number(event.allocationAmount) || 0;
    const studentCount = students.length;

    return allocation * studentCount;
  };

  /** Morning / Afternoon schedule label for the events list (12h AM/PM). */
  const scheduleLabel = (event: Event): string => {
    const hasMorning = !!(event.morningTimeIn || event.morningTimeOut);
    const hasAfternoon = !!(event.afternoonTimeIn || event.afternoonTimeOut);
    if (!hasMorning && !hasAfternoon) return "-";
    return [
      hasMorning
        ? `Morning: ${formatTimeRange(event.morningTimeIn, event.morningTimeOut)}`
        : null,
      hasAfternoon
        ? `Afternoon: ${formatTimeRange(event.afternoonTimeIn, event.afternoonTimeOut)}`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");
  };

  // Upcoming events listed soonest first.
  const todaysISO = today();
  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    [events],
  );

  // Event ids assigned to the signed-in board member (used to highlight
  // the board member's own assignments in the events table).

  // Students filtered by the single attendance search bar (full name OR
  // student ID - one search box for both). When a QR scan sets the course &
  // section, the table auto-filters to that Course + Section, and the most
  // recently scanned student is moved to the top of the list.
  const attendanceSearchTerm = attendanceSearch.trim().toLowerCase();
  const filteredStudents = useMemo(() => {
    let result = students;

    // When a student has been scanned, auto-filter by their course & section
    if (scannedCourse && scannedSection) {
      result = result.filter(
        (s) => s.program === scannedCourse && s.section === scannedSection,
      );
    }

    // Also apply text search if present
    if (attendanceSearchTerm) {
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(attendanceSearchTerm) ||
          s.studentId.toLowerCase().includes(attendanceSearchTerm),
      );
    }

    // Move the most recently scanned student to the top
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
    scannedCourse,
    scannedSection,
    lastScannedStudentId,
  ]);

  // The last scanned student object for the "Last Scanned" banner
  const lastScannedStudent = lastScannedStudentId
    ? (students.find((s) => s.id === lastScannedStudentId) ?? null)
    : null;

  // Event-level K-Means attendance analysis. Total Population uses the live
  // registered-student roster. Actual attendance includes each registered
  // student once per event, even when they have both morning and afternoon
  // records; late records count as attended.
  const attendanceAnalysisData = useMemo(() => {
    const registeredStudentIds = new Set(students.map((student) => student.id));
    const totalPopulation = registeredStudentIds.size;

    return [...events]
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

  return (
    <section
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-orange relative overflow-hidden py-20 lg:py-24"
    >
      {/* Content */}
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
                Event & Payment Management
              </h1>
              <p className="text-text-secondary text-sm">
                Manage events, record payments, and track attendance
              </p>
            </div>
          </div>

          {canManageEvents && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={openAddEventModal}
                className="btn-primary px-4 py-2.5 flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Create Event</span>
              </button>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && <SectionLoader message="Loading data..." />}

        {/* Tabs */}
        {!loading && (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="glass-card mb-6 p-1 flex flex-wrap gap-1">
              <TabsTrigger
                value="event-management"
                className="flex-1 data-[state=active]:bg-red data-[state=active]:text-white"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Events
              </TabsTrigger>
              {canRecordPayments && (
                <TabsTrigger
                  value="payment-management"
                  className="flex-1 data-[state=active]:bg-red data-[state=active]:text-white"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Payments
                </TabsTrigger>
              )}
              {canRecordAttendance && (
                <TabsTrigger
                  value="attendance-management"
                  className="flex-1 data-[state=active]:bg-red data-[state=active]:text-white"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Attendance
                </TabsTrigger>
              )}
            </TabsList>

            {/* Events Tab */}
            <TabsContent value="event-management">
              <div className="glass-card p-5 lg:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-red" />
                    </div>
                    <h3 className="font-display font-semibold text-lg text-dark">
                      Upcoming Events & Allocations
                    </h3>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th>Event Name</th>
                        <th>Date</th>
                        <th>Schedule</th>
                        <th>Allocation</th>
                        <th>Expected Collection</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedEvents.map((event) => (
                        <tr key={event.id}>
                          <td className="font-medium text-dark">
                            <div className="flex items-center gap-2 flex-wrap">
                              {event.name}
                            </div>
                          </td>
                          <td className="text-text-secondary whitespace-nowrap">
                            {event.date ? (
                              <div className="flex items-center gap-2">
                                <span>{formatDate(event.date)}</span>
                                {event.date >= todaysISO && (
                                  <span
                                    className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                                      daysUntil(event.date) === 0
                                        ? "bg-red-500 text-white"
                                        : "bg-green-100 text-green-600"
                                    }`}
                                  >
                                    {daysUntil(event.date) === 0
                                      ? "Today"
                                      : `In ${daysUntil(event.date)}d`}
                                  </span>
                                )}
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="text-text-secondary whitespace-nowrap">
                            {scheduleLabel(event)}
                          </td>
                          <td className="text-text-secondary">
                            {formatPeso(event.allocationAmount)}
                          </td>
                          <td className="font-medium text-green-600">
                            {formatPeso(expectedCollection(event))}
                          </td>

                          <td>
                            {canManageEvents ? (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleOpenEditEvent(event)}
                                  className="text-sm flex items-center gap-1"
                                  title="Edit event"
                                >
                                  <Pencil className="w-4 h-4" /> Edit
                                </button>
                                <button
                                  onClick={() => handleOpenDeleteConfirm(event)}
                                  className="flex items-center gap-1 text-sm hover:text-red"
                                  title="Delete event"
                                >
                                  <Trash2 className="w-4 h-4 text-red" /> Delete
                                </button>
                              </div>
                            ) : (
                              <span className="text-text-secondary/50">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {events.length === 0 && (
                  <SectionEmptyState
                    message="No events found"
                    icon={Calendar}
                  />
                )}
              </div>
            </TabsContent>

            {/* Payments Tab */}
            <TabsContent value="payment-management">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Payment Form */}
                <div className="glass-card p-5 lg:p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-red" />
                    </div>
                    <h3 className="font-display font-semibold text-lg text-dark">
                      Record Payment
                    </h3>
                  </div>

                  <form onSubmit={handleRecordPayment} className="space-y-4">
                    <div ref={paymentSearchRef} className="relative">
                      <label className="block text-sm font-medium text-dark mb-1.5">
                        Select Student
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                        <input
                          type="text"
                          value={paymentStudentSearch}
                          onChange={(e) => {
                            setPaymentStudentSearch(e.target.value);
                            setPaymentForm((prev) => ({
                              ...prev,
                              studentId: "",
                            }));
                            setPaymentStudentOpen(true);
                          }}
                          onFocus={() => setPaymentStudentOpen(true)}
                          className="glass-input w-full pl-10 pr-4 py-3 text-sm"
                          placeholder="Search by full name or student ID..."
                          autoComplete="off"
                        />
                      </div>

                      {paymentStudentOpen && (
                        <div className="absolute z-20 mt-1 w-full glass-card-strong rounded-xl overflow-hidden shadow-xl">
                          {paymentStudentMatches.length > 0 ? (
                            <ul className="max-h-56 overflow-y-auto py-1">
                              {paymentStudentMatches.map((s) => (
                                <li key={s.id}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() =>
                                      handlePaymentStudentSelect(s)
                                    }
                                    className="w-full text-left px-4 py-2"
                                  >
                                    <User className="w-4 h-4 text-red shrink-0" />
                                    <span className="min-w-0">
                                      <span className="block text-sm font-medium text-dark truncate">
                                        {s.name}
                                      </span>
                                      <span className="block text-xs text-text-secondary">
                                        {s.studentId} · {s.program} · Year{" "}
                                        {s.yearLevel}
                                      </span>
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="px-4 py-3 text-sm text-text-secondary">
                              {paymentStudentSearch.trim()
                                ? "No students found. Check the name or ID."
                                : "Type a name or a student ID to search."}
                            </div>
                          )}
                        </div>
                      )}

                      <p className="text-xs text-text-secondary mt-1">
                        Search by full name or student ID
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark mb-1.5">
                        Select Event
                      </label>
                      <select
                        value={paymentForm.eventId}
                        onChange={(e) =>
                          setPaymentForm({
                            ...paymentForm,
                            eventId: e.target.value,
                          })
                        }
                        className="glass-input w-full px-4 py-3 text-sm"
                        required
                      >
                        <option value="">Choose an event</option>
                        {events.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark mb-1.5">
                        Amount
                      </label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                        <input
                          type="number"
                          value={paymentForm.amount || ""}
                          onChange={(e) =>
                            setPaymentForm({
                              ...paymentForm,
                              amount: parseInt(e.target.value) || 0,
                            })
                          }
                          className="glass-input w-full pl-10 pr-4 py-3 text-sm"
                          placeholder="0.00"
                          required
                          min="1"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full btn-primary px-4 py-3 flex items-center justify-center gap-2"
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Record Payment
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {/* Recent Payments */}
                <div className="glass-card p-5 lg:p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-red" />
                    </div>
                    <h3 className="font-display font-semibold text-lg text-dark">
                      Recent Payments
                    </h3>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {payments.slice(0, 10).map((payment) => (
                      <div key={payment.id} className="glass-card p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-dark">
                              {payment.studentName}
                            </p>
                            <p className="text-sm text-text-secondary">
                              {payment.eventName}
                            </p>
                            <p className="text-xs text-text-secondary/70">
                              {formatDate(payment.date)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-green-600">
                              {formatPeso(payment.amount)}
                            </p>
                            <p className="text-xs text-text-secondary">
                              {payment.recordedBy}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {payments.length === 0 && (
                      <SectionEmptyState
                        message="No payments recorded yet"
                        icon={CreditCard}
                        compact
                      />
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Attendance Tab */}
            <TabsContent value="attendance-management">
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
                    onChange={(e) =>
                      setSelectedEventForAttendance(e.target.value)
                    }
                    className="glass-input w-full px-4 py-3 text-sm"
                  >
                    <option value="">Choose an event</option>
                    {events.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedAttendanceEvent && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-dark mb-1.5">
                      Select Session
                    </label>
                    <select
                      value={attendanceSession}
                      onChange={(e) =>
                        setAttendanceSession(
                          e.target.value as "morning" | "afternoon",
                        )
                      }
                      className="glass-input w-full px-4 py-3 text-sm"
                    >
                      <option value="morning">
                        Morning (Time In / Time Out)
                      </option>
                      <option value="afternoon">
                        Afternoon (Time In / Time Out)
                      </option>
                    </select>
                  </div>
                )}

                {/* Scheduled windows + auto-status rules for the selected event */}
                {selectedAttendanceEvent && (
                  <div className="mb-4 rounded-xl border border-white/50 bg-white/30 p-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="flex items-center gap-1.5 font-medium text-dark">
                        <Clock className="w-4 h-4 text-red" />
                        Schedule: {scheduleLabel(selectedAttendanceEvent)}
                      </span>
                      <span className="text-xs text-text-secondary">
                        Present = recorded on/before scheduled Time In | Late =
                        recorded after scheduled Time In | Absent = never
                        recorded (auto-marked at 10:00 PM)
                      </span>
                    </div>
                  </div>
                )}

                {/* QR Code Scanner — Time In / Time Out */}
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
                            Pick a mode, then hold a student's QR code in front
                            of the camera — the scan time is recorded
                            automatically.
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
                            Start{" "}
                            {scanMode === "timeIn"
                              ? "Time In"
                              : "Time Out"}{" "}
                            Scanner
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Scan guide line */}
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
                                  (device) =>
                                    device.deviceId === selectedCameraId,
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
                      Can't scan a student's QR code? Use the manual search
                      below to record their attendance.
                    </p>
                  </div>
                )}

                {/* Manual Student Search for Attendance */}
                {selectedAttendanceEvent && (
                  <div className="mb-6 border border-white/50 rounded-xl p-4 lg:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-red/10 flex items-center justify-center">
                          <Search className="w-4 h-4 text-red" />
                        </div>
                        <div>
                          <h4 className="font-display font-semibold text-dark">
                            Manual Attendance Entry
                          </h4>
                          <p className="text-xs text-text-secondary">
                            Search for a student by Student ID or Full Name,
                            then click Time In or Time Out to record attendance.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                            attendanceSession === "morning"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {attendanceSession === "morning" ? "☀️" : "🌤️"}{" "}
                          {attendanceSession.charAt(0).toUpperCase() +
                            attendanceSession.slice(1)}{" "}
                          Session
                        </span>
                      </div>
                    </div>

                    {/* Search Input */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                      <input
                        type="text"
                        value={manualSearchQuery}
                        onChange={(e) => setManualSearchQuery(e.target.value)}
                        placeholder="Search by Student ID or Full Name..."
                        className="glass-input pl-10 pr-4 py-2.5 text-sm w-full"
                        autoFocus
                      />
                      {manualSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setManualSearchQuery("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary"
                          title="Clear search"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Search Results */}
                    {manualSearchQuery.trim() && (
                      <div className="overflow-x-auto">
                        <table className="glass-table">
                          <thead>
                            <tr>
                              <th>Student</th>
                              <th>Student ID</th>
                              <th className="text-center">Status</th>
                              <th>Time In</th>
                              <th>Time Out</th>
                              <th className="text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {manualSearchResults.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="text-center text-text-secondary py-6"
                                >
                                  No students found matching "
                                  {manualSearchQuery}"
                                </td>
                              </tr>
                            ) : (
                              manualSearchResults.map((student) => {
                                const record = attendanceMap.get(student.id);
                                const hasTimeIn = !!record?.timeIn;
                                const hasTimeOut = !!record?.timeOut;
                                return (
                                  <tr key={student.id}>
                                    <td className="font-medium text-dark">
                                      {student.name}
                                    </td>
                                    <td className="text-text-secondary">
                                      {student.studentId}
                                    </td>
                                    <td className="text-center">
                                      {record && (
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
                                      )}
                                      {!record && (
                                        <span className="text-text-secondary">
                                          —
                                        </span>
                                      )}
                                    </td>
                                    <td>
                                      {record?.timeIn ? (
                                        formatTime12(record.timeIn)
                                      ) : (
                                        <span className="text-text-secondary">
                                          —
                                        </span>
                                      )}
                                    </td>
                                    <td>
                                      {record?.timeOut ? (
                                        formatTime12(record.timeOut)
                                      ) : (
                                        <span className="text-text-secondary">
                                          —
                                        </span>
                                      )}
                                    </td>
                                    <td className="text-center">
                                      <div className="flex items-center justify-center gap-2">
                                        <button
                                          onClick={() =>
                                            handleManualAttendance(
                                              student,
                                              "timeIn",
                                            )
                                          }
                                          disabled={hasTimeIn}
                                          className={`px-3 py-1.5 text-xs rounded-lg ${
                                            hasTimeIn
                                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                              : "bg-green-100 text-green-700 hover:bg-green-200"
                                          }`}
                                          title={
                                            hasTimeIn
                                              ? "Time In already recorded"
                                              : "Record Time In"
                                          }
                                        >
                                          <LogIn className="w-3.5 h-3.5" />
                                          Time In
                                        </button>
                                        <button
                                          onClick={() =>
                                            handleManualAttendance(
                                              student,
                                              "timeOut",
                                            )
                                          }
                                          disabled={!hasTimeIn || hasTimeOut}
                                          className={`px-3 py-1.5 text-xs rounded-lg ${
                                            !hasTimeIn || hasTimeOut
                                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                              : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                          }`}
                                          title={
                                            !hasTimeIn
                                              ? "Record Time In first"
                                              : hasTimeOut
                                                ? "Time Out already recorded"
                                                : "Record Time Out"
                                          }
                                        >
                                          <LogOut className="w-3.5 h-3.5" />
                                          Time Out
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {!manualSearchQuery.trim() && (
                      <div className="text-center text-text-secondary py-6">
                        <Search className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>Enter a Student ID or Full Name to search</p>
                      </div>
                    )}
                  </div>
                )}

                {selectedEventForAttendance && (
                  <>
                    {/* Single search bar - finds students by full name or ID */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                      <input
                        type="text"
                        value={attendanceSearch}
                        onChange={(e) => setAttendanceSearch(e.target.value)}
                        placeholder="Search by full name or student ID..."
                        className="glass-input pl-10 pr-4 py-2.5 text-sm w-full"
                      />
                      {attendanceSearch && (
                        <button
                          type="button"
                          onClick={() => setAttendanceSearch("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary"
                          title="Clear search"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Session indicator */}
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red/10 text-red text-sm font-medium">
                        {attendanceSession === "morning" ? "☀️" : "🌤️"}
                        <span className="capitalize">
                          {attendanceSession}
                        </span>{" "}
                        Session
                      </span>
                      <span className="text-xs text-text-secondary">
                        Schedule:{" "}
                        {attendanceSession === "morning"
                          ? selectedAttendanceEvent?.morningTimeIn
                            ? `${selectedAttendanceEvent.morningTimeIn} - ${selectedAttendanceEvent.morningTimeOut}`
                            : "Not set"
                          : selectedAttendanceEvent?.afternoonTimeIn
                            ? `${selectedAttendanceEvent.afternoonTimeIn} - ${selectedAttendanceEvent.afternoonTimeOut}`
                            : "Not set"}
                      </span>
                      {scannedCourse && scannedSection && (
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
                      )}
                    </div>

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
                                <span className="text-text-secondary">
                                  Status:
                                </span>
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
                                  {lastScanTime
                                    ? formatTime12(lastScanTime)
                                    : "—"}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

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
                            <th>Time In</th>
                            <th>Time Out</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStudents.map((student) => {
                            const record = attendanceMap.get(student.id);
                            const isPresent = record?.status === "present";
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
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() =>
                                        handleMarkAttendance(
                                          student.id,
                                          "present",
                                        )
                                      }
                                      className={`p-2 rounded-lg ${
                                        isPresent
                                          ? "bg-green-100 text-green-600"
                                          : "text-text-secondary"
                                      }`}
                                      title="Mark as Present (auto-saves)"
                                    >
                                      <CheckCircle className="w-5 h-5" />
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleMarkAttendance(
                                          student.id,
                                          "absent",
                                        )
                                      }
                                      className={`p-2 rounded-lg ${
                                        record?.status === "absent"
                                          ? "bg-red/10 text-red-500"
                                          : "text-text-secondary"
                                      }`}
                                      title="Mark as Absent (auto-saves)"
                                    >
                                      <XCircle className="w-5 h-5" />
                                    </button>
                                    {record && (
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
                                    )}
                                  </div>
                                </td>
                                <td className="text-text-secondary text-sm">
                                  {selectedAttendanceEvent?.name ?? "—"}
                                </td>
                                <td>
                                  <TimeInput12
                                    value={record?.timeIn ?? ""}
                                    onChange={(v) =>
                                      handleSetAttendanceTime(
                                        student.id,
                                        "timeIn",
                                        v,
                                      )
                                    }
                                    disabled={record?.status === "absent"}
                                    ariaLabel="Time in"
                                  />
                                </td>
                                <td>
                                  <TimeInput12
                                    value={record?.timeOut ?? ""}
                                    onChange={(v) =>
                                      handleSetAttendanceTime(
                                        student.id,
                                        "timeOut",
                                        v,
                                      )
                                    }
                                    disabled={record?.status === "absent"}
                                    ariaLabel="Time out"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                          {filteredStudents.length === 0 && (
                            <tr>
                              <td
                                colSpan={8}
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
                  </>
                )}

                {!selectedEventForAttendance && (
                  <SectionEmptyState
                    message="Select an event to track attendance"
                    icon={Calendar}
                  />
                )}

                {/* Event Attendance Analysis (K-Means) */}
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
                        K-Means attendance comparison using live
                        registered-student and attendance records for every
                        event.
                      </p>
                    </div>
                  </div>

                  {attendanceAnalysisData.length === 0 ? (
                    <SectionEmptyState
                      message="Create an event to view attendance analysis"
                      icon={Calendar}
                      compact
                    />
                  ) : (
                    <div className="glass-card-strong p-4 lg:p-5">
                      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium">
                        <span className="inline-flex items-center gap-2 text-dark">
                          <span className="h-2.5 w-2.5 rounded-full bg-royal-blue" />
                          Total Population
                        </span>
                        <span className="inline-flex items-center gap-2 text-dark">
                          <span className="h-2.5 w-2.5 rounded-full bg-status-success" />
                          Actual Population Attended
                        </span>
                        <span className="text-text-secondary">
                          Attendance Gap = Total Population − Actual Population
                          Attended
                        </span>
                      </div>

                      <div
                        className="h-80 w-full"
                        role="img"
                        aria-label="Line chart comparing total population and actual population attended for each event"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={attendanceAnalysisData}
                            margin={{ top: 12, right: 24, left: 0, bottom: 8 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#B8C1D9"
                            />
                            <XAxis
                              dataKey="eventName"
                              tick={{ fill: "#4A5580", fontSize: 12 }}
                              interval={0}
                              angle={-20}
                              textAnchor="end"
                              height={60}
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={{ fill: "#4A5580", fontSize: 12 }}
                            />
                            <Tooltip
                              labelFormatter={(_, payload) =>
                                payload[0]?.payload.eventLabel ?? "Event"
                              }
                              formatter={(value: number, name: string) => [
                                value,
                                name,
                              ]}
                              contentStyle={{
                                borderRadius: "0.75rem",
                                borderColor: "#B8C1D9",
                              }}
                            />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="totalPopulation"
                              name="Total Population"
                              stroke="#1B2E8C"
                              strokeWidth={3}
                              dot={{ r: 4 }}
                              activeDot={{ r: 6 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="actualPopulationAttended"
                              name="Actual Population Attended"
                              stroke="#2E9E5B"
                              strokeWidth={3}
                              dot={{ r: 4 }}
                              activeDot={{ r: 6 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="mt-5 overflow-x-auto">
                        <table className="glass-table min-w-[680px]">
                          <thead>
                            <tr>
                              <th>Event</th>
                              <th className="text-right">Total Population</th>
                              <th className="text-right">
                                Actual Population Attended
                              </th>
                              <th className="text-right">Attendance Gap</th>
                            </tr>
                          </thead>
                          <tbody>
                            {attendanceAnalysisData.map((event) => (
                              <tr key={event.eventId}>
                                <td className="font-medium text-dark">
                                  {event.eventLabel}
                                </td>
                                <td className="text-right text-royal-blue font-medium">
                                  {event.totalPopulation}
                                </td>
                                <td className="text-right text-status-success font-medium">
                                  {event.actualPopulationAttended}
                                </td>
                                <td className="text-right text-red font-medium">
                                  {event.attendanceGap}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Add/Edit Event Modal */}
      <Dialog
        open={showEventModal || !!editingEvent}
        onOpenChange={(open) => {
          if (!open) {
            setShowEventModal(false);
            setEditingEvent(null);
          }
        }}
      >
        <DialogContent className="glass-card-strong max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              {editingEvent ? "Edit Event" : "Create New Event"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Event Name
              </label>
              <input
                type="text"
                value={eventForm.name}
                onChange={(e) =>
                  setEventForm({ ...eventForm, name: e.target.value })
                }
                className="glass-input w-full px-4 py-2"
                placeholder="e.g., General Assembly"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Date
              </label>
              <input
                type="date"
                value={eventForm.date}
                onChange={(e) =>
                  setEventForm({ ...eventForm, date: e.target.value })
                }
                className="glass-input w-full px-4 py-2"
              />
            </div>

            {/* Morning and Afternoon schedules - the scanner derives Present/Late
                from the scan time vs. the applicable session's Time In. */}
            <div className="rounded-xl border border-white/50 bg-white/30 p-3 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">
                  Morning Schedule
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-dark mb-1">
                      Scheduled Time In
                    </label>
                    <TimeInput12
                      value={eventForm.morningTimeIn}
                      onChange={(v) =>
                        setEventForm({ ...eventForm, morningTimeIn: v })
                      }
                      ariaLabel="Morning scheduled time in"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark mb-1">
                      Scheduled Time Out
                    </label>
                    <TimeInput12
                      value={eventForm.morningTimeOut}
                      onChange={(v) =>
                        setEventForm({ ...eventForm, morningTimeOut: v })
                      }
                      ariaLabel="Morning scheduled time out"
                    />
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">
                  Afternoon Schedule
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-dark mb-1">
                      Scheduled Time In
                    </label>
                    <TimeInput12
                      value={eventForm.afternoonTimeIn}
                      onChange={(v) =>
                        setEventForm({ ...eventForm, afternoonTimeIn: v })
                      }
                      ariaLabel="Afternoon scheduled time in"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark mb-1">
                      Scheduled Time Out
                    </label>
                    <TimeInput12
                      value={eventForm.afternoonTimeOut}
                      onChange={(v) =>
                        setEventForm({ ...eventForm, afternoonTimeOut: v })
                      }
                      ariaLabel="Afternoon scheduled time out"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Allocation Amount (₱)
              </label>
              <input
                type="number"
                value={eventForm.allocationAmount || ""}
                onChange={(e) =>
                  setEventForm({
                    ...eventForm,
                    allocationAmount: parseInt(e.target.value) || 0,
                  })
                }
                className="glass-input w-full px-4 py-2"
                placeholder="0.00"
                min="0"
              />
            </div>

            {canManageEvents && boardMembers.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-dark mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-text-secondary" />
                    Assigned Board Members
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto rounded-xl border border-white/50 p-3 bg-white/30">
                  {boardMembers.map((member) => (
                    <label
                      key={member.id}
                      className="flex items-center gap-2 cursor-pointer text-sm hover:text-red transition-colors"
                    >
                      <span className="truncate">{member.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {canManageEvents && boardMembers.length === 0 && (
              <p className="text-xs text-text-secondary">
                No board member accounts yet — create them in Supabase (see
                supabase/create_officer_accounts.sql).
              </p>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setShowEventModal(false);
                  setEditingEvent(null);
                }}
                className="flex-1 glass-button px-4 py-2.5"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={editingEvent ? handleUpdateEvent : handleAddEvent}
                className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2"
                disabled={saving || !eventForm.name || !eventForm.date}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    {editingEvent ? (
                      <Save className="w-4 h-4" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    {editingEvent ? "Update Event" : "Create Event"}
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Event Confirmation Dialog */}
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setShowDeleteConfirm(false);
            setEventToDelete(null);
          }
        }}
      >
        <DialogContent className="glass-card-strong max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              Delete Event
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-text-secondary">
              Are you sure you want to delete{" "}
              <span className="font-medium text-dark">
                {eventToDelete?.name}
              </span>
              ? This action cannot be undone.
            </p>
            <p className="text-xs text-text-secondary/80">
              Deleting this event will also remove related payments,
              contributions, and attendance records.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setEventToDelete(null);
                }}
                className="flex-1 glass-button px-4 py-2.5"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEvent}
                className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2 !bg-red !border-none"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Event
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
