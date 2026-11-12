import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  Clock,
  Download,
  Eye,
  FileText,
  FolderOpen,
  HeartHandshake,
  PieChart,
  QrCode,
  Sparkles,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AttendanceRecord,
  ContributionRecord,
  Event,
  EventVolunteer,
  PaymentRecord,
  Student,
  StudentRequirementFile,
  UserRole,
} from "@/types";
import {
  attendanceService,
  contributionsService,
  eventVolunteersService,
  eventsService,
  paymentsService,
  studentRequirementFilesService,
} from "@/services/db";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { usePagination } from "@/hooks/usePagination";
import { createContributionReceiptPreview, downloadContributionReceipt, officialReceiptNumber, type ReceiptFormat } from "@/lib/receipts";
import { formatDate, formatPeso, formatTime12, getOrdinalSuffix, today } from "@/lib/format";
import { calculateContributionTotals, contributionStatus } from "@/lib/contributions";
import { calendarDateInTimeZone } from "@/lib/attendance";
import ReceiptViewer from "@/components/ReceiptViewer";
import StudentQrModal from "@/components/StudentQrModal";
import ProfilePhotoUploader from "@/components/ProfilePhotoUploader";
import { EventCard } from "@/components/UpcomingEvents";
import { DownloadLink, FilePreviewModal, FileSize } from "@/components/FilePreview";
import Page from "@/components/ui/Page";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import Skeleton, { LoadingCard } from "@/components/ui/Skeleton";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/Menu";

interface StudentRecordSectionProps {
  student: Student;
  onBack: () => void;
  currentUserId?: string;
  currentUserRole?: UserRole | null;
}

const PAGE_SIZE = 5;
const RECEIPT_FORMATS: ReceiptFormat[] = ["svg", "png", "jpg"];

const ATTENDANCE_STATUS = {
  present: { label: "Present", chip: "chip-success", icon: CheckCircle },
  excuse: { label: "Excused", chip: "chip-brand", icon: CheckCircle },
  absent: { label: "Absent", chip: "chip-danger", icon: XCircle },
} satisfies Record<AttendanceRecord["status"], { label: string; chip: string; icon: LucideIcon }>;

const VOLUNTEER_CHIP: Record<EventVolunteer["status"], string> = {
  assigned: "chip-neutral",
  active: "chip-brand",
  completed: "chip-success",
};

/** Catalog events dated today or later (Asia/Manila), nearest first; malformed legacy dates are skipped. */
const upcomingEvents = (events: Event[]) => {
  const todayInManila = calendarDateInTimeZone(new Date());
  return events
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date ?? "") && e.date! >= todayInManila)
    .sort((a, b) => a.date!.localeCompare(b.date!));
};

/**
 * Shows every catalog event (an unpaid placeholder when no row exists yet),
 * plus persisted rows whose event was since removed from the catalog.
 */
function withUnpaidEvents(studentId: string, records: ContributionRecord[], events: Event[]): ContributionRecord[] {
  const byEvent = new Map(records.map((r) => [r.eventId, r]));
  const eventIds = new Set(events.map((e) => e.id));
  return [
    ...events.map((event): ContributionRecord => {
      const record = byEvent.get(event.id);
      return record
        ? { ...record, eventName: event.name }
        : {
            id: `unpaid-${studentId}-${event.id}`,
            studentId,
            eventId: event.id,
            eventName: event.name,
            requiredAmount: event.allocationAmount,
            amountPaid: 0,
            remainingBalance: event.allocationAmount,
          };
    }),
    ...records.filter((r) => !eventIds.has(r.eventId)),
  ];
}

