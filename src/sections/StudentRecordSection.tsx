import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Calendar, CalendarDays, CheckCircle, ChevronDown, Clock, Download, Eye, FileText, FolderOpen, HeartHandshake, PieChart, Sparkles, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { AttendanceRecord, ContributionRecord, Event, EventVolunteer, PaymentRecord, Student, StudentRequirementFile, UserRole } from "@/types";
import { attendanceService, contributionsService, eventVolunteersService, eventsService, paymentsService, studentRequirementFilesService } from "@/services/db";
import { useLiveData } from "@/hooks/useLiveData";
import { usePagination } from "@/hooks/usePagination";
import { createContributionReceiptPreview, downloadContributionReceipt, officialReceiptNumber, type ReceiptFormat } from "@/lib/receipts";
import { formatDate, formatPeso, formatTime12, today } from "@/lib/format";
import { calculateContributionTotals, contributionStatus } from "@/lib/contributions";
import { calendarDateInTimeZone } from "@/lib/attendance";
import ReceiptViewer from "@/components/ReceiptViewer";
import RecordHero, { VolunteerStatus } from "@/components/RecordHero";
import { EventCard } from "@/components/UpcomingEvents";
import { DownloadLink, FilePreviewModal, FileSize } from "@/components/FilePreview";
import DataTable, { type DataColumn } from "@/components/DataTable";
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

const NONE: never[] = [];

const ATTENDANCE_COLUMNS: DataColumn<AttendanceRecord>[] = [
  { header: "Event", cell: (r) => r.eventName, className: "font-medium" },
  { header: "Date", cell: (r) => formatDate(r.date), className: "whitespace-nowrap text-muted" },
  {
    header: "Status",
    cell: (r) => {
      const { label, chip, icon: Icon } = ATTENDANCE_STATUS[r.status];
      return (
        <span className={`chip ${chip}`}>
          <Icon className="h-3.5 w-3.5" /> {label}
        </span>
      );
    },
  },
  ...(["timeIn", "timeOut"] as const).map(
    (key): DataColumn<AttendanceRecord> => ({
      header: key === "timeIn" ? "Time in" : "Time out",
      cell: (r) => (r.status !== "absent" && r[key] ? formatTime12(r[key]) : "—"),
      className: "whitespace-nowrap text-muted",
    }),
  ),
];

