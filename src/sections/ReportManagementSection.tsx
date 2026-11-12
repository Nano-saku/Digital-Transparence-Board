import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CheckCircle, ClipboardCheck, Download, Filter, Receipt, Users, Wallet, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AttendanceRecord, ContributionRecord, Event, Student } from "@/types";
import { attendanceService, contributionsService, eventsService, lscOfficersService, studentsService } from "@/services/db";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { usePagination } from "@/hooks/usePagination";
import { formatPeso, formatTime12, getOrdinalSuffix } from "@/lib/format";
import { contributionStatus } from "@/lib/contributions";
import { activeLscOfficerStudentIds } from "@/lib/lscEligibility";
import { blobToDataUri, downloadBlob } from "@/lib/receipts";
import Page from "@/components/ui/Page";
import Field from "@/components/ui/Field";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import { LoadingCard } from "@/components/ui/Skeleton";

type Status = "Present" | "Excused" | "Absent";
type ReportType = "attendance" | "contribution";
type PayStatus = "unpaid" | "partial" | "paid";

interface ReportRow {
  studentName: string;
  yearLevel: number;
  course: string;
  section: string;
  status: Status;
  eventName: string;
  timeIn: string;
  timeOut: string;
}

interface ContributionRow {
  studentName: string;
  studentId: string;
  eventId: string;
  yearLevel: number;
  course: string;
  section: string;
  eventName: string;
  requiredAmount: number;
  amountPaid: number;
  remainingBalance: number;
  status: string;
  statusClass: string;
  statusValue: PayStatus;
}

const REPORT_TYPES: Record<ReportType, { label: string; icon: LucideIcon }> = {
  attendance: { label: "Attendance", icon: ClipboardCheck },
  contribution: { label: "Contributions", icon: Wallet },
};
const PAY_STATUS: Record<PayStatus, string> = { paid: "Fully Paid", partial: "Partial Payment", unpaid: "Unpaid" };
const PAY_VALUE: Record<string, PayStatus> = { "Fully Paid": "paid", "Partial Payment": "partial", Unpaid: "unpaid" };
const CONTRIBUTION_PAGE_SIZE = 30;

// Brand-blue ramp (dark → light) so the three slices stay distinct in both themes.
const STATUS_COLOR: Record<Status, string> = { Present: "#007BFF", Excused: "#70B8FF", Absent: "#B0E0E6" };
const STATUS_CHIP: Record<Status, string> = { Present: "chip-success", Excused: "chip-brand", Absent: "chip-danger" };
// Best record per student wins: present > excused > absent.
const STATUS_RANK: Record<AttendanceRecord["status"], number> = { present: 2, excuse: 1, absent: 0 };

