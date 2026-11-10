import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  CheckCircle,
  XCircle,
  Wallet,
  FileText,
  Download,
  QrCode,
  ChevronDown,
  FolderOpen,
  Eye,
  HeartHandshake,
  Sparkles,
  Clock,
} from "lucide-react";
import type {
  Student,
  Event,
  EventSchedule,
  AttendanceRecord,
  ContributionRecord,
  PaymentRecord,
  StudentRequirementFile,
  EventVolunteer,
  UserRole,
} from "@/types";
import {
  attendanceService,
  contributionsService,
  eventsService,
  paymentsService,
  studentRequirementFilesService,
  eventVolunteersService,
} from "@/services/db";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createContributionReceiptPreview,
  downloadContributionReceipt,
  officialReceiptNumber,
  type ReceiptFormat,
} from "@/lib/receipts";
import ReceiptViewer from "@/components/ReceiptViewer";
import StudentQrModal from "@/components/StudentQrModal";
import FilePreview from "@/components/FilePreview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  formatDate,
  formatPeso,
  getOrdinalSuffix,
  formatTime12,
  today,
} from "@/lib/format";
import {
  calculateContributionTotals,
  contributionStatus,
} from "@/lib/contributions";
import { useSectionEntrance } from "@/hooks/useSectionEntrance";
import SectionLoader from "@/components/SectionLoader";
import Skeleton from "@/components/Skeleton";
import SectionEmptyState from "@/components/SectionEmptyState";
import SectionBackButton from "@/components/SectionBackButton";
import Pagination from "@/components/common/Pagination";
import AnimatedNetwork from "@/components/ui/animated-network";
import ProfilePhotoUploader from "@/components/ProfilePhotoUploader";
import { calendarDateInTimeZone } from "@/lib/attendance";

interface StudentRecordSectionProps {
  student: Student;
  onBack: () => void;
  currentUserId?: string;
  currentUserRole?: UserRole | null;
}

const RECORDS_PAGE_SIZE = 5;

const eventScheduleLabel = (schedule: EventSchedule): string => {
  const period =
    schedule.period === "morning"
      ? "Morning"
      : schedule.period === "afternoon"
        ? "Afternoon"
        : "Evening";
  const times = [
    schedule.timeIn ? `Start ${formatTime12(schedule.timeIn)}` : "",
    schedule.timeOut ? `End ${formatTime12(schedule.timeOut)}` : "",
  ].filter(Boolean);

  return times.length > 0 ? `${period}: ${times.join(" · ")}` : period;
};

