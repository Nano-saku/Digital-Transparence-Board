import type { ChangeEvent, ReactNode } from "react";
import { CalendarDays, CircleAlert, Clock, CloudSun, LogIn, LogOut, Pencil, Trash2, Users, type LucideIcon } from "lucide-react";
import type { AttendanceRecord, Event, EventSession, Student } from "@/types";
import { formatDate, formatTime12, splitTime24 } from "@/lib/format";
import { EVENT_SESSION_LABELS, type EventSessionWindow } from "@/lib/attendance";
import { cn } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import { Menu, MenuContent, MenuItem, MenuSeparator, RowActionsTrigger } from "@/components/ui/Menu";
import { SESSION_ICON, STATUS, STATUSES, type ScanMode, type Status } from "./status";

export type TimeParts = ReturnType<typeof splitTime24>;

const PAGE_SIZE = 20;

/** Pill radio group. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
}: {
  value: T | null;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; icon?: LucideIcon }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="max-w-full overflow-x-auto">
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

export const StatusChip = ({ status }: { status?: Status }) =>
  status ? <span className={cn("chip", STATUS[status].chip)}>{STATUS[status].label}</span> : <span className="chip chip-neutral">Not recorded</span>;

function windowSummary({ timeIn, timeOut }: EventSessionWindow): { text: string; chip: string } {
  if (!timeIn && !timeOut) return { text: "Schedule times not configured", chip: "chip-warning" };
  return {
    text: `${timeIn ? formatTime12(timeIn) : "Time In not set"} – ${timeOut ? formatTime12(timeOut) : "Time Out not set"}`,
    chip: timeIn && timeOut ? "chip-success" : "chip-brand",
  };
}

/** Every scheduled session of the event on one screen, with its time window and tallies. */
export function WholeDayPanel({ event, windows, activeSession, records }: { event: Event; windows: EventSessionWindow[]; activeSession: EventSession | null; records: AttendanceRecord[] }) {
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
              {windows.length ? `${windows.length} scheduled session${windows.length > 1 ? "s" : ""} handled automatically` : "No sessions configured for this event"}
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
                      {STATUS[s].label} {records.filter((r) => r.session === w.session && r.status === s).length}
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

/** Hour / minutes / AM-PM fields; both blank means "no time". */
export function TimeFields({ label, value, onChange, disabled }: { label: string; value: TimeParts; onChange: (value: TimeParts) => void; disabled?: boolean }) {
  const digits = (key: "hour" | "minute") => (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value.replace(/\D/g, "") });
  const box = "input w-14 px-1 text-center";
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center gap-1.5" role="group" aria-label={label}>
        <input className={box} inputMode="numeric" maxLength={2} placeholder="hh" title="Hour (1-12)" aria-label={`${label} hour`} value={value.hour} onChange={digits("hour")} disabled={disabled} />
        <span className="font-semibold text-muted">:</span>
        <input className={box} inputMode="numeric" maxLength={2} placeholder="mm" title="Minutes (00-59)" aria-label={`${label} minutes`} value={value.minute} onChange={digits("minute")} disabled={disabled} />
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

export function AttendanceTable({ students, recordByStudent, lastScanId, toolbar, emptyText, onEdit, onRecordNow, onClear }: AttendanceTableProps) {
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