const ord = (n: number) => `${n}${getOrdinalSuffix(n)}`;
const uniqueSorted = <T,>(values: T[]) => [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export default function ReportManagementSection({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [contributionLoading, setContributionLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [contributions, setContributions] = useState<ContributionRecord[]>([]);
  const [officerIds, setOfficerIds] = useState<Set<string>>(() => new Set());
  const [reportType, setReportType] = useState<ReportType>("attendance");
  const [eventId, setEventId] = useState("");
  const [year, setYear] = useState("");
  const [course, setCourse] = useState("");
  const [section, setSection] = useState("");
  const [payStatus, setPayStatus] = useState<PayStatus | "">("");

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [e, s, a, officers] = await Promise.all([
        eventsService.getAll(),
        studentsService.getAll(),
        attendanceService.getAll(),
        lscOfficersService.getAll(),
      ]);
      setEvents(e);
      setStudents(s);
      setRecords(a);
      // Appointed LSC officers are exempt from attendance and contributions.
      setOfficerIds(activeLscOfficerStudentIds(s, officers));
    } catch (error) {
      console.error("Error loading report data:", error);
      toast.error("Failed to load data for reports");
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Every attendance write (QR scan, manual edit, automatic absent) refetches,
  // so the report always matches Attendance Tracking.
  useRealtimeSync({
    tables: ["attendance", "events", "students", "lsc_officers"],
    onChange: () => loadData(false),
    channelPrefix: "report-management",
  });

  // Loaded independently so a contribution-data issue can't break the attendance report.
  useEffect(() => {
    contributionsService
      .getAll()
      .then(setContributions)
      .catch((error) => {
        console.error("Error loading contribution report data:", error);
        toast.error("Failed to load contribution report data");
      })
      .finally(() => setContributionLoading(false));
  }, []);

  // Cascading options: course depends on year, section on year + course.
  const inYear = students.filter((s) => s.yearLevel === Number(year));
  const yearOptions = uniqueSorted(students.map((s) => s.yearLevel));
  const courseOptions = uniqueSorted(inYear.map((s) => s.program));
  const sectionOptions = uniqueSorted(inYear.filter((s) => s.program === course).map((s) => s.section));

  const event = events.find((e) => e.id === eventId) ?? null;
  const complete = !!event && !!year && !!course && !!section;

  const rows = useMemo<ReportRow[]>(() => {
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
      .map((s): ReportRow => {
        const r = best.get(s.id);
        const base = { studentName: s.name, yearLevel: s.yearLevel, course: s.program, section: s.section, eventName: event.name };
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
    const toRow = (student: Student, r: Pick<ContributionRecord, "eventId" | "eventName" | "requiredAmount" | "amountPaid" | "remainingBalance">): ContributionRow => {
      const status = contributionStatus(r);
      return {
        eventId: r.eventId,
        eventName: r.eventName,
        requiredAmount: r.requiredAmount,
        amountPaid: r.amountPaid,
        remainingBalance: r.remainingBalance,
        studentName: student.name,
        studentId: student.studentId,
        yearLevel: student.yearLevel,
        course: student.program,
        section: student.section,
        status: status.label,
        statusClass: status.className,
        statusValue: PAY_VALUE[status.label],
      };
    };

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
        all.push(
          toRow(student, { eventId: e.id, eventName: e.name, requiredAmount: e.allocationAmount, amountPaid: 0, remainingBalance: e.allocationAmount }),
        );
      }
    }

    return all
      .filter(
        (r) =>
          (!eventId || r.eventId === eventId) &&
          (!year || r.yearLevel === Number(year)) &&
          (!course || r.course === course) &&
          (!section || r.section === section) &&
          (!payStatus || r.statusValue === payStatus),
      )
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [contributions, events, students, officerIds, eventId, year, course, section, payStatus]);

  // The unfiltered list is paged; any class or status filter shows every match at once.
  const { pageItems, pagination } = usePagination(contributionRows, CONTRIBUTION_PAGE_SIZE);
  const paginate = !(payStatus || course || section || year);
  const visibleContributionRows = paginate ? pageItems : contributionRows;

  const counts: Record<Status, number> = { Present: 0, Excused: 0, Absent: 0 };
  rows.forEach((r) => counts[r.status]++);
  const total = rows.length;
  const percent = total > 0 ? ((counts.Present / total) * 100).toFixed(1) : "0.0";
  const share = (n: number) => (total ? `${Math.round((n / total) * 100)}% of class` : undefined);

  const totals = contributionRows.reduce(
    (t, r) => ({ required: t.required + r.requiredAmount, paid: t.paid + r.amountPaid, balance: t.balance + r.remainingBalance }),
    { required: 0, paid: 0, balance: 0 },
  );
  const fullyPaid = contributionRows.filter((r) => r.statusValue === "paid").length;

  const isAttendance = reportType === "attendance";
  const busy = loading || (!isAttendance && contributionLoading);
  const canDownload = isAttendance ? complete && total > 0 : contributionRows.length > 0;

  const download = async () => {
    setGenerating(true);
    try {
      const logos = await Promise.all(["/lsc-logo.jpg", "/DSSC-logo.png"].map(imageDataUri));
      if (isAttendance) {
        if (!event) return;
        const html = buildReportHtml(logos, {
          eventName: esc(event.name),
          yearLabel: `${ord(Number(year))} Year`,
          course: esc(course),
          section: esc(section),
          total,
          counts,
          percent,
          rows,
        });
        const safeName = event.name.replace(/\s+/g, "-").toLowerCase();
        downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `attendance-report-${safeName}-${year}yr-${course}-${section}.html`);
        toast.success("Report downloaded.");
      } else {
        const html = buildContributionReportHtml(logos, {
          eventFilter: esc(event?.name ?? "All contribution events"),
          yearFilter: year ? `${ord(Number(year))} Year` : "All year levels",
          courseFilter: esc(course || "All courses"),
          sectionFilter: esc(section || "All sections"),
          statusFilter: payStatus ? PAY_STATUS[payStatus] : "All payment statuses",
          rows: contributionRows,
        });
        const safeName = (event?.name ?? "all-events").replace(/\s+/g, "-").toLowerCase();
        downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `contribution-report-${safeName}.html`);
        toast.success("Contribution report downloaded. Open it in a browser and use Print → Save as PDF to export.");
      }
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error(isAttendance ? "Failed to generate report" : "Failed to generate contribution report");
    } finally {
      setGenerating(false);
    }
  };

  const filters = [
    {
      label: "Event",
      value: eventId,
      set: setEventId,
      placeholder: isAttendance ? "Select event" : "All events",
      options: events.map((e) => [e.id, e.name]),
    },
    {
      label: "Year",
      value: year,
      set: (v: string) => {
        setYear(v);
        setCourse("");
        setSection("");
      },
      placeholder: isAttendance ? "Select year" : "All years",
      options: yearOptions.map((y) => [String(y), `${ord(y)} Year`]),
    },
    {
      label: "Course",
      value: course,
      set: (v: string) => {
        setCourse(v);
        setSection("");
      },
      placeholder: !year ? "Select year first" : isAttendance ? "Select course" : "All courses",
      options: courseOptions.map((c) => [c, c]),
      disabled: !year,
    },
    {
      label: "Section",
      value: section,
      set: setSection,
      placeholder: !course ? "Select course first" : isAttendance ? "Select section" : "All sections",
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
            options: Object.entries(PAY_STATUS),
          },
        ]),
  ];

  return (
    <Page
      eyebrow="Reports"
      title={isAttendance ? "Attendance Reports" : "Contribution Reports"}
      subtitle={
        isAttendance
          ? "Generate official attendance reports per event and class, ready to print."
          : "Review student contribution records by payment status, ready to print."
      }
      onBack={onBack}
      actions={
        !busy &&
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
      {busy ? (
        <LoadingCard label={isAttendance ? "Loading report data…" : "Loading contribution report…"} />
      ) : (
        <>
          <div className="card p-5 lg:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="icon-tile"><Filter className="h-5 w-5" /></span>
              <div>
                <h2 className="font-bold text-ink">Report filters</h2>
                <p className="text-xs text-muted">
                  {isAttendance ? "Pick an event and a class to build the report." : "Narrow the contribution records, or leave blank to see all."}
                </p>
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
                <StatCard featured label="Records" value={contributionRows.length} icon={Receipt} hint={`${fullyPaid} fully paid`} />
                <StatCard label="Required" value={formatPeso(totals.required)} icon={Wallet} />
                <StatCard label="Paid" value={formatPeso(totals.paid)} icon={CheckCircle} tone="success" />
                <StatCard label="Balance" value={formatPeso(totals.balance)} icon={XCircle} tone="danger" />
              </div>

              <div className="card overflow-hidden">
                <div className="px-5 py-4">
                  <h2 className="font-bold text-ink">Contribution records</h2>
                  <p className="text-xs text-muted">Contribution records matching the selected filters</p>
                </div>
                {contributionRows.length === 0 ? (
                  <EmptyState icon={Users} title="No contribution records" description="No contribution records match the selected filters." />
                ) : (
                  <div data-lenis-prevent className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Year</th>
                          <th>Course</th>
                          <th>Section</th>
                          <th>Event</th>
                          <th className="text-right">Required</th>
                          <th className="text-right">Paid</th>
                          <th className="text-right">Balance</th>
                          <th>Payment status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleContributionRows.map((r) => (
                          <tr key={`${r.studentId}-${r.eventId}`}>
                            <td className="font-semibold">{r.studentName}</td>
                            <td className="text-muted">{ord(r.yearLevel)}</td>
                            <td className="text-muted">{r.course}</td>
                            <td className="text-muted">{r.section}</td>
                            <td className="text-muted">{r.eventName}</td>
                            <td className="whitespace-nowrap text-right tabular-nums text-muted">{formatPeso(r.requiredAmount)}</td>
                            <td className="whitespace-nowrap text-right tabular-nums text-muted">{formatPeso(r.amountPaid)}</td>
                            <td className="whitespace-nowrap text-right tabular-nums text-muted">{formatPeso(r.remainingBalance)}</td>
                            <td><span className={`${r.statusClass} whitespace-nowrap`}>{r.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {paginate && <Pagination {...pagination} />}
              </div>
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
                        <Pie
                          data={(Object.keys(counts) as Status[]).map((s) => ({ name: s, value: counts[s] }))}
                          dataKey="value"
                          innerRadius="70%"
                          outerRadius="100%"
                          paddingAngle={2}
                          stroke="none"
                        >
                          {(Object.keys(counts) as Status[]).map((s) => <Cell key={s} fill={STATUS_COLOR[s]} />)}
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
                    {(Object.keys(counts) as Status[]).map((s) => (
                      <li key={s} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                        <span className="text-muted">{s}</span>
                        <b className="text-ink">{counts[s]}</b>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
                  <StatCard featured label="Total students" value={total} icon={Users} hint={`${event?.name} · ${ord(Number(year))} Year ${course}-${section}`} />
                  <StatCard label="Present" value={counts.Present} icon={CheckCircle} tone="success" hint={share(counts.Present)} />
                  <StatCard label="Excused" value={counts.Excused} icon={ClipboardCheck} hint={share(counts.Excused)} />
                  <StatCard label="Absent" value={counts.Absent} icon={XCircle} tone="danger" hint={share(counts.Absent)} />
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="px-5 py-4">
                  <h2 className="font-bold text-ink">Attendance records</h2>
                  <p className="text-xs text-muted">
                    {event?.name} — {ord(Number(year))} Year · {course} · Section {section}
                  </p>
                </div>
                <div data-lenis-prevent className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Year</th>
                        <th>Course</th>
                        <th>Section</th>
                        <th>Status</th>
                        <th>Time in</th>
                        <th>Time out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td className="font-semibold">{r.studentName}</td>
                          <td className="text-muted">{ord(r.yearLevel)}</td>
                          <td className="text-muted">{r.course}</td>
                          <td className="text-muted">{r.section}</td>
                          <td><span className={`chip ${STATUS_CHIP[r.status]}`}>{r.status}</span></td>
                          <td className="whitespace-nowrap text-muted">{r.timeIn}</td>
                          <td className="whitespace-nowrap text-muted">{r.timeOut}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}

const esc = (v: string) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Fetches an image and inlines it so the downloaded report is self-contained. */
async function imageDataUri(url: string): Promise<string> {
  return blobToDataUri(await (await fetch(url)).blob());
}

// @page margin 0 hides the browser's own print header/footer (URL, date);
// the body padding restores the page margins instead.
const PRINT_BASE = `
  @page{size:landscape;margin:0}
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:0;padding:20px 28px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .header{display:flex;align-items:center;justify-content:center;gap:20px;border-bottom:3px solid #1b2e8c;padding-bottom:12px}
  .header img{width:70px;height:70px;object-fit:contain}.title{text-align:center}.org{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1.8px}.title h1{font-size:22px;color:#1b2e8c;margin:3px 0;font-weight:800}.sub{font-size:11px;color:#6b7280}
  .metadata{display:grid;grid-template-columns:1fr 1fr;gap:7px 30px;margin:16px 0;font-size:13px}.label{font-weight:700;color:#374151;display:inline-block;min-width:105px}
  thead tr{background:#1b2e8c;color:#fff}.center{text-align:center}.odd{background:#f9fafb}.even{background:#fff}
  footer{display:flex;justify-content:space-between;margin-top:18px;padding-top:9px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px}@media print{body{padding:12mm 10mm}}`;

function printDocument([lscLogo, dsscLogo]: string[], title: string, kind: string, styles: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>${title}</title>
<style>${PRINT_BASE}${styles}</style></head><body>
  <header class="header"><img src="${lscLogo}" alt="LSC logo"/><div class="title"><div class="org">Local Student Council · DSSC Santa Cruz</div><h1>${title}</h1><div class="sub">Official ${kind} Record for Verification and Filing</div></div><img src="${dsscLogo}" alt="DSSC logo"/></header>
  ${body}
  <footer><span>Generated ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}</span><span>Digital Transparency Board — LSC · DSSC Santa Cruz</span></footer>
</body></html>`;
}

const meta = (pairs: [string, string][]) =>
  `<section class="metadata">${pairs.map(([label, value]) => `<div><span class="label">${label}:</span>${value}</div>`).join("")}</section>`;

interface PrintableReport {
  eventName: string;
  yearLabel: string;
  course: string;
  section: string;
  total: number;
  counts: Record<Status, number>;
  percent: string;
  rows: ReportRow[];
}

/** Self-contained landscape attendance document for browser Print → Save as PDF. */
function buildReportHtml(logos: string[], r: PrintableReport): string {
  const tableRows = r.rows
    .map(
      (row, i) => `<tr class="${i % 2 ? "odd" : "even"}"><td>${esc(row.studentName)}</td><td class="center">${ord(row.yearLevel)}</td><td class="center">${esc(row.course)}</td><td class="center">${esc(row.section)}</td><td class="center"><span class="s-${row.status.toLowerCase()}">${row.status}</span></td><td>${esc(row.eventName)}</td><td class="center">${row.timeIn}</td><td class="center">${row.timeOut}</td></tr>`,
    )
    .join("");
  const card = (value: string | number, caption: string, cls = "") =>
    `<div class="card"><div class="number ${cls}">${value}</div><div class="caption">${caption}</div></div>`;
  const styles = `
  .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:14px 0 18px}.card{border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;padding:9px;text-align:center}.number{font-weight:800;font-size:21px}.caption{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.8px;margin-top:2px}.present{color:#047857}.excused{color:#7e22ce}.absent{color:#b91c1c}.percent{color:#1b2e8c}
  table{width:100%;border-collapse:collapse;font-size:12px}th{padding:8px 9px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}td{padding:7px 9px;border-bottom:1px solid #e5e7eb}
  .s-present,.s-absent,.s-excused{padding:2px 9px;border-radius:999px;font-size:10px;font-weight:700}.s-present{background:#d1fae5;color:#047857}.s-absent{background:#fee2e2;color:#b91c1c}.s-excused{background:#f3e8ff;color:#7e22ce}`;

  return printDocument(
    logos,
    "Student Attendance Report",
    "Attendance",
    styles,
    `${meta([["Event", r.eventName], ["Year Level", r.yearLabel], ["Course", r.course], ["Section", r.section]])}
  <section class="summary">${card(r.total, "Total Students")}${card(r.counts.Present, "Total Present", "present")}${card(r.counts.Excused, "Total Excused", "excused")}${card(r.counts.Absent, "Total Absent", "absent")}${card(`${r.percent}%`, "Attendance", "percent")}</section>
  <table><thead><tr><th>Student</th><th class="center">Year</th><th class="center">Course</th><th class="center">Section</th><th class="center">Status</th><th>Event</th><th class="center">Time In</th><th class="center">Time Out</th></tr></thead><tbody>${tableRows}</tbody></table>`,
  );
}

interface PrintableContributionReport {
  eventFilter: string;
  yearFilter: string;
  courseFilter: string;
  sectionFilter: string;
  statusFilter: string;
  rows: ContributionRow[];
}

/** Self-contained landscape contribution document for browser Print → Save as PDF. */
function buildContributionReportHtml(logos: string[], r: PrintableContributionReport): string {
  const tableRows = r.rows
    .map(
      (row, i) => `<tr class="${i % 2 ? "odd" : "even"}"><td>${esc(row.studentName)}</td><td class="center">${ord(row.yearLevel)}</td><td class="center">${esc(row.course)}</td><td class="center">${esc(row.section)}</td><td>${esc(row.eventName)}</td><td class="amount">${formatPeso(row.requiredAmount)}</td><td class="amount">${formatPeso(row.amountPaid)}</td><td class="amount">${formatPeso(row.remainingBalance)}</td><td class="center"><span class="s-${row.statusValue}">${row.status}</span></td></tr>`,
    )
    .join("");
  const styles = `
  table{width:100%;border-collapse:collapse;font-size:11px}th{padding:8px 7px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.4px}td{padding:7px;border-bottom:1px solid #e5e7eb}.amount{text-align:right;white-space:nowrap}
  .s-paid{background:#d1fae5;color:#047857}.s-partial{background:#fef3c7;color:#b45309}.s-unpaid{background:#fee2e2;color:#b91c1c}.s-paid,.s-partial,.s-unpaid{padding:2px 7px;border-radius:999px;font-size:9px;font-weight:700;white-space:nowrap}`;

  return printDocument(
    logos,
    "Student Contribution Report",
    "Contribution",
    styles,
    `${meta([["Event", r.eventFilter], ["Year Level", r.yearFilter], ["Course", r.courseFilter], ["Section", r.sectionFilter], ["Payment Status", r.statusFilter]])}
  <table><thead><tr><th>Student</th><th class="center">Year</th><th class="center">Course</th><th class="center">Section</th><th>Event</th><th class="amount">Required</th><th class="amount">Paid</th><th class="amount">Balance</th><th class="center">Payment Status</th></tr></thead><tbody>${tableRows}</tbody></table>`,
  );
}