/** Formats a byte count into a human-readable file size (e.g. "1.4 MB"). */
function formatFileSize(bytes?: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export default function StudentRecordSection({
  student,
  onBack,
  currentUserId,
  currentUserRole,
}: StudentRecordSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const incomingEventsRef = useRef<HTMLDivElement>(null);
  const attendanceRef = useRef<HTMLDivElement>(null);
  const contributionsRef = useRef<HTMLDivElement>(null);

  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [qrStudent, setQrStudent] = useState<Student | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(student.profilePhotoUrl);
  const canEditProfilePhoto =
    currentUserRole === "admin" ||
    currentUserRole === "secretary" ||
    currentUserId === student.accountUserId;

  useEffect(() => {
    setProfilePhotoUrl(student.profilePhotoUrl);
  }, [student.id, student.profilePhotoUrl]);

  // Data states
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [attendancePage, setAttendancePage] = useState(1);
  const [contributionRecords, setContributionRecords] = useState<
    ContributionRecord[]
  >([]);
  const [contributionPage, setContributionPage] = useState(1);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [incomingEvents, setIncomingEvents] = useState<Event[]>([]);
  const [volunteerRecords, setVolunteerRecords] = useState<EventVolunteer[]>(
    [],
  );

  // Published Student Requirement Files (Student Viewer)
  const [publishedFiles, setPublishedFiles] = useState<
    StudentRequirementFile[]
  >([]);
  const [previewFile, setPreviewFile] = useState<StudentRequirementFile | null>(
    null,
  );

  // Load data from database
  const loadStudentData = useCallback(async () => {
    setLoading(true);
    try {
      // Optional record sections must never hide a student's basic profile or
      // successfully loaded attendance/financial history. In particular, a
      // project upgraded without the requirements RPC or newer event columns
      // can still display every independent query that succeeds.
      const results = await Promise.allSettled([
        attendanceService.getByStudentId(student.id),
        contributionsService.getByStudentId(student.id),
        eventsService.getAll(),
        paymentsService.getByStudentId(student.id),
        studentRequirementFilesService.getVisibleForStudent(student.id),
        eventVolunteersService.getByStudentId(student.id),
      ]);
      const [
        attendanceResult,
        contributionsResult,
        eventsResult,
        paymentsResult,
        publishedFilesResult,
        volunteersResult,
      ] = results;
      const failedSections: string[] = [];
      const reportFailure = (label: string, result: PromiseSettledResult<unknown>) => {
        if (result.status !== "rejected") return;
        console.error(`Failed to load student ${label}:`, result.reason);
        failedSections.push(label);
      };
      reportFailure("attendance", attendanceResult);
      reportFailure("contributions", contributionsResult);
      reportFailure("event catalog", eventsResult);
      reportFailure("payments", paymentsResult);
      reportFailure("requirement files", publishedFilesResult);
      reportFailure("volunteer activities", volunteersResult);

      const attendanceData =
        attendanceResult.status === "fulfilled" ? attendanceResult.value : [];
      const contributionsData =
        contributionsResult.status === "fulfilled" ? contributionsResult.value : [];
      const eventsData = eventsResult.status === "fulfilled" ? eventsResult.value : [];
      const paymentsData =
        paymentsResult.status === "fulfilled" ? paymentsResult.value : [];
      // Derive the student-facing upcoming list from this successful catalog
      // read. Calling the separate service here would launch a second event
      // request before the shared cache is populated.
      const todayInManila = calendarDateInTimeZone(new Date());
      const incomingEventsData = eventsData
        .filter(
          (event) =>
            Boolean(event.date) &&
            /^\d{4}-\d{2}-\d{2}$/.test(event.date!) &&
            event.date! >= todayInManila,
        )
        .sort((left, right) => left.date!.localeCompare(right.date!));
      const publishedData =
        publishedFilesResult.status === "fulfilled" ? publishedFilesResult.value : [];
      const volunteersData =
        volunteersResult.status === "fulfilled" ? volunteersResult.value : [];

      // A contribution row is created when a payment or contribution is
      // recorded, so unpaid events may not have a row yet. The student view
      // must still show every event in the catalog, with an in-memory unpaid
      // row for any event that has no persisted contribution record.
      const contributionsByEvent = new Map(
        contributionsData.map((record) => [record.eventId, record]),
      );
      const displayedContributions: ContributionRecord[] = eventsData.map(
        (event: Event) => {
          const record = contributionsByEvent.get(event.id);
          if (record) {
            return { ...record, eventName: event.name };
          }

          return {
            id: `unpaid-${student.id}-${event.id}`,
            studentId: student.id,
            eventId: event.id,
            eventName: event.name,
            requiredAmount: event.allocationAmount,
            amountPaid: 0,
            remainingBalance: event.allocationAmount,
          };
        },
      );

      // Preserve persisted rows for an event that was removed from the event
      // catalog so no existing contribution data disappears from the profile.
      const catalogEventIds = new Set(eventsData.map((event) => event.id));
      displayedContributions.push(
        ...contributionsData.filter(
          (record) => !catalogEventIds.has(record.eventId),
        ),
      );

      setAttendanceRecords(attendanceData);
      setContributionRecords(displayedContributions);
      setPaymentRecords(paymentsData);
      setIncomingEvents(incomingEventsData);
      // Published requirement files shown to the student (Student Viewer).
      setPublishedFiles(publishedData);
      setVolunteerRecords(volunteersData);
      if (failedSections.length > 0) {
        toast.error(
          `Some student record details could not be loaded: ${failedSections.join(", ")}.`,
        );
      }
    } finally {
      setLoading(false);
    }
  }, [student.id]);

  useEffect(() => {
    void loadStudentData();
  }, [student.id, loadStudentData]);

  // useRealtimeSync handles reconnection recovery so attendance, contribution,
  // and payment changes are never silently missed for this student's record.
  useRealtimeSync({
    tables: [
      "attendance",
      "contributions",
      "payments",
      "events",
      "event_volunteers",
      "student_requirement_files",
    ],
    onChange: () => void loadStudentData(),
    channelPrefix: `student-record-${student.id}`,
  });

  // Payment receipts are grouped by event once (memoized) instead of being
  // re-filtered for every row on every render.
  const receiptsByEvent = useMemo(() => {
    const map = new Map<string, PaymentRecord[]>();
    for (const payment of paymentRecords) {
      if (!payment.receiptUrl) continue;
      const list = map.get(payment.eventId);
      if (list) list.push(payment);
      else map.set(payment.eventId, [payment]);
    }
    return map;
  }, [paymentRecords]);

  const receiptsForEvent = (eventId: string): PaymentRecord[] =>
    receiptsByEvent.get(eventId) ?? [];

  const getContributionReceiptDetails = async (
    record: ContributionRecord,
    paymentRecord?: PaymentRecord,
  ) => ({
    tag: "CONTRIBUTION RECORD" as const,
    // Reuse the stored OR number from the payment record so we never burn
    // an OR sequence number just to preview or download a receipt.
    receiptNumber:
      paymentRecord?.orNumber ?? (await officialReceiptNumber()),
    issuedTo: student.name,
    eventName: record.eventName,
    amount: record.amountPaid,
    type: "income" as const,
    date: today(),
    recordedBy: "Council Officer",
    requiredAmount: record.requiredAmount,
    remainingBalance: record.remainingBalance,
    statusLabel: contributionStatus(record).label,
    // Pass the stored installment history so the receipt renders the payment
    // history table instead of a single-line amount row.
    paymentItems: paymentRecord?.paymentItems,
  });

  const handlePreviewContributionReceipt = async (
    record: ContributionRecord,
    paymentReceipts: PaymentRecord[],
  ) => {
    const storedReceipt = paymentReceipts.find((payment) => payment.receiptUrl);
    if (storedReceipt?.receiptUrl) {
      setSelectedReceipt(storedReceipt.receiptUrl);
      return;
    }

    try {
      setPreviewingId(record.id);
      // Pass the payment record so we reuse its OR number and payment history.
      const paymentRecord = paymentReceipts[0];
      const receiptUrl = await createContributionReceiptPreview(
        await getContributionReceiptDetails(record, paymentRecord),
      );
      setSelectedReceipt(receiptUrl);
    } catch (error) {
      console.error("Error previewing contribution receipt:", error);
      toast.error("Failed to preview receipt. Please try again.");
    } finally {
      setPreviewingId((current) => (current === record.id ? null : current));
    }
  };

  // Builds the contribution-record receipt (student, event, required, paid,
  // balance, status, payment history) and downloads it directly — no storage
  // round-trip. Supports SVG, PNG, and JPG formats.
  const handleDownloadContributionReceipt = async (
    record: ContributionRecord,
    paymentReceipts: PaymentRecord[],
    format: ReceiptFormat = "svg",
  ) => {
    try {
      setDownloadingId(record.id);
      // Client-side guard (mirrors the guard in downloadContributionReceipt):
      // a receipt is available whenever an actual payment has been made.
      if (record.amountPaid <= 0) {
        throw new Error(
          "Receipt is only available when the paid amount is greater than zero.",
        );
      }
      // Pass the payment record so we reuse its OR number and payment history.
      const paymentRecord = paymentReceipts[0];
      const message = await downloadContributionReceipt(
        await getContributionReceiptDetails(record, paymentRecord),
        format,
      );
      toast.success(message);
    } catch (error) {
      console.error("Error downloading contribution receipt:", error);
      toast.error("Failed to download receipt. Please try again.");
    } finally {
      setDownloadingId((current) => (current === record.id ? null : current));
    }
  };

  useSectionEntrance(sectionRef, [
    // Profile card entrance
    {
      ref: profileRef,
      from: { x: "-60vw", opacity: 0 },
      to: { x: 0, opacity: 1, duration: 0.8 },
    },
    // Attendance table entrance
    {
      ref: incomingEventsRef,
      from: { y: "36vh", opacity: 0 },
      to: { y: 0, opacity: 1, duration: 0.7 },
      position: "-=0.5",
    },
    {
      ref: attendanceRef,
      from: { y: "60vh", opacity: 0 },
      to: { y: 0, opacity: 1, duration: 0.7 },
      position: "-=0.5",
    },
    // Contributions table entrance
    {
      ref: contributionsRef,
      from: { x: "60vw", opacity: 0 },
      to: { x: 0, opacity: 1, duration: 0.7 },
      position: "-=0.5",
    },
  ]);

  // Contribution records are loaded for the student across all events. The
  // shared calculator sums each record's actual amountPaid value, so partial
  // payments are included in Total Paid.
  const { totalPaid, totalRequired, totalBalance } = useMemo(
    () => calculateContributionTotals(contributionRecords),
    [contributionRecords],
  );

  const attendanceTotalPages = Math.max(
    1,
    Math.ceil(attendanceRecords.length / RECORDS_PAGE_SIZE),
  );
  const currentAttendancePage = Math.min(attendancePage, attendanceTotalPages);
  const attendancePageStartIndex =
    (currentAttendancePage - 1) * RECORDS_PAGE_SIZE;
  const paginatedAttendanceRecords = useMemo(
    () =>
      attendanceRecords.slice(
        attendancePageStartIndex,
        attendancePageStartIndex + RECORDS_PAGE_SIZE,
      ),
    [attendanceRecords, attendancePageStartIndex],
  );

  const contributionTotalPages = Math.max(
    1,
    Math.ceil(contributionRecords.length / RECORDS_PAGE_SIZE),
  );
  const currentContributionPage = Math.min(
    contributionPage,
    contributionTotalPages,
  );
  const contributionPageStartIndex =
    (currentContributionPage - 1) * RECORDS_PAGE_SIZE;
  const paginatedContributionRecords = useMemo(
    () =>
      contributionRecords.slice(
        contributionPageStartIndex,
        contributionPageStartIndex + RECORDS_PAGE_SIZE,
      ),
    [contributionRecords, contributionPageStartIndex],
  );

  // Return to the first page whenever a student or the underlying records
  // change, and keep each table's page valid after a data update.
  useEffect(() => {
    setAttendancePage(1);
  }, [student.id, attendanceRecords]);

  useEffect(() => {
    setContributionPage(1);
  }, [student.id, contributionRecords]);

  useEffect(() => {
    setAttendancePage((page) => Math.min(page, attendanceTotalPages));
  }, [attendanceTotalPages]);

  useEffect(() => {
    setContributionPage((page) => Math.min(page, contributionTotalPages));
  }, [contributionTotalPages]);

  const presentCount = attendanceRecords.filter(
    (r) => r.status === "present",
  ).length;
  const absentCount = attendanceRecords.filter(
    (r) => r.status === "absent",
  ).length;

  return (
    <section
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-orange relative overflow-hidden py-20 lg:py-24"
    >
      {/* Animated Network Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <AnimatedNetwork nodeCount={45} maxEdgeDistance={150} speed={0.3} />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        {/* Back Button */}
        <div className="mb-6">
          <SectionBackButton onClick={onBack} label="Back to Search" />
        </div>

        {/* Loading State */}
        {loading && (
          <SectionLoader message="Loading student records..." variant="detail" />
        )}

        {!loading && (
          <>
            {/* Profile Card */}
            <div ref={profileRef} className="glass-card-strong p-6 lg:p-8 mb-8">
              <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                <ProfilePhotoUploader
                  studentId={student.id}
                  photoUrl={profilePhotoUrl}
                  name={student.name}
                  editable={canEditProfilePhoto}
                  onUploaded={setProfilePhotoUrl}
                />
                <div className="flex-1">
                  <h1 className="font-display font-bold text-2xl lg:text-3xl text-dark mb-2">
                    {student.name}
                  </h1>
                  <div className="flex flex-wrap gap-4 text-sm text-text-secondary">
                    <span className="flex items-center gap-1">
                      <FileText className="w-4 h-4" />
                      {student.studentId}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {student.program}
                    </span>
                    <span>
                      {student.yearLevel}
                      {getOrdinalSuffix(student.yearLevel)} Year - Section{" "}
                      {student.section}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setQrStudent(student)}
                    className="glass-button px-4 py-2.5 flex items-center gap-2 text-sm"
                    title="Download your attendance QR code (Student ID, Name, Program, Year, Section)"
                  >
                    <QrCode className="w-4 h-4" />
                    QR Code
                  </button>
                  <div className="glass-card px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-green-600">
                      {presentCount}
                    </p>
                    <p className="text-xs text-text-secondary">Present</p>
                  </div>
                  <div className="glass-card px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-red-500">
                      {absentCount}
                    </p>
                    <p className="text-xs text-text-secondary">Absent</p>
                  </div>
                  <div className="glass-card px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-dark">
                      {formatPeso(totalPaid)}
                    </p>
                    <p className="text-xs text-text-secondary">Total Paid</p>
                  </div>
                  {volunteerRecords.length > 0 && (
                    <div className="glass-card px-4 py-3 text-center border border-emerald-500/30 bg-emerald-50/50">
                      <p className="text-2xl font-bold text-emerald-600">
                        {volunteerRecords.length}
                      </p>
                      <p className="text-xs text-text-secondary font-medium">
                        Volunteer Roles
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Incoming Events - read-only student view of scheduled events. */}
            <div
              ref={incomingEventsRef}
              className="glass-card p-5 lg:p-6 mb-8 border border-primary/20"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-display font-semibold text-lg text-dark">
                      Incoming Events
                    </h2>
                    <p className="text-xs text-text-secondary">
                      Upcoming LSC events, shown nearest first and updated automatically.
                    </p>
                  </div>
                </div>
                <span className="inline-flex w-fit items-center rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                  {incomingEvents.length} upcoming
                </span>
              </div>

              {incomingEvents.length === 0 ? (
                <SectionEmptyState
                  message="No upcoming LSC events are scheduled right now"
                  icon={Calendar}
                  compact
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {incomingEvents.map((event) => {
                    const hasContributionRequirement =
                      !student.isLscOfficer &&
                      !event.isNoContribution &&
                      event.allocationAmount > 0;

                    return (
                      <article
                        key={event.id}
                        className="rounded-xl border border-white/50 bg-white/40 p-4 shadow-xs"
                      >
                        <div className="flex gap-3">
                          <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary text-primary-foreground">
                            <span className="text-[10px] font-medium uppercase leading-none">
                              {event.date
                                ? new Intl.DateTimeFormat("en-US", {
                                    month: "short",
                                  }).format(new Date(`${event.date}T00:00:00`))
                                : "TBD"}
                            </span>
                            <span className="mt-1 text-xl font-bold leading-none">
                              {event.date?.slice(-2)}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <h3 className="font-display font-semibold leading-snug text-dark">
                                {event.name}
                              </h3>
                              <span className="rounded-full bg-status-info/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                                Scheduled
                              </span>
                            </div>
                            <p className="mt-1 text-sm font-medium text-text-secondary">
                              {event.date ? formatDate(event.date) : "Date to be announced"}
                            </p>
                          </div>
                        </div>

                        {event.schedules && event.schedules.length > 0 ? (
                          <div className="mt-4 space-y-1.5 border-t border-white/50 pt-3 text-sm text-text-secondary">
                            {event.schedules.map((schedule) => (
                              <p key={schedule.period} className="flex items-center gap-2">
                                <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
                                {eventScheduleLabel(schedule)}
                              </p>
                            ))}
                          </div>
                        ) : (event.timeIn || event.timeOut) && (
                          <p className="mt-4 flex items-center gap-2 border-t border-white/50 pt-3 text-sm text-text-secondary">
                            <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
                            {event.timeIn && `Start ${formatTime12(event.timeIn)}`}
                            {event.timeIn && event.timeOut && " · "}
                            {event.timeOut && `End ${formatTime12(event.timeOut)}`}
                          </p>
                        )}

                        {hasContributionRequirement && (
                          <div className="mt-4 rounded-lg bg-warning/15 px-3 py-2 text-sm text-dark">
                            <span className="font-medium">Contribution required:</span>{" "}
                            {formatPeso(event.allocationAmount)}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Attendance Records */}
              <div ref={attendanceRef} className="glass-card p-5 lg:p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-red" />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-dark">
                    Attendance Records
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Time In</th>
                        <th>Time Out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedAttendanceRecords.map((record) => (
                        <tr key={record.id}>
                          <td className="font-medium text-dark">
                            {record.eventName}
                          </td>
                          <td className="text-text-secondary">
                            {formatDate(record.date)}
                          </td>
                          <td>
                            {record.status === "present" && (
                              <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="w-4 h-4" />
                                Present
                              </span>
                            )}
                            {record.status === "absent" && (
                              <span className="flex items-center gap-1 text-red-500">
                                <XCircle className="w-4 h-4" />
                                Absent
                              </span>
                            )}
                            {record.status === "excuse" && (
                              <span className="flex items-center gap-1 text-purple-600">
                                <CheckCircle className="w-4 h-4" />
                                Excused
                              </span>
                            )}
                          </td>
                          <td className="text-text-secondary whitespace-nowrap">
                            {record.status !== "absent" && record.timeIn
                              ? formatTime12(record.timeIn)
                              : "—"}
                          </td>
                          <td className="text-text-secondary whitespace-nowrap">
                            {record.status !== "absent" && record.timeOut
                              ? formatTime12(record.timeOut)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={currentAttendancePage}
                  totalPages={attendanceTotalPages}
                  totalItems={attendanceRecords.length}
                  startIndex={attendancePageStartIndex}
                  endIndex={
                    attendancePageStartIndex + paginatedAttendanceRecords.length
                  }
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

                {attendanceRecords.length === 0 && (
                  <SectionEmptyState
                    message="No attendance records found"
                    icon={Calendar}
                    compact
                  />
                )}
              </div>

              {/* Contribution Records */}
              <div ref={contributionsRef} className="glass-card p-5 lg:p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-red" />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-dark">
                    Contribution Records
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th>Events</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Downloadable Receipts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedContributionRecords.map((record) => {
                        const status = contributionStatus(record);
                        const paymentReceipts = receiptsForEvent(
                          record.eventId,
                        );
                        return (
                          <tr key={record.id}>
                            <td className="font-medium text-dark">
                              {record.eventName}
                            </td>
                            <td>
                              <span className="font-medium text-green-600">
                                {formatPeso(record.amountPaid)}
                              </span>
                              <span className="block text-xs text-text-secondary">
                                of {formatPeso(record.requiredAmount)}
                              </span>
                            </td>
                            <td className={`font-medium ${status.className}`}>
                              {status.label}
                            </td>
                            <td>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {/* A receipt is available for partial and fully paid records,
                                    but not for records with no actual payment. */}
                                {record.amountPaid > 0 && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handlePreviewContributionReceipt(
                                          record,
                                          paymentReceipts,
                                        )
                                      }
                                      disabled={previewingId === record.id}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs disabled:opacity-70"
                                      title={`Preview contribution receipt – ${record.eventName}`}
                                    >
                                      {previewingId === record.id ? (
                                        <Skeleton className="h-3.5 w-3.5 rounded-full" />
                                      ) : (
                                        <Eye className="w-3.5 h-3.5" />
                                      )}
                                      Preview
                                    </button>

                                    <DropdownMenu>
                                      <DropdownMenuTrigger
                                        asChild
                                        disabled={downloadingId === record.id}
                                        title={`Download contribution receipt – ${record.eventName}`}
                                      >
                                        <button
                                          disabled={downloadingId === record.id}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs disabled:opacity-70"
                                        >
                                          {downloadingId === record.id ? (
                                            <Skeleton className="h-3.5 w-3.5 rounded-full" />
                                          ) : (
                                            <Download className="w-3.5 h-3.5" />
                                          )}
                                          Download
                                          <ChevronDown className="w-3 h-3" />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="end"
                                        className="glass-card-strong"
                                      >
                                        {(
                                          [
                                            "svg",
                                            "png",
                                            "jpg",
                                          ] as ReceiptFormat[]
                                        ).map((format) => (
                                          <DropdownMenuItem
                                            key={format}
                                            onClick={() =>
                                              handleDownloadContributionReceipt(
                                                record,
                                                paymentReceipts,
                                                format,
                                              )
                                            }
                                            className="flex items-center gap-2 cursor-pointer text-xs"
                                          >
                                            {format.toUpperCase()}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={currentContributionPage}
                  totalPages={contributionTotalPages}
                  totalItems={contributionRecords.length}
                  startIndex={contributionPageStartIndex}
                  endIndex={
                    contributionPageStartIndex +
                    paginatedContributionRecords.length
                  }
                  onPrev={() =>
                    setContributionPage((page) => Math.max(1, page - 1))
                  }
                  onNext={() =>
                    setContributionPage((page) =>
                      Math.min(contributionTotalPages, page + 1),
                    )
                  }
                  onJump={setContributionPage}
                />

                {contributionRecords.length === 0 && (
                  <SectionEmptyState
                    message="No contribution records found"
                    icon={Wallet}
                    compact
                  />
                )}

                {/* Summary */}
                {contributionRecords.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/50">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-secondary">
                        Total Required:
                      </span>
                      <span className="font-medium text-dark">
                        {formatPeso(totalRequired)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-text-secondary">Total Paid:</span>
                      <span className="font-medium text-green-600">
                        {formatPeso(totalPaid)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-text-secondary">
                        Remaining Balance:
                      </span>
                      <span
                        className={`font-medium ${totalBalance > 0 ? "text-red-500" : "text-green-600"}`}
                      >
                        {formatPeso(totalBalance)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Event Volunteer History */}
            {volunteerRecords.length > 0 && (
              <div className="glass-card p-5 lg:p-6 mb-8 border border-emerald-500/30 bg-white/70">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <HeartHandshake className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-lg text-dark">
                      Event Volunteer History
                    </h3>
                    <p className="text-xs text-text-secondary">
                      Official student volunteer assignments and service records (
                      {volunteerRecords.length})
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Assigned Task / Role</th>
                        <th>Status</th>
                        <th>Date Assigned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {volunteerRecords.map((vol) => (
                        <tr key={vol.id}>
                          <td className="font-medium text-dark">
                            <span className="font-semibold">
                              {vol.eventName}
                            </span>
                          </td>
                          <td>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                              <Sparkles className="w-3 h-3 text-emerald-600" />
                              {vol.roleOrTask}
                            </span>
                          </td>
                          <td>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 capitalize inline-block">
                              {vol.status || "Assigned"}
                            </span>
                          </td>
                          <td className="text-text-secondary text-xs whitespace-nowrap">
                            {formatDate(vol.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Student Requirement Files (published files visible to students) */}
            <div id="requirement-files" className="glass-card p-5 lg:p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-red" />
                </div>
                <h3 className="font-display font-semibold text-lg text-dark">
                  Shared Files
                </h3>
              </div>

              {publishedFiles.length === 0 ? (
                <SectionEmptyState
                  message="No requirement files have been published yet"
                  icon={FolderOpen}
                  compact
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {publishedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="rounded-xl border border-white/50 bg-white/40 p-4 flex flex-col"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-red" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-dark text-sm leading-snug">
                            {file.title}
                          </p>
                          {file.description && (
                            <p className="mt-1 text-xs text-text-secondary line-clamp-2">
                              {file.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-3 text-xs text-text-secondary">
                        <span className="truncate">{file.fileName}</span>
                        <span className="flex-shrink-0">
                          {formatFileSize(file.fileSize)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-text-secondary">
                        Published {formatDate(file.updatedAt)}
                      </p>

                      <div className="mt-4 flex items-center gap-2">
                        {file.fileUrl ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setPreviewFile(file)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs glass-button"
                              title={`Preview ${file.title}`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Preview
                            </button>
                            <a
                              href={file.fileUrl}
                              download={file.fileName}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs glass-button"
                              title={`Download ${file.fileName}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </a>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-text-secondary">
                            <Skeleton className="h-3.5 w-3.5 rounded-full" />
                            Still syncing, check back soon
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Receipt Modal */}
      <ReceiptViewer
        receiptUrl={selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        title="Contribution Receipt"
      />

      {/* Attendance QR Code Modal */}
      <StudentQrModal student={qrStudent} onClose={() => setQrStudent(null)} />

      {/* Requirement File Preview Modal */}
      <Dialog
        open={!!previewFile}
        onOpenChange={(open) => {
          if (!open) setPreviewFile(null);
        }}
      >
        <DialogContent className="glass-card-strong max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              {previewFile?.title}
            </DialogTitle>
          </DialogHeader>

          {previewFile && (
            <div className="mt-4">
              {previewFile.description && (
                <p className="mb-4 text-sm text-text-secondary">
                  {previewFile.description}
                </p>
              )}

              <div className="max-h-[55vh] overflow-auto rounded-lg bg-white/30">
                <FilePreview file={previewFile} />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-text-secondary">
                  {previewFile.fileName} ·{" "}
                  {formatFileSize(previewFile.fileSize)}
                </span>
                <div className="flex gap-3">
                  <a
                    href={previewFile.fileUrl}
                    download={previewFile.fileName}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm glass-button"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