const VOLUNTEER_COLUMNS: DataColumn<EventVolunteer>[] = [
  { header: "Event", cell: (v) => v.eventName, className: "font-semibold" },
  {
    header: "Assigned task / role",
    cell: (v) => (
      <span className="chip chip-brand">
        <Sparkles className="h-3 w-3" /> {v.roleOrTask}
      </span>
    ),
  },
  { header: "Status", cell: (v) => <VolunteerStatus status={v.status} /> },
  { header: "Date assigned", cell: (v) => formatDate(v.createdAt), className: "whitespace-nowrap text-muted" },
];
/** How each source is named in the "could not be loaded" notice. */
const SOURCE_LABEL: Record<string, string> = {
  attendance: "attendance",
  contributions: "contributions",
  events: "event catalog",
  payments: "payments",
  files: "requirement files",
  volunteers: "volunteer activities",
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
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<StudentRequirementFile | null>(null);
  /** `${action}:${recordId}` of the receipt action in progress. */
  const [busy, setBusy] = useState<string | null>(null);

  // Every section is optional: a project without the requirements RPC or newer
  // event columns still shows every independent query that succeeds, and
  // realtime refreshes mean no change for this student is silently missed.
  const { data, loading, failed } = useLiveData({
    sources: {},
    optional: {
      attendance: () => attendanceService.getByStudentId(student.id),
      contributions: () => contributionsService.getByStudentId(student.id),
      events: () => eventsService.getAll(),
      payments: () => paymentsService.getByStudentId(student.id),
      files: () => studentRequirementFilesService.getVisibleForStudent(student.id),
      volunteers: () => eventVolunteersService.getByStudentId(student.id),
    },
    tables: ["attendance", "contributions", "payments", "events", "event_volunteers", "student_requirement_files"],
    channel: `student-record-${student.id}`,
    deps: [student.id],
  });
  useEffect(() => {
    if (failed.length > 0) toast.error(`Some student record details could not be loaded: ${failed.map((key) => SOURCE_LABEL[key]).join(", ")}.`);
  }, [failed]);

  const { attendance = NONE, contributions: records = NONE, events = NONE, payments = NONE, files = NONE, volunteers = NONE } = data ?? {};
  const contributions = useMemo(() => withUnpaidEvents(student.id, records, events), [student.id, records, events]);
  // Derived from this catalog read: a separate upcoming-events request would
  // fire before the shared cache is populated.
  const incoming = useMemo(() => upcomingEvents(events), [events]);

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

  const spinnerOr = (key: string, icon: ReactNode) => (busy === key ? <Skeleton className="h-3.5 w-3.5 rounded-full" /> : icon);
  const contributionColumns: DataColumn<ContributionRecord>[] = [
    { header: "Event", cell: (r) => r.eventName, className: "font-medium" },
    {
      header: "Paid",
      className: "whitespace-nowrap",
      cell: (r) => (
        <>
          <span className="font-semibold">{formatPeso(r.amountPaid)}</span>
          <span className="block text-xs text-muted">of {formatPeso(r.requiredAmount)}</span>
        </>
      ),
    },
    { header: "Balance", cell: (r) => formatPeso(r.remainingBalance), className: "whitespace-nowrap text-muted" },
    { header: "Status", cell: (r) => <span className={contributionStatus(r).className}>{contributionStatus(r).label}</span> },
    {
      header: "Receipt",
      right: true,
      // Receipts exist only once something has actually been paid.
      cell: (r) =>
        r.amountPaid > 0 && (
          <div className="flex justify-end gap-1.5">
            <button onClick={() => previewReceipt(r)} disabled={busy === `preview:${r.id}`} className="btn btn-ghost btn-sm" title={`Preview contribution receipt – ${r.eventName}`}>
              {spinnerOr(`preview:${r.id}`, <Eye className="h-3.5 w-3.5" />)}
              Preview
            </button>
            <Menu>
              <MenuTrigger asChild disabled={busy === `download:${r.id}`}>
                <button className="btn btn-secondary btn-sm" title={`Download contribution receipt – ${r.eventName}`}>
                  {spinnerOr(`download:${r.id}`, <Download className="h-3.5 w-3.5" />)}
                  Download <ChevronDown className="h-3 w-3" />
                </button>
              </MenuTrigger>
              <MenuContent>
                {RECEIPT_FORMATS.map((format) => (
                  <MenuItem key={format} onSelect={() => downloadReceipt(r, format)}>
                    {format.toUpperCase()}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </div>
        ),
    },
  ];

  return (
    <Page
      eyebrow="Student record"
      title="Your council record"
      subtitle="Attendance, contributions, receipts and shared files — all in one place."
      onBack={onBack}
      hero={
        <RecordHero
          student={student}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          qrTitle="Download your attendance QR code (Student ID, Name, Program, Year, Section)"
          chips={
            volunteers.length > 0 && (
              <span className="chip bg-powder/20 text-powder">
                <HeartHandshake className="h-3.5 w-3.5" /> {volunteers.length} volunteer role{volunteers.length === 1 ? "" : "s"}
              </span>
            )
          }
        />
      }
    >
      {loading ? (
        <LoadingCard rows={6} label="Loading student records…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
                <DataTable columns={contributionColumns} rows={contributionPage.pageItems} rowKey={(r) => r.id} />
                <Pagination {...contributionPage.pagination} />
              </>
            )}
          </Panel>

          <Panel icon={Calendar} title="Attendance history">
            {attendance.length === 0 ? (
              <EmptyState icon={Calendar} title="No attendance records found" />
            ) : (
              <>
                <DataTable columns={ATTENDANCE_COLUMNS} rows={attendancePage.pageItems} rowKey={(r) => r.id} />
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
              <DataTable columns={VOLUNTEER_COLUMNS} rows={volunteers} rowKey={(v) => v.id} />
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
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </Page>
  );
}
