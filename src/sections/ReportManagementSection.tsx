import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CheckCircle, ClipboardCheck, Download, Filter, Receipt, Users, Wallet, XCircle, type LucideIcon } from "lucide-react";
import type { AttendanceRecord, ContributionRecord, Student } from "@/types";
import { attendanceService, contributionsService, eventsService, lscOfficersService, studentsService } from "@/services/db";
import { useLiveData } from "@/hooks/useLiveData";
import { usePagination } from "@/hooks/usePagination";
import { formatPeso, formatTime12, getOrdinalSuffix } from "@/lib/format";
import { contributionStatus } from "@/lib/contributions";
import { activeLscOfficerStudentIds } from "@/lib/lscEligibility";
import { downloadReport, printTable, type Column, type Tone } from "@/lib/printReport";
import DataTable, { type DataColumn } from "@/components/DataTable";
import Page from "@/components/ui/Page";
import Field from "@/components/ui/Field";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import { LoadingCard } from "@/components/ui/Skeleton";

type Status = "Present" | "Excused" | "Absent";
type ReportType = "attendance" | "contribution";
type PayStatus = "paid" | "partial" | "unpaid";

interface ClassRow {
  key: string;
  studentName: string;
  yearLevel: number;
  course: string;
  section: string;
  eventName: string;
}
interface AttendanceRow extends ClassRow {
  status: Status;
  timeIn: string;
  timeOut: string;
}
interface ContributionRow extends ClassRow, Pick<ContributionRecord, "eventId" | "requiredAmount" | "amountPaid" | "remainingBalance"> {
  status: PayStatus;
}

const REPORT_TYPES: Record<ReportType, { label: string; icon: LucideIcon }> = {
  attendance: { label: "Attendance", icon: ClipboardCheck },
  contribution: { label: "Contributions", icon: Wallet },
};
const PAY_STATUS: Record<PayStatus, { label: string; tone: Tone }> = {
  paid: { label: "Fully Paid", tone: "success" },
  partial: { label: "Partial Payment", tone: "warning" },
  unpaid: { label: "Unpaid", tone: "danger" },
};
// Pie colours: brand-blue ramp (dark → light) so the slices stay distinct in both themes.
const STATUS: Record<Status, { color: string; tone: Tone }> = {
  Present: { color: "#007BFF", tone: "success" },
  Excused: { color: "#70B8FF", tone: "accent" },
  Absent: { color: "#B0E0E6", tone: "danger" },
};
const STATUSES = Object.keys(STATUS) as Status[];
const CHIP: Record<Tone, string> = { brand: "chip-brand", accent: "chip-brand", success: "chip-success", warning: "chip-warning", danger: "chip-danger" };
// Best record per student wins: present > excused > absent.
const STATUS_RANK: Record<AttendanceRecord["status"], number> = { present: 2, excuse: 1, absent: 0 };
const CONTRIBUTION_PAGE_SIZE = 30;
const NONE: never[] = [];

