import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FileText,
  Download,
  Loader2,
  Users,
  CheckCircle,
  Clock,
  XCircle,
  Filter,
} from "lucide-react";
import {
  eventsService,
  studentsService,
  attendanceService,
} from "@/services/db";
import type { Event, Student, AttendanceRecord } from "@/types";
import { compareTime24, formatTime12, getOrdinalSuffix } from "@/lib/format";
import { downloadBlob } from "@/lib/receipts";
import SectionLoader from "@/components/SectionLoader";
import SectionEmptyState from "@/components/SectionEmptyState";
import SectionLayout from "@/components/common/SectionLayout";
import SummaryCard from "@/components/common/SummaryCard";
import { toast } from "sonner";

interface ReportManagementSectionProps {
  onBack: () => void;
}

interface ReportRow {
  studentName: string;
  yearLevel: number;
  course: string;
  section: string;
  status: "Present" | "Late" | "Absent";
  eventName: string;
  timeIn: string;
  timeOut: string;
}

/** Converts a Blob to a base64 data URI. */
function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

export default function ReportManagementSection({
  onBack,
}: ReportManagementSectionProps) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [events, setEvents] = useState<Event[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);

  // Filters
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedSection, setSelectedSection] = useState("");

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [eventsData, studentsData, attendanceData] = await Promise.all([
        eventsService.getAll(),
        studentsService.getAll(),
        attendanceService.getAll(),
      ]);
      setEvents(eventsData);
      setStudents(studentsData);
      setAttendanceRecords(attendanceData);
    } catch (error) {
      console.error("Error loading report data:", error);
      toast.error("Failed to load data for reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derive unique filter options from student data
  const yearOptions = useMemo(() => {
    return [...new Set(students.map((s) => s.yearLevel))].sort((a, b) => a - b);
  }, [students]);

  const courseOptions = useMemo(() => {
    let filtered = students;
    if (selectedYear) {
      filtered = filtered.filter((s) => s.yearLevel === Number(selectedYear));
    }
    return [...new Set(filtered.map((s) => s.program))].sort();
  }, [students, selectedYear]);

  const sectionOptions = useMemo(() => {
    let filtered = students;
    if (selectedYear) {
      filtered = filtered.filter((s) => s.yearLevel === Number(selectedYear));
    }
    if (selectedCourse) {
      filtered = filtered.filter((s) => s.program === selectedCourse);
    }
    return [...new Set(filtered.map((s) => s.section))].sort();
  }, [students, selectedYear, selectedCourse]);

  // Reset dependent filters when parent changes
  useEffect(() => {
    if (selectedCourse && !courseOptions.includes(selectedCourse)) {
      setSelectedCourse("");
    }
  }, [courseOptions, selectedCourse]);

  useEffect(() => {
    if (selectedSection && !sectionOptions.includes(selectedSection)) {
      setSelectedSection("");
    }
  }, [sectionOptions, selectedSection]);

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;
  const filtersComplete =
    !!selectedEventId && !!selectedYear && !!selectedCourse && !!selectedSection;

  // Build report rows
  const reportRows: ReportRow[] = useMemo(() => {
    if (!filtersComplete || !selectedEvent) return [];

    const matchedStudents = students.filter(
      (s) =>
        s.yearLevel === Number(selectedYear) &&
        s.program === selectedCourse &&
        s.section === selectedSection,
    );

    const eventRecords = attendanceRecords.filter(
      (r) => r.eventId === selectedEventId,
    );

    // studentId -> best record (prefer present/late over absent)
    const studentRecordMap = new Map<string, AttendanceRecord>();
    for (const record of eventRecords) {
      const existing = studentRecordMap.get(record.studentId);
      if (!existing) {
        studentRecordMap.set(record.studentId, record);
      } else {
        const priorityOf = (s: string) =>
          s === "present" ? 2 : s === "late" ? 1 : 0;
        if (priorityOf(record.status) > priorityOf(existing.status)) {
          studentRecordMap.set(record.studentId, record);
        } else if (
          priorityOf(record.status) === priorityOf(existing.status) &&
          record.timeIn &&
          !existing.timeIn
        ) {
          studentRecordMap.set(record.studentId, record);
        }
      }
    }

    return matchedStudents
      .map((student): ReportRow => {
        const record = studentRecordMap.get(student.id);
        if (!record || record.status === "absent") {
          return {
            studentName: student.name,
            yearLevel: student.yearLevel,
            course: student.program,
            section: student.section,
            status: "Absent",
            eventName: selectedEvent.name,
            timeIn: "—",
            timeOut: "—",
          };
        }
        // Recalculate the status from the event's configured session start
        // time, matching the real-time attendance workflow. The stored status
        // remains a fallback when an older event has no configured threshold.
        const sessionStart = selectedEvent.schedules?.find(
          (schedule) => schedule.period === record.session,
        )?.timeIn;
        const isLate = record.timeIn && sessionStart
          ? compareTime24(record.timeIn, sessionStart) > 0
          : record.status === "late";

        return {
          studentName: student.name,
          yearLevel: student.yearLevel,
          course: student.program,
          section: student.section,
          status: isLate ? "Late" : "Present",
          eventName: selectedEvent.name,
          timeIn: record.timeIn ? formatTime12(record.timeIn) : "—",
          timeOut: record.timeOut ? formatTime12(record.timeOut) : "—",
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [
    filtersComplete,
    selectedEvent,
    students,
    selectedYear,
    selectedCourse,
    selectedSection,
    attendanceRecords,
    selectedEventId,
  ]);

  const totalStudents = reportRows.length;
  const totalPresent = reportRows.filter((r) => r.status === "Present").length;
  const totalLate = reportRows.filter((r) => r.status === "Late").length;
  const totalAbsent = reportRows.filter((r) => r.status === "Absent").length;
  const attendancePercentage =
    totalStudents > 0
      ? (((totalPresent + totalLate) / totalStudents) * 100).toFixed(1)
      : "0.0";

  // Self-contained printable HTML generation.
  const generatePrintableReport = async () => {
    if (!selectedEvent) return;
    try {
      setGenerating(true);

      const [lscLogoResp, dsscLogoResp] = await Promise.all([
        fetch("/lsc-logo.jpg"),
        fetch("/DSSC-logo.png"),
      ]);
      const [lscBlob, dsscBlob] = await Promise.all([
        lscLogoResp.blob(),
        dsscLogoResp.blob(),
      ]);
      const [lscDataUri, dsscDataUri] = await Promise.all([
        blobToDataUri(lscBlob),
        blobToDataUri(dsscBlob),
      ]);

      const esc = (v: string) =>
        String(v)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      const yearLabel = `${selectedYear}${getOrdinalSuffix(Number(selectedYear))} Year`;

      const tableRows = reportRows
        .map(
          (row, idx) =>
            `<tr class="${idx % 2 === 0 ? "even" : "odd"}">
              <td>${esc(row.studentName)}</td>
              <td class="center">${row.yearLevel}${getOrdinalSuffix(row.yearLevel)}</td>
              <td class="center">${esc(row.course)}</td>
              <td class="center">${esc(row.section)}</td>
              <td class="center"><span class="s-${row.status.toLowerCase()}">${row.status}</span></td>
              <td>${esc(row.eventName)}</td>
              <td class="center">${row.timeIn}</td>
              <td class="center">${row.timeOut}</td>
            </tr>`,
        )
        .join("");

      const html = buildReportHtml({
        lscDataUri,
        dsscDataUri,
        eventName: esc(selectedEvent.name),
        yearLabel,
        course: esc(selectedCourse),
        section: esc(selectedSection),
        totalStudents,
        totalPresent,
        totalLate,
        totalAbsent,
        attendancePercentage,
        tableRows,
      });

      const safeName = selectedEvent.name.replace(/\s+/g, "-").toLowerCase();
      downloadBlob(
        new Blob([html], { type: "text/html;charset=utf-8" }),
        `attendance-report-${safeName}-${selectedYear}yr-${selectedCourse}-${selectedSection}.html`,
      );

      toast.success(
        "Report downloaded. Open it in a browser and use Print → Save as PDF to export.",
      );
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SectionLayout
      title="Attendance Reports"
      subtitle="Generate official attendance reports with filters and printable download"
      onBack={onBack}
    >

        {loading && <SectionLoader message="Loading report data..." />}

        {!loading && (
          <>
            {/* Filters */}
            <div className="glass-card p-5 lg:p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-red/10 flex items-center justify-center">
                  <Filter className="w-4 h-4 text-red" />
                </div>
                <h3 className="font-display font-semibold text-lg text-dark">Report Filters</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark mb-1.5">Event</label>
                  <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)} className="glass-input w-full px-4 py-2.5 text-sm">
                    <option value="">Select event</option>
                    {events.map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark mb-1.5">Year</label>
                  <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="glass-input w-full px-4 py-2.5 text-sm">
                    <option value="">Select year</option>
                    {yearOptions.map((year) => (<option key={year} value={year}>{year}{getOrdinalSuffix(year)} Year</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark mb-1.5">Course</label>
                  <select value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)} className="glass-input w-full px-4 py-2.5 text-sm" disabled={!selectedYear}>
                    <option value="">{selectedYear ? "Select course" : "Select year first"}</option>
                    {courseOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark mb-1.5">Section</label>
                  <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)} className="glass-input w-full px-4 py-2.5 text-sm" disabled={!selectedCourse}>
                    <option value="">{selectedCourse ? "Select section" : "Select course first"}</option>
                    {sectionOptions.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
              </div>
            </div>

            {filtersComplete && reportRows.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                <SummaryCard icon={Users} color="blue" value={totalStudents} label="Total Students" />
                <SummaryCard icon={CheckCircle} color="green" value={totalPresent} label="Present" />
                <SummaryCard icon={Clock} color="amber" value={totalLate} label="Late" />
                <SummaryCard icon={XCircle} color="red" value={totalAbsent} label="Absent" />
                <div className="glass-card p-4 text-center col-span-2 sm:col-span-1">
                  <div className="w-9 h-9 rounded-lg bg-royal-blue/10 flex items-center justify-center mx-auto mb-2">
                    <FileText className="w-5 h-5 text-royal-blue" />
                  </div>
                  <p className="text-2xl font-bold text-royal-blue">{attendancePercentage}%</p>
                  <p className="text-xs text-text-secondary uppercase tracking-wider">Attendance</p>
                </div>
              </div>
            )}

            {filtersComplete && (
              <div className="glass-card p-5 lg:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-red/10 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-red" />
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-lg text-dark">Attendance Records</h3>
                      <p className="text-xs text-text-secondary">
                        {selectedEvent?.name} — {selectedYear}{getOrdinalSuffix(Number(selectedYear))} Year · {selectedCourse} · Section {selectedSection}
                      </p>
                    </div>
                  </div>
                  {reportRows.length > 0 && (
                    <button onClick={generatePrintableReport} disabled={generating} className="btn-primary px-4 py-2.5 flex items-center gap-2 text-sm self-start">
                      {generating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
                      ) : (
                        <><Download className="w-4 h-4" />Download Printable Report</>
                      )}
                    </button>
                  )}
                </div>

                {reportRows.length === 0 ? (
                  <SectionEmptyState message="No students found for the selected filters." icon={Users} compact />
                ) : (
                  <div className="overflow-x-auto -mx-5 lg:-mx-6 px-5 lg:px-6">
                    <table className="glass-table w-full text-sm">
                      <thead>
                        <tr>
                          <th className="text-left">Student</th>
                          <th className="text-center">Year</th>
                          <th className="text-center">Course</th>
                          <th className="text-center">Section</th>
                          <th className="text-center">Status</th>
                          <th className="text-left">Event</th>
                          <th className="text-center">Time In</th>
                          <th className="text-center">Time Out</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportRows.map((row, idx) => (
                          <tr key={idx}>
                            <td className="font-medium text-dark">{row.studentName}</td>
                            <td className="text-center text-text-secondary">{row.yearLevel}{getOrdinalSuffix(row.yearLevel)}</td>
                            <td className="text-center text-text-secondary">{row.course}</td>
                            <td className="text-center text-text-secondary">{row.section}</td>
                            <td className="text-center"><StatusBadge status={row.status} /></td>
                            <td className="text-text-secondary">{row.eventName}</td>
                            <td className="text-center text-text-secondary">{row.timeIn}</td>
                            <td className="text-center text-text-secondary">{row.timeOut}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {!filtersComplete && (
              <div className="glass-card p-12 text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-40 text-text-secondary" />
                <p className="text-text-secondary">
                  Select an <strong>Event</strong>, <strong>Year</strong>, <strong>Course</strong>, and <strong>Section</strong> above to generate an attendance report.
                </p>
              </div>
            )}
          </>
        )}
    </SectionLayout>
  );
}

function StatusBadge({ status }: { status: ReportRow["status"] }) {
  const className =
    status === "Late"
      ? "bg-amber-100 text-amber-700"
      : status === "Present"
        ? "bg-green-100 text-green-600"
        : "bg-red-100 text-red-500";
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${className}`}>
      {status}
    </span>
  );
}

interface PrintableReport {
  lscDataUri: string;
  dsscDataUri: string;
  eventName: string;
  yearLabel: string;
  course: string;
  section: string;
  totalStudents: number;
  totalPresent: number;
  totalLate: number;
  totalAbsent: number;
  attendancePercentage: string;
  tableRows: string;
}

/** Self-contained landscape document for browser Print → Save as PDF. */
function buildReportHtml(report: PrintableReport): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Student Attendance Report</title>
<style>
  @page{size:landscape;margin:12mm 10mm}
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:0;padding:20px 28px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .header{display:flex;align-items:center;justify-content:center;gap:20px;border-bottom:3px solid #1b2e8c;padding-bottom:12px}
  .header img{width:70px;height:70px;object-fit:contain}.title{text-align:center}.org{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1.8px}.title h1{font-size:22px;color:#1b2e8c;margin:3px 0;font-weight:800}.sub{font-size:11px;color:#6b7280}
  .metadata{display:grid;grid-template-columns:1fr 1fr;gap:7px 30px;margin:16px 0;font-size:13px}.label{font-weight:700;color:#374151;display:inline-block;min-width:105px}
  .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:14px 0 18px}.card{border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;padding:9px;text-align:center}.number{font-weight:800;font-size:21px}.caption{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.8px;margin-top:2px}.present{color:#047857}.late{color:#b45309}.absent{color:#b91c1c}.percent{color:#1b2e8c}
  table{width:100%;border-collapse:collapse;font-size:12px}thead tr{background:#1b2e8c;color:#fff}th{padding:8px 9px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}td{padding:7px 9px;border-bottom:1px solid #e5e7eb}.center{text-align:center}.odd{background:#f9fafb}.even{background:#fff}
  .s-present,.s-late,.s-absent{padding:2px 9px;border-radius:999px;font-size:10px;font-weight:700}.s-present{background:#d1fae5;color:#047857}.s-late{background:#fef3c7;color:#b45309}.s-absent{background:#fee2e2;color:#b91c1c}
  footer{display:flex;justify-content:space-between;margin-top:18px;padding-top:9px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px}@media print{body{padding:0}}
</style></head><body>
  <header class="header"><img src="${report.lscDataUri}" alt="LSC logo"/><div class="title"><div class="org">Local Student Council · DSSC Santa Cruz</div><h1>Student Attendance Report</h1><div class="sub">Official Attendance Record for Verification and Filing</div></div><img src="${report.dsscDataUri}" alt="DSSC logo"/></header>
  <section class="metadata"><div><span class="label">Event:</span>${report.eventName}</div><div><span class="label">Year Level:</span>${report.yearLabel}</div><div><span class="label">Course:</span>${report.course}</div><div><span class="label">Section:</span>${report.section}</div></section>
  <section class="summary"><div class="card"><div class="number">${report.totalStudents}</div><div class="caption">Total Students</div></div><div class="card"><div class="number present">${report.totalPresent}</div><div class="caption">Total Present</div></div><div class="card"><div class="number late">${report.totalLate}</div><div class="caption">Total Late</div></div><div class="card"><div class="number absent">${report.totalAbsent}</div><div class="caption">Total Absent</div></div><div class="card"><div class="number percent">${report.attendancePercentage}%</div><div class="caption">Attendance</div></div></section>
  <table><thead><tr><th>Student</th><th class="center">Year</th><th class="center">Course</th><th class="center">Section</th><th class="center">Status</th><th>Event</th><th class="center">Time In</th><th class="center">Time Out</th></tr></thead><tbody>${report.tableRows}</tbody></table>
  <footer><span>Generated ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}</span><span>Digital Transparency Board — LSC · DSSC Santa Cruz</span></footer>
</body></html>`;
}