function Panel({ id, icon: Icon, title, subtitle, aside, children }: { id?: string; icon: LucideIcon; title: string; subtitle?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-5">
        <div className="icon-tile">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function StudentRecordSection({ student, onBack, currentUserId, currentUserRole }: StudentRecordSectionProps) {
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [contributions, setContributions] = useState<ContributionRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [incoming, setIncoming] = useState<Event[]>([]);
  const [volunteers, setVolunteers] = useState<EventVolunteer[]>([]);
  const [files, setFiles] = useState<StudentRequirementFile[]>([]);

  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [previewFile, setPreviewFile] = useState<StudentRequirementFile | null>(null);
  /** `${action}:${recordId}` of the receipt action in progress. */
  const [busy, setBusy] = useState<string | null>(null);

  const canEditProfilePhoto =
    currentUserRole === "admin" || currentUserRole === "secretary" || (!!currentUserId && currentUserId === student.accountUserId);

  // Each load gets a number so a slow, older response never overwrites a newer one.
  const latestLoad = useRef(0);
  const load = useCallback(async () => {
    const run = ++latestLoad.current;
    // Optional sections must never hide the ones that loaded: a project
    // without the requirements RPC or newer event columns still shows every
    // independent query that succeeds.
    const [attendanceResult, contributionsResult, eventsResult, paymentsResult, filesResult, volunteersResult] = await Promise.allSettled([
      attendanceService.getByStudentId(student.id),
      contributionsService.getByStudentId(student.id),
      eventsService.getAll(),
      paymentsService.getByStudentId(student.id),
      studentRequirementFilesService.getVisibleForStudent(student.id),
      eventVolunteersService.getByStudentId(student.id),
    ]);
    if (run !== latestLoad.current) return;

    const failed: string[] = [];
    const settled = <T,>(result: PromiseSettledResult<T[]>, label: string): T[] => {
      if (result.status === "fulfilled") return result.value;
      console.error(`Failed to load student ${label}:`, result.reason);
      failed.push(label);
      return [];
    };
    const attendanceData = settled(attendanceResult, "attendance");
    const contributionData = settled(contributionsResult, "contributions");
    const events = settled(eventsResult, "event catalog");
    setAttendance(attendanceData);
    setContributions(withUnpaidEvents(student.id, contributionData, events));
    setPayments(settled(paymentsResult, "payments"));
    // Derived from this catalog read: a separate upcoming-events request would
    // fire before the shared cache is populated.
    setIncoming(upcomingEvents(events));
    setFiles(settled(filesResult, "requirement files"));
    setVolunteers(settled(volunteersResult, "volunteer activities"));
    setLoading(false);
    if (failed.length > 0) toast.error(`Some student record details could not be loaded: ${failed.join(", ")}.`);
  }, [student.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reconnection-safe realtime refresh, so no attendance, contribution or
  // payment change for this student is silently missed.
  useRealtimeSync({
    tables: ["attendance", "contributions", "payments", "events", "event_volunteers", "student_requirement_files"],
    onChange: () => void load(),
    channelPrefix: `student-record-${student.id}`,
  });

  const attendancePage = usePagination(attendance, PAGE_SIZE);
  const contributionPage = usePagination(contributions, PAGE_SIZE);
  const { totalPaid, totalRequired, totalBalance } = useMemo(() => calculateContributionTotals(contributions), [contributions]);
  const counts = { present: 0, excuse: 0, absent: 0 };
  attendance.forEach((r) => counts[r.status]++);
  // Excused records count neither for nor against the rate.
  const counted = counts.present + counts.absent;
  const attendanceRate = counted ? Math.round((counts.present / counted) * 100) : 0;

  // The stored payment (with receipt) for an event, if any.
  const paymentFor = (record: ContributionRecord) => payments.find((p) => p.eventId === record.eventId && p.receiptUrl);

  const receiptDetails = async (record: ContributionRecord, payment?: PaymentRecord) => ({
    tag: "CONTRIBUTION RECORD" as const,
    // Reuse the stored OR number so previewing/downloading never burns a new one.
    receiptNumber: payment?.orNumber ?? (await officialReceiptNumber()),
    issuedTo: student.name,
    eventName: record.eventName,
    amount: record.amountPaid,
    type: "income" as const,
    date: today(),
    recordedBy: "Council Officer",
    requiredAmount: record.requiredAmount,
    remainingBalance: record.remainingBalance,
    statusLabel: contributionStatus(record).label,
    // Installment history renders as a payment-history table on the receipt.
    paymentItems: payment?.paymentItems,
  });

  const runReceiptAction = async (action: "preview" | "download", record: ContributionRecord, task: () => Promise<void>) => {
    const key = `${action}:${record.id}`;
    setBusy(key);
    try {
      await task();
    } catch (error) {
      console.error(`Error (${action}) contribution receipt:`, error);
      toast.error(`Failed to ${action} receipt. Please try again.`);
    } finally {
      setBusy((current) => (current === key ? null : current));
    }
  };

  // Prefer a receipt stored with an actual payment; otherwise generate one.
  const previewReceipt = (record: ContributionRecord) => {
    const payment = paymentFor(record);
    if (payment?.receiptUrl) return setReceiptUrl(payment.receiptUrl);
    void runReceiptAction("preview", record, async () => setReceiptUrl(await createContributionReceiptPreview(await receiptDetails(record, payment))));
  };

  const downloadReceipt = (record: ContributionRecord, format: ReceiptFormat) =>
    runReceiptAction("download", record, async () => {
      toast.success(await downloadContributionReceipt(await receiptDetails(record, paymentFor(record)), format));
    });

  const details = [student.studentId, student.program, `${student.yearLevel}${getOrdinalSuffix(student.yearLevel)} Year · Section ${student.section}`];

  return (
    <Page
      eyebrow="Student record"
      title="Your council record"
      subtitle="Attendance, contributions, receipts and shared files — all in one place."
      onBack={onBack}
      hero={
        <div className="glass flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <ProfilePhotoUploader
            studentId={student.id}
            photoUrl={student.profilePhotoUrl}
            name={student.name}
            editable={canEditProfilePhoto}
            sizeClassName="h-20 w-20"
            className="bg-white/15 text-white ring-white/25"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold sm:text-2xl">{student.name}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {details.map((d) => (
                <span key={d} className="chip bg-white/10 font-medium text-white/85">
                  {d}
                </span>
              ))}
              {volunteers.length > 0 && (
                <span className="chip bg-powder/20 text-powder">
                  <HeartHandshake className="h-3.5 w-3.5" /> {volunteers.length} volunteer role{volunteers.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowQr(true)}
            className="btn btn-light self-start sm:self-center"
            title="Download your attendance QR code (Student ID, Name, Program, Year, Section)"
          >
            <QrCode className="h-4 w-4" /> My QR code
          </button>
        </div>
      }
    >
      {loading ? (
        <LoadingCard rows={6} label="Loading student records…" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard featured icon={Wallet} label="Total paid" value={formatPeso(totalPaid)} hint={`of ${formatPeso(totalRequired)} required`} />
            <StatCard
              icon={PieChart}
              tone={totalBalance > 0 ? "danger" : "success"}
              label="Remaining balance"
              value={formatPeso(totalBalance)}
              hint={totalBalance > 0 ? "Outstanding contributions" : "All settled"}
            />
            <StatCard
              icon={Calendar}
              tone="success"
              label="Attendance rate"
              value={`${attendanceRate}%`}
              hint={`${counts.present} present · ${counts.excuse} excused · ${counts.absent} absent`}
            />
            <StatCard icon={FolderOpen} label="Shared files" value={files.length} hint="Available to download" />
          </div>

          <Panel
            icon={CalendarDays}
            title="Incoming events"
            subtitle="Upcoming LSC events, nearest first and updated automatically."
            aside={<span className="chip chip-brand">{incoming.length} upcoming</span>}
          >
            {incoming.length === 0 ? (
              <EmptyState icon={CalendarDays} title="No upcoming LSC events are scheduled right now" />
            ) : (
              <div className="grid grid-cols-1 gap-4 px-5 pb-5 md:grid-cols-2 xl:grid-cols-3">
                {incoming.map((event) => (
                  <EventCard key={event.id} event={event} className="rounded-2xl border border-line bg-surface-2">
                    {/* Active LSC officers are exempt from event contributions. */}
                    {!student.isLscOfficer && !event.isNoContribution && event.allocationAmount > 0 && (
                      <p className="mt-4 rounded-xl bg-warning/10 px-3 py-2 text-sm text-ink">
                        <span className="font-semibold">Contribution required:</span> {formatPeso(event.allocationAmount)}
                      </p>
                    )}
                  </EventCard>
                ))}
              </div>
            )}
          </Panel>

          <Panel icon={Wallet} title="Contributions">
            {contributions.length === 0 ? (
              <EmptyState icon={Wallet} title="No contribution records found" />
            ) : (
              <>
                <div data-lenis-prevent className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Paid</th>
                        <th>Balance</th>
                        <th>Status</th>
                        <th className="text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributionPage.pageItems.map((record) => {
                        const status = contributionStatus(record);
                        return (
                          <tr key={record.id}>
                            <td className="font-medium">{record.eventName}</td>
                            <td className="whitespace-nowrap">
                              <span className="font-semibold">{formatPeso(record.amountPaid)}</span>
                              <span className="block text-xs text-muted">of {formatPeso(record.requiredAmount)}</span>
                            </td>
                            <td className="whitespace-nowrap text-muted">{formatPeso(record.remainingBalance)}</td>
                            <td>
                              <span className={status.className}>{status.label}</span>
                            </td>
                            <td>
                              {/* Receipts exist only once something has actually been paid. */}
                              {record.amountPaid > 0 && (
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => previewReceipt(record)}
                                    disabled={busy === `preview:${record.id}`}
                                    className="btn btn-ghost btn-sm"
                                    title={`Preview contribution receipt – ${record.eventName}`}
                                  >
                                    {busy === `preview:${record.id}` ? <Skeleton className="h-3.5 w-3.5 rounded-full" /> : <Eye className="h-3.5 w-3.5" />}
                                    Preview
                                  </button>
                                  <Menu>
                                    <MenuTrigger asChild disabled={busy === `download:${record.id}`}>
                                      <button className="btn btn-secondary btn-sm" title={`Download contribution receipt – ${record.eventName}`}>
                                        {busy === `download:${record.id}` ? (
                                          <Skeleton className="h-3.5 w-3.5 rounded-full" />
                                        ) : (
                                          <Download className="h-3.5 w-3.5" />
                                        )}
                                        Download <ChevronDown className="h-3 w-3" />
                                      </button>
                                    </MenuTrigger>
                                    <MenuContent>
                                      {RECEIPT_FORMATS.map((format) => (
                                        <MenuItem key={format} onSelect={() => downloadReceipt(record, format)}>
                                          {format.toUpperCase()}
                                        </MenuItem>
                                      ))}
                                    </MenuContent>
                                  </Menu>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination {...contributionPage.pagination} />
              </>
            )}
          </Panel>

          <Panel icon={Calendar} title="Attendance history">
            {attendance.length === 0 ? (
              <EmptyState icon={Calendar} title="No attendance records found" />
            ) : (
              <>
                <div data-lenis-prevent className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Time in</th>
                        <th>Time out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendancePage.pageItems.map((record) => {
                        const { label, chip, icon: Icon } = ATTENDANCE_STATUS[record.status];
                        const attended = record.status !== "absent";
                        return (
                          <tr key={record.id}>
                            <td className="font-medium">{record.eventName}</td>
                            <td className="whitespace-nowrap text-muted">{formatDate(record.date)}</td>
                            <td>
                              <span className={`chip ${chip}`}>
                                <Icon className="h-3.5 w-3.5" /> {label}
                              </span>
                            </td>
                            <td className="whitespace-nowrap text-muted">{attended && record.timeIn ? formatTime12(record.timeIn) : "—"}</td>
                            <td className="whitespace-nowrap text-muted">{attended && record.timeOut ? formatTime12(record.timeOut) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination {...attendancePage.pagination} />
              </>
            )}
          </Panel>

          {volunteers.length > 0 && (
            <Panel
              icon={HeartHandshake}
              title="Event volunteer history"
              subtitle={`Official student volunteer assignments and service records (${volunteers.length})`}
            >
              <div data-lenis-prevent className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Assigned task / role</th>
                      <th>Status</th>
                      <th>Date assigned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {volunteers.map((v) => (
                      <tr key={v.id}>
                        <td className="font-semibold">{v.eventName}</td>
                        <td>
                          <span className="chip chip-brand">
                            <Sparkles className="h-3 w-3" /> {v.roleOrTask}
                          </span>
                        </td>
                        <td>
                          <span className={`chip capitalize ${VOLUNTEER_CHIP[v.status] ?? "chip-neutral"}`}>{v.status || "assigned"}</span>
                        </td>
                        <td className="whitespace-nowrap text-muted">{formatDate(v.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <Panel id="requirement-files" icon={FolderOpen} title="Shared files">
            {files.length === 0 ? (
              <EmptyState icon={FolderOpen} title="No files shared yet" description="Requirement files published by the council will appear here." />
            ) : (
              <div className="grid grid-cols-1 gap-4 px-5 pb-5 md:grid-cols-2 xl:grid-cols-3">
                {files.map((file) => (
                  <div key={file.id} className="card-hover flex flex-col rounded-2xl border border-line bg-surface-2 p-4">
                    <div className="flex items-start gap-3">
                      <div className="icon-tile h-10 w-10">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-ink">{file.title}</p>
                        {file.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{file.description}</p>}
                      </div>
                    </div>
                    <p className="mt-3 flex gap-2 text-xs text-muted">
                      <span className="truncate">{file.fileName}</span>
                      <span className="shrink-0">
                        · <FileSize bytes={file.fileSize} />
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">Published {formatDate(file.updatedAt)}</p>
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      {file.fileUrl ? (
                        <>
                          <button onClick={() => setPreviewFile(file)} className="btn btn-secondary btn-sm" title={`Preview ${file.title}`}>
                            <Eye className="h-4 w-4" /> Preview
                          </button>
                          <DownloadLink file={file} className="btn btn-primary btn-sm" />
                        </>
                      ) : (
                        <span className="chip chip-neutral">
                          <Clock className="h-3.5 w-3.5" /> Still syncing, check back soon
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      <ReceiptViewer receiptUrl={receiptUrl} onClose={() => setReceiptUrl(null)} title="Contribution Receipt" />
      <StudentQrModal student={showQr ? student : null} onClose={() => setShowQr(false)} />
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </Page>
  );
}