const ord = (n: number) => `${n}${getOrdinalSuffix(n)}`;
const slug = (name: string) => name.replace(/\s+/g, "-").toLowerCase();
const uniqueSorted = <T,>(values: T[]) => [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const payStatusOf = (r: Pick<ContributionRecord, "amountPaid" | "remainingBalance">) =>
  (Object.keys(PAY_STATUS) as PayStatus[]).find((s) => PAY_STATUS[s].label === contributionStatus(r).label) ?? "unpaid";

// Shared by the on-screen tables and the printable reports.
const CLASS_COLUMNS: Column<ClassRow>[] = [
  { label: "Student", value: (r) => r.studentName },
  { label: "Year", align: "center", value: (r) => ord(r.yearLevel) },
  { label: "Course", align: "center", value: (r) => r.course },
  { label: "Section", align: "center", value: (r) => r.section },
];
const EVENT_COLUMN: Column<ClassRow> = { label: "Event", value: (r) => r.eventName };
const STATUS_COLUMN: Column<AttendanceRow> = { label: "Status", align: "center", value: (r) => r.status, pill: (r) => STATUS[r.status].tone };
const TIME_COLUMNS: Column<AttendanceRow>[] = [
  { label: "Time in", align: "center", value: (r) => r.timeIn },
  { label: "Time out", align: "center", value: (r) => r.timeOut },
];
const ATTENDANCE_COLUMNS: Column<AttendanceRow>[] = [...CLASS_COLUMNS, STATUS_COLUMN, ...TIME_COLUMNS];
const ATTENDANCE_PRINT_COLUMNS: Column<AttendanceRow>[] = [...CLASS_COLUMNS, STATUS_COLUMN, EVENT_COLUMN, ...TIME_COLUMNS];
const CONTRIBUTION_COLUMNS: Column<ContributionRow>[] = [
  ...CLASS_COLUMNS,
  EVENT_COLUMN,
  { label: "Required", align: "right", value: (r) => formatPeso(r.requiredAmount) },
  { label: "Paid", align: "right", value: (r) => formatPeso(r.amountPaid) },
  { label: "Balance", align: "right", value: (r) => formatPeso(r.remainingBalance) },
  { label: "Payment status", align: "center", value: (r) => PAY_STATUS[r.status].label, pill: (r) => PAY_STATUS[r.status].tone },
];

export default function ReportManagementSection({ onBack }: { onBack: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("attendance");
  const [eventId, setEventId] = useState("");
  const [year, setYear] = useState("");
  const [course, setCourse] = useState("");
  const [section, setSection] = useState("");
  const [payStatus, setPayStatus] = useState<PayStatus | "">("");

  // Every attendance or contribution write (QR scan, manual edit, automatic
  // absent, payment) refetches, so the reports always match their source pages.
  const { data, loading, failed } = useLiveData({
    sources: {
      events: () => eventsService.getAll(),
      students: () => studentsService.getAll(),
      records: () => attendanceService.getAll(),
      officers: () => lscOfficersService.getAll(),
    },
    // Optional so a contribution-data issue can't break the attendance report.
    optional: { contributions: () => contributionsService.getAll() },
    tables: ["attendance", "events", "students", "lsc_officers", "contributions"],
    channel: "report-management",
    onError: () => toast.error("Failed to load data for reports"),
  });
  useEffect(() => {
    if (failed.includes("contributions")) toast.error("Failed to load contribution report data");
  }, [failed]);

  const { events = NONE, students = NONE, records = NONE, officers = NONE, contributions = NONE } = data ?? {};
  // Appointed LSC officers are exempt from attendance and contributions.
  const officerIds = useMemo(() => activeLscOfficerStudentIds(students, officers), [students, officers]);

  // Cascading options: course depends on year, section on year + course.
  const inYear = students.filter((s) => s.yearLevel === Number(year));
  const yearOptions = uniqueSorted(students.map((s) => s.yearLevel));
  const courseOptions = uniqueSorted(inYear.map((s) => s.program));
  const sectionOptions = uniqueSorted(inYear.filter((s) => s.program === course).map((s) => s.section));

  const event = events.find((e) => e.id === eventId) ?? null;
  const complete = !!event && !!year && !!course && !!section;
  const classLabel = `${ord(Number(year))} Year`;

  const rows = useMemo<AttendanceRow[]>(() => {
    if (!complete || !event) return [];
    // Match Attendance Tracking's slice (event + date) so stale rows from a
    // corrected event date can't shadow the current ones.
    const best = new Map<string, AttendanceRecord>();
    for (const r of records) {
      if (r.eventId !== event.id || (event.date && r.date !== event.date)) continue;
      const cur = best.get(r.studentId);
      const diff = cur ? STATUS_RANK[r.status] - STATUS_RANK[cur.status] : 1;
      if (diff > 0 || (diff === 0 && r.timeIn && !cur?.timeIn)) best.set(r.studentId, r);
    }

    return students
      .filter((s) => !officerIds.has(s.id) && s.yearLevel === Number(year) && s.program === course && s.section === section)
      .map((s): AttendanceRow => {
        const r = best.get(s.id);
        const base = { key: s.id, studentName: s.name, yearLevel: s.yearLevel, course: s.program, section: s.section, eventName: event.name };
        if (!r || r.status === "absent") return { ...base, status: "Absent", timeIn: "—", timeOut: "—" };
        // The stored status is authoritative: QR scans write Present, manual edits Present or Excuse.
        return {
          ...base,
          status: r.status === "excuse" ? "Excused" : "Present",
          timeIn: r.timeIn ? formatTime12(r.timeIn) : "—",
          timeOut: r.timeOut ? formatTime12(r.timeOut) : "—",
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [complete, event, records, students, officerIds, year, course, section]);

  const contributionRows = useMemo<ContributionRow[]>(() => {
    const studentById = new Map(students.map((s) => [s.id, s]));
    const recorded = new Set(contributions.map((r) => `${r.studentId}:${r.eventId}`));
    const toRow = (s: Student, r: Pick<ContributionRecord, "eventId" | "eventName" | "requiredAmount" | "amountPaid" | "remainingBalance">): ContributionRow => ({
      ...r,
      key: `${s.id}:${r.eventId}`,
      studentName: s.name,
      yearLevel: s.yearLevel,
      course: s.program,
      section: s.section,
      status: payStatusOf(r),
    });

    // Every persisted record, including ones for events no longer in the catalog…
    const all = contributions.flatMap((r) => {
      const student = studentById.get(r.studentId);
      return student && !officerIds.has(student.id) && r.requiredAmount > 0 ? [toRow(student, r)] : [];
    });
    // …plus a synthetic unpaid row wherever no payment exists yet, so "Unpaid" lists everyone who owes.
    const contributionEvents = events.filter((e) => e.allocationAmount > 0 && !e.isNoContribution);
    for (const student of students) {
      if (officerIds.has(student.id)) continue;
      for (const e of contributionEvents) {
        if (recorded.has(`${student.id}:${e.id}`)) continue;
        all.push(toRow(student, { eventId: e.id, eventName: e.name, requiredAmount: e.allocationAmount, amountPaid: 0, remainingBalance: e.allocationAmount }));
      }
    }

    return all
      .filter(
        (r) =>
          (!eventId || r.eventId === eventId) &&
          (!year || r.yearLevel === Number(year)) &&
          (!course || r.course === course) &&
          (!section || r.section === section) &&
          (!payStatus || r.status === payStatus),
      )
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [contributions, events, students, officerIds, eventId, year, course, section, payStatus]);

  // The unfiltered list is paged; any class or status filter shows every match at once.
  const { pageItems, pagination } = usePagination(contributionRows, CONTRIBUTION_PAGE_SIZE, [eventId, year, course, section, payStatus].join("|"));
  const paginate = !(payStatus || course || section || year);

  const counts: Record<Status, number> = { Present: 0, Excused: 0, Absent: 0 };
  rows.forEach((r) => counts[r.status]++);
  const total = rows.length;
  const percent = total > 0 ? ((counts.Present / total) * 100).toFixed(1) : "0.0";
  const share = (n: number) => (total ? `${Math.round((n / total) * 100)}% of class` : undefined);

  const totals = contributionRows.reduce(
    (t, r) => ({ required: t.required + r.requiredAmount, paid: t.paid + r.amountPaid, balance: t.balance + r.remainingBalance }),
    { required: 0, paid: 0, balance: 0 },
  );

  const isAttendance = reportType === "attendance";
  const canDownload = isAttendance ? complete && total > 0 : contributionRows.length > 0;

  const download = async () => {
    setGenerating(true);
    try {
      if (isAttendance) {
        if (!event) return;
        await downloadReport(`attendance-report-${slug(event.name)}-${year}yr-${course}-${section}.html`, {
          title: "Student Attendance Report",
          kind: "Attendance",
          meta: [["Event", event.name], ["Year Level", classLabel], ["Course", course], ["Section", section]],
          summary: [
            { label: "Total Students", value: total },
            { label: "Total Present", value: counts.Present, tone: "success" },
            { label: "Total Excused", value: counts.Excused, tone: "accent" },
            { label: "Total Absent", value: counts.Absent, tone: "danger" },
            { label: "Attendance", value: `${percent}%`, tone: "brand" },
          ],
          tables: [printTable({ columns: ATTENDANCE_PRINT_COLUMNS, rows })],
        });
        toast.success("Report downloaded.");
      } else {
        await downloadReport(`contribution-report-${slug(event?.name ?? "all-events")}.html`, {
          title: "Student Contribution Report",
          kind: "Contribution",
          meta: [
            ["Event", event?.name ?? "All contribution events"],
            ["Year Level", year ? classLabel : "All year levels"],
            ["Course", course || "All courses"],
            ["Section", section || "All sections"],
            ["Payment Status", payStatus ? PAY_STATUS[payStatus].label : "All payment statuses"],
          ],
          tables: [printTable({ columns: CONTRIBUTION_COLUMNS, rows: contributionRows })],
        });
        toast.success("Contribution report downloaded. Open it in a browser and use Print → Save as PDF to export.");
      }
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error(isAttendance ? "Failed to generate report" : "Failed to generate contribution report");
    } finally {
      setGenerating(false);
    }
  };

  const pick = (attendance: string, contribution: string) => (isAttendance ? attendance : contribution);
  const filters = [
    { label: "Event", value: eventId, set: setEventId, placeholder: pick("Select event", "All events"), options: events.map((e) => [e.id, e.name]) },
    {
      label: "Year",
      value: year,
      set: (v: string) => (setYear(v), setCourse(""), setSection("")),
      placeholder: pick("Select year", "All years"),
      options: yearOptions.map((y) => [String(y), `${ord(y)} Year`]),
    },
    {
      label: "Course",
      value: course,
      set: (v: string) => (setCourse(v), setSection("")),
      placeholder: !year ? "Select year first" : pick("Select course", "All courses"),
      options: courseOptions.map((c) => [c, c]),
      disabled: !year,
    },
    {
      label: "Section",
      value: section,
      set: setSection,
      placeholder: !course ? "Select course first" : pick("Select section", "All sections"),
      options: sectionOptions.map((s) => [s, s]),
      disabled: !course,
    },
    ...(isAttendance
      ? []
      : [
          {
            label: "Payment status",
            value: payStatus,
            set: (v: string) => setPayStatus(v as PayStatus | ""),
            placeholder: "All statuses",
            options: Object.entries(PAY_STATUS).map(([value, { label }]) => [value, label]),
          },
        ]),
  ];

  return (
    <Page
      eyebrow="Reports"
      title={pick("Attendance Reports", "Contribution Reports")}
      subtitle={pick(
        "Generate official attendance reports per event and class, ready to print.",
        "Review student contribution records by payment status, ready to print.",
      )}
      onBack={onBack}
      actions={
        !loading &&
        canDownload && (
          <button onClick={download} disabled={generating} className="btn btn-primary">
            <Download className="h-4 w-4" />
            {generating ? "Generating…" : "Download printable report"}
          </button>
        )
      }
      hero={
        <div role="tablist" aria-label="Report type" className="glass inline-flex flex-wrap gap-1 rounded-full p-1">
          {(Object.keys(REPORT_TYPES) as ReportType[]).map((key) => {
            const { icon: Icon, label } = REPORT_TYPES[key];
            const active = key === reportType;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={() => setReportType(key)}
                className={`btn ${active ? "bg-white text-brand-700 shadow-soft" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            );
          })}
        </div>
      }
    >
      {loading ? (
        <LoadingCard label={pick("Loading report data…", "Loading contribution report…")} />
      ) : (
        <>
          <div className="card p-5 lg:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="icon-tile"><Filter className="h-5 w-5" /></span>
              <div>
                <h2 className="font-bold text-ink">Report filters</h2>
                <p className="text-xs text-muted">{pick("Pick an event and a class to build the report.", "Narrow the contribution records, or leave blank to see all.")}</p>
              </div>
            </div>
            <div className={`grid gap-4 sm:grid-cols-2 ${isAttendance ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}>
              {filters.map((f) => (
                <Field key={f.label} label={f.label}>
                  <select className="input" value={f.value} onChange={(e) => f.set(e.target.value)} disabled={f.disabled}>
                    <option value="">{f.placeholder}</option>
                    {f.options.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
          </div>

          {!isAttendance ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  featured
                  label="Records"
                  value={contributionRows.length}
                  icon={Receipt}
                  hint={`${contributionRows.filter((r) => r.status === "paid").length} fully paid`}
                />
                <StatCard label="Required" value={formatPeso(totals.required)} icon={Wallet} />
                <StatCard label="Paid" value={formatPeso(totals.paid)} icon={CheckCircle} tone="success" />
                <StatCard label="Balance" value={formatPeso(totals.balance)} icon={XCircle} tone="danger" />
              </div>

              <TableCard title="Contribution records" subtitle="Contribution records matching the selected filters">
                {contributionRows.length === 0 ? (
                  <EmptyState icon={Users} title="No contribution records" description="No contribution records match the selected filters." />
                ) : (
                  <ReportTable columns={CONTRIBUTION_COLUMNS} rows={paginate ? pageItems : contributionRows} />
                )}
                {paginate && <Pagination {...pagination} />}
              </TableCard>
            </>
          ) : !complete ? (
            <div className="card">
              <EmptyState icon={Filter} title="Choose your filters" description="Select an event, year, course and section above to generate an attendance report." />
            </div>
          ) : total === 0 ? (
            <div className="card">
              <EmptyState icon={Users} title="No students found" description="No students match the selected year, course and section." />
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="card flex items-center gap-5 p-5">
                  <div className="relative h-36 w-36 shrink-0">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={STATUSES.map((s) => ({ name: s, value: counts[s] }))} dataKey="value" innerRadius="70%" outerRadius="100%" paddingAngle={2} stroke="none">
                          {STATUSES.map((s) => <Cell key={s} fill={STATUS[s].color} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                      <div>
                        <p className="text-xl font-extrabold text-ink">{percent}%</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Present</p>
                      </div>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {STATUSES.map((s) => (
                      <li key={s} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS[s].color }} />
                        <span className="text-muted">{s}</span>
                        <b className="text-ink">{counts[s]}</b>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
                  <StatCard featured label="Total students" value={total} icon={Users} hint={`${event?.name} · ${classLabel} ${course}-${section}`} />
                  <StatCard label="Present" value={counts.Present} icon={CheckCircle} tone="success" hint={share(counts.Present)} />
                  <StatCard label="Excused" value={counts.Excused} icon={ClipboardCheck} hint={share(counts.Excused)} />
                  <StatCard label="Absent" value={counts.Absent} icon={XCircle} tone="danger" hint={share(counts.Absent)} />
                </div>
              </div>

              <TableCard title="Attendance records" subtitle={`${event?.name} — ${classLabel} · ${course} · Section ${section}`}>
                <ReportTable columns={ATTENDANCE_COLUMNS} rows={rows} />
              </TableCard>
            </>
          )}
        </>
      )}
    </Page>
  );
}

function TableCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4">
        <h2 className="font-bold text-ink">{title}</h2>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

/** On-screen rendering of the same columns the printable report uses. */
function ReportTable<T extends ClassRow>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  const screenColumns = columns.map(
    (c, i): DataColumn<T> => ({
      header: c.label,
      right: c.align === "right",
      className: i === 0 ? "font-semibold" : c.align ? "whitespace-nowrap tabular-nums text-muted" : "text-muted",
      cell: (row) => (c.pill ? <span className={`chip whitespace-nowrap ${CHIP[c.pill(row)]}`}>{c.value(row)}</span> : c.value(row)),
    }),
  );
  return <DataTable columns={screenColumns} rows={rows} rowKey={(row) => row.key} />;
}
