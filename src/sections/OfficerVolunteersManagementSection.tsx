import { useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Award, CheckCircle2, Edit2, Info, Layers, Plus, ShieldCheck, Sparkles, Trash2, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { lscOfficersService, eventVolunteersService, studentsService, eventsService, formatLscPositions, OFFICIAL_LSC_POSITIONS } from "@/services/db";
import { useLiveData } from "@/hooks/useLiveData";
import { formatDate } from "@/lib/format";
import { canAccess } from "@/lib/roles";
import { cn, matchesSearchWords } from "@/lib/utils";
import type { LscOfficer, EventVolunteer, Student, Event, UserRole, OfficialLscPosition } from "@/types";
import Page from "@/components/ui/Page";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Field from "@/components/ui/Field";
import SearchInput from "@/components/ui/SearchInput";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import { LoadingCard } from "@/components/ui/Skeleton";

interface OfficerVolunteersManagementSectionProps {
  onBack: () => void;
  role: UserRole;
  staffName?: string;
}

const POSITION_CATEGORIES: { category: string; description: string; positions: OfficialLscPosition[] }[] = [
  {
    category: "Executive Council",
    description: "Core officer positions responsible for organization leadership.",
    positions: ["Governor", "Vice Governor", "External Vice Governor", "General Secretary", "Assistant Secretary", "Treasurer", "Auditor", "Assistant Auditor"],
  },
  { category: "Governing Board", description: "Manual selection only. Roles do not automatically grant Board Member status.", positions: ["Board Member"] },
  {
    category: "Directors & Committee Heads",
    description: "Specialized leadership for creative and technical units.",
    positions: ["Creative Director", "Technical Director", "Creative Head", "Technical Head"],
  },
  { category: "Working Committees", description: "Committee membership exists only when explicitly assigned.", positions: ["Creatives Committee", "Technical Committee"] },
  { category: "Marshall Unit", description: "Student safety and event-floor coordination roles.", positions: ["Marshall Head", "Marshall Committee"] },
];

const PRESET_VOLUNTEER_TASKS = [
  "Registration & Ushering",
  "Technical & Audio/Visual Support",
  "Documentation & Photography",
  "Stage Management",
  "Logistics & Equipment",
  "Crowd Control & Safety",
  "Certificate & Award Distribution",
  "General Assistance",
];
const CUSTOM_TASK = "Custom";
const TABLES = ["lsc_officers", "event_volunteers", "students", "events"] as const;

/** Student numbers are matched trimmed and case-insensitively. */
const idKey = (studentId: string) => studentId.trim().toLowerCase();
const errorText = (error: unknown, fallback: string) =>
  (error instanceof Error ? error.message : (error as { message?: string } | null)?.message) || fallback;
/** "BSIT-3 A" style class label. */
const classLabel = (program: string, yearLevel?: number, section?: string) =>
  [`${program}${yearLevel ? `-${yearLevel}` : ""}`, section].filter(Boolean).join(" ");
const hasRole = (officer: LscOfficer, ...roles: string[]) => roles.some((r) => (officer.positions as string[]).includes(r));

type Dialog = { kind: "officer"; officer?: LscOfficer } | { kind: "volunteer" };
type Confirm =
  | { kind: "role"; officer: LscOfficer; role: string }
  | { kind: "officer"; officer: LscOfficer }
  | { kind: "volunteer"; volunteer: EventVolunteer };

export default function OfficerVolunteersManagementSection({ onBack, role }: OfficerVolunteersManagementSectionProps) {
  const allowed = canAccess(role, "officer-volunteers-management") === true;
  const { data, loading, mutate } = useLiveData({
    sources: {
      officers: () => lscOfficersService.getAll(),
      volunteers: () => eventVolunteersService.getAll(),
      students: () => studentsService.getAll(),
      events: () => eventsService.getAll(),
    },
    tables: TABLES,
    channel: "officer-volunteers-management",
    enabled: allowed,
    onError: () => toast.error("Could not load data. Please check connection."),
  });
  const { officers = [], volunteers = [], students = [], events = [] } = data ?? {};

  const [activeTab, setActiveTab] = useState<"officers" | "volunteers">("officers");
  const [officerSearch, setOfficerSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");
  const [volunteerSearch, setVolunteerSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  // `key` remounts the dialog on every open so its form starts fresh, while the
  // closing instance keeps its content through the close animation.
  const [dialog, setDialog] = useState<{ open: boolean; key: number; value: Dialog }>({ open: false, key: 0, value: { kind: "volunteer" } });
  // Kept after closing so the dialog's copy survives its close animation.
  const [confirm, setConfirmState] = useState<{ open: boolean; value?: Confirm }>({ open: false });
  const setConfirm = (value: Confirm | null) => setConfirmState((c) => (value ? { open: true, value } : { ...c, open: false }));
  const [busy, setBusy] = useState(false);

  const openDialog = (value: Dialog) => setDialog((d) => ({ open: true, key: d.key + 1, value }));
  const closeDialog = () => setDialog((d) => ({ ...d, open: false }));

  const officerByStudentId = useMemo(() => new Map(officers.map((o) => [idKey(o.studentId), o])), [officers]);
  const studentByStudentId = useMemo(() => new Map(students.map((s) => [idKey(s.studentId), s])), [students]);
  // Volunteer rows reference the students.id UUID (older rows: the student number).
  const studentByAnyId = useMemo(() => new Map(students.flatMap((s) => [[s.id, s] as const, [s.studentId, s] as const])), [students]);
  const programOptions = useMemo(() => [...new Set(officers.map((o) => o.program).filter(Boolean))].sort(), [officers]);

  const filteredOfficers = officers.filter(
    (o) =>
      matchesSearchWords(`${o.name} ${o.studentId} ${o.positions.join(" ")}`, officerSearch) &&
      (roleFilter === "all" || hasRole(o, roleFilter)) &&
      (programFilter === "all" || o.program.toLowerCase() === programFilter.toLowerCase()),
  );
  const filteredVolunteers = volunteers.filter(
    (v) =>
      matchesSearchWords(`${v.studentName} ${v.studentId} ${studentByAnyId.get(v.studentId)?.studentId ?? ""} ${v.roleOrTask} ${v.program ?? ""}`, volunteerSearch) &&
      (eventFilter === "all" || v.eventId === eventFilter),
  );

  /** Runs a confirmed removal; failures are toasted and keep the dialog open. */
  const runConfirmed = async (action: () => Promise<string>, failure: (error: unknown) => string) => {
    if (busy) return;
    setBusy(true);
    try {
      toast.success(await action());
      setConfirm(null);
    } catch (error) {
      console.error("Officer/volunteer update failed:", error);
      toast.error(failure(error));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = () => {
    const target = confirm.value;
    if (!target) return;
    if (target.kind === "role") {
      const { officer, role: roleToRemove } = target;
      return runConfirmed(async () => {
        const updated = await lscOfficersService.removeRole(officer.studentId, roleToRemove);
        mutate("officers", (list) => (updated ? list.map((o) => (o.id === updated.id ? updated : o)) : list.filter((o) => o.id !== officer.id)));
        return updated
          ? `Removed role "${roleToRemove}" from ${officer.name}. Remaining roles: ${formatLscPositions(updated.positions)}`
          : `Removed role "${roleToRemove}" from ${officer.name}. Officer status has been cleared.`;
      }, () => "Failed to remove role. Please try again.");
    }
    if (target.kind === "officer") {
      const { officer } = target;
      return runConfirmed(async () => {
        await lscOfficersService.remove(officer.id);
        mutate("officers", (list) => list.filter((o) => o.id !== officer.id));
        return `Removed ${officer.name} as an LSC Officer.`;
      }, () => "Failed to remove officer record.");
    }
    const { volunteer } = target;
    return runConfirmed(async () => {
      await eventVolunteersService.remove(volunteer.id);
      mutate("volunteers", (list) => list.filter((v) => v.id !== volunteer.id));
      return `Removed volunteer ${volunteer.studentName} from event.`;
    }, (error) => errorText(error, "Failed to remove volunteer."));
  };

  if (!allowed) {
    return (
      <Page title="LSC Officers & Event Volunteers" subtitle="Manage official positions and volunteers" onBack={onBack}>
        <div className="card">
          <EmptyState
            icon={AlertCircle}
            title="Administrator Access Required"
            description="Only the Admin has permission to select LSC Officers, assign official positions, and manage event volunteers."
            action={<button onClick={onBack} className="btn btn-primary">Return to Dashboard</button>}
          />
        </div>
      </Page>
    );
  }

  const onOfficers = activeTab === "officers";
  const isFiltered = onOfficers ? officerSearch !== "" || roleFilter !== "all" || programFilter !== "all" : volunteerSearch !== "" || eventFilter !== "all";
  const assignButton = onOfficers ? (
    <button onClick={() => openDialog({ kind: "officer" })} className="btn btn-primary">
      <UserPlus className="h-4 w-4" /> Assign LSC Officer
    </button>
  ) : (
    <button onClick={() => openDialog({ kind: "volunteer" })} className="btn btn-primary">
      <Plus className="h-4 w-4" /> Assign Event Volunteer
    </button>
  );
  const target = confirm.value;
  const confirmCopy = !target
    ? { title: "", description: "", label: "" }
    : target.kind === "role"
      ? {
          title: "Remove Official Role?",
          description: `Are you sure you want to remove the "${target.role}" role from ${target.officer.name}? Other assigned roles will remain untouched.`,
          label: "Remove Role",
        }
      : target.kind === "officer"
        ? { title: "Remove Officer Status?", description: `Are you sure you want to remove all officer roles and positions from ${target.officer.name}?`, label: "Remove Officer" }
        : {
            title: "Remove Volunteer Assignment?",
            description: `Are you sure you want to remove ${target.volunteer.studentName} from "${target.volunteer.eventName}"?`,
            label: "Remove Volunteer",
          };

  return (
    <Page
      eyebrow="Council roster"
      title="LSC Officers & Event Volunteers"
      subtitle="Strict manual assignment of official positions and event volunteers"
      onBack={onBack}
      actions={assignButton}
      hero={
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard featured icon={ShieldCheck} label="Total Officers" value={officers.length} hint="Officially appointed" />
          <StatCard icon={Award} label="Board Members" value={officers.filter((o) => hasRole(o, "Board Member")).length} hint="Manual board roles" />
          <StatCard
            icon={Layers}
            tone="warning"
            label="Committees"
            value={officers.filter((o) => hasRole(o, "Creatives Committee", "Technical Committee")).length}
            hint="Creatives & Tech"
          />
          <StatCard icon={Users} tone="success" label="Event Volunteers" value={volunteers.length} hint="Active assignments" />
        </div>
      }
    >
      <div className="card space-y-3 p-4">
        <div role="tablist" className="flex flex-wrap gap-1">
          {(
            [
              { tab: "officers", label: "LSC Officers", icon: ShieldCheck, count: officers.length },
              { tab: "volunteers", label: "Event Volunteers", icon: Users, count: volunteers.length },
            ] as const
          ).map(({ tab, label, icon: Icon, count }) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={cn("btn btn-sm", activeTab === tab ? "btn-primary" : "btn-ghost")}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
              <span className={cn("rounded-full px-1.5 text-[11px]", activeTab === tab ? "bg-white/20" : "bg-surface-2")}>{count}</span>
            </button>
          ))}
        </div>

        {onOfficers ? (
          <>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <SearchInput value={officerSearch} onChange={setOfficerSearch} placeholder="Search officers by name, student ID, or position…" className="flex-1" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select label="Official role" value={roleFilter} onChange={setRoleFilter} all="All Official Roles" options={OFFICIAL_LSC_POSITIONS} className="lg:w-52" />
                <Select label="Program" value={programFilter} onChange={setProgramFilter} all="All Programs" options={programOptions} className="lg:w-40" />
              </div>
            </div>
            <p className="flex items-start gap-2 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-xs text-muted">
              <Info className="mt-px h-3.5 w-3.5 shrink-0 text-brand-500" />
              <span>
                <b className="text-ink">Strict Policy:</b> Zero automatic inferences. Adding a role never replaces existing roles; removing an
                individual role leaves remaining roles intact.
              </span>
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchInput value={volunteerSearch} onChange={setVolunteerSearch} placeholder="Search volunteers by student name, ID, or task…" className="flex-1" />
            <Select label="Event" value={eventFilter} onChange={setEventFilter} all="All Events" options={events.map((e) => [e.id, e.name] as const)} className="lg:w-60" />
          </div>
        )}
      </div>

      {loading ? (
        <LoadingCard label={onOfficers ? "Loading officers…" : "Loading volunteers…"} />
      ) : (onOfficers ? filteredOfficers : filteredVolunteers).length === 0 ? (
        <div className="card">
          {onOfficers ? (
            <EmptyState
              icon={ShieldCheck}
              title={isFiltered ? "No officers found" : "No LSC Officers yet"}
              description={
                isFiltered
                  ? "No officers match the selected search or filter criteria."
                  : "No students have been assigned as LSC Officers yet. Appoint the first officer to get started."
              }
              action={!isFiltered && assignButton}
            />
          ) : (
            <EmptyState
              icon={Users}
              title={isFiltered ? "No volunteers found" : "No event volunteers yet"}
              description={
                isFiltered
                  ? "No volunteers match your criteria."
                  : "No students have been assigned as volunteers for events yet. Assign a student to an event to get started."
              }
              action={!isFiltered && assignButton}
            />
          )}
        </div>
      ) : onOfficers ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredOfficers.map((officer) => (
            <OfficerCard
              key={officer.id}
              officer={officer}
              photoUrl={studentByStudentId.get(idKey(officer.studentId))?.profilePhotoUrl}
              onManage={() => openDialog({ kind: "officer", officer })}
              onRemoveRole={(roleName) => setConfirm({ kind: "role", officer, role: roleName })}
              onRemove={() => setConfirm({ kind: "officer", officer })}
            />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div data-lenis-prevent className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Program / Section</th>
                  <th>Event</th>
                  <th>Assigned Task / Role</th>
                  <th>Assigned On</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVolunteers.map((vol) => (
                  <tr key={vol.id}>
                    <td className="min-w-[12rem]">
                      <p className="font-semibold">{vol.studentName}</p>
                      <p className="font-mono text-xs text-muted">{studentByAnyId.get(vol.studentId)?.studentId || vol.studentId}</p>
                    </td>
                    <td className="whitespace-nowrap text-xs text-muted">{classLabel(vol.program || "N/A", vol.yearLevel, vol.section)}</td>
                    <td className="font-medium">{vol.eventName}</td>
                    <td>
                      <span className="chip chip-success">
                        <Sparkles className="h-3 w-3" /> {vol.roleOrTask}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-xs text-muted">{formatDate(vol.createdAt)}</td>
                    <td className="text-right">
                      <button
                        onClick={() => setConfirm({ kind: "volunteer", volunteer: vol })}
                        className="btn btn-ghost btn-sm btn-icon hover:bg-danger/10 hover:text-danger"
                        aria-label={`Remove ${vol.studentName} from ${vol.eventName}`}
                        title="Remove Volunteer Assignment"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dialog.value.kind === "officer" ? (
        <OfficerDialog
          key={dialog.key}
          open={dialog.open}
          onClose={closeDialog}
          initial={dialog.value.officer}
          students={students}
          officerByStudentId={officerByStudentId}
          onSaved={(saved) => {
            mutate("officers", (list) => (list.some((o) => o.studentId === saved.studentId) ? list.map((o) => (o.studentId === saved.studentId ? saved : o)) : [saved, ...list]));
            closeDialog();
          }}
        />
      ) : (
        <VolunteerDialog
          key={dialog.key}
          open={dialog.open}
          onClose={closeDialog}
          students={students}
          events={events}
          volunteers={volunteers}
          onSaved={(saved) => {
            mutate("volunteers", (list) => [saved, ...list]);
            closeDialog();
          }}
        />
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.label}
        loading={busy}
        onConfirm={() => void onConfirm()}
        onClose={() => setConfirm(null)}
      />
    </Page>
  );
}

function Select({
  label,
  value,
  onChange,
  all,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  all?: string;
  /** Plain values, or `[value, label]` pairs. */
  options: readonly (string | readonly [string, string])[];
  className?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn("input", className)} aria-label={label}>
      {all && <option value="all">{all}</option>}
      {options.map((option) => {
        const [v, text] = typeof option === "string" ? [option, option] : option;
        return (
          <option key={v} value={v}>
            {text}
          </option>
        );
      })}
    </select>
  );
}

interface DialogProps<T> {
  open: boolean;
  onClose: () => void;
  onSaved: (saved: T) => void;
  students: Student[];
}

function OfficerDialog({ open, onClose, onSaved, students, initial, officerByStudentId }: DialogProps<LscOfficer> & { initial?: LscOfficer; officerByStudentId: Map<string, LscOfficer> }) {
  const [student, setStudent] = useState<Student | null>(() =>
    !initial
      ? null
      : (students.find((s) => idKey(s.studentId) === idKey(initial.studentId)) ?? {
          id: initial.studentDbId || initial.id,
          studentId: initial.studentId,
          name: initial.name,
          program: initial.program,
          yearLevel: initial.yearLevel,
          section: initial.section,
        }),
  );
  const [positions, setPositions] = useState<string[]>(() => [...(initial?.positions ?? [])]);
  const [saving, setSaving] = useState(false);
  const isExisting = !!student && officerByStudentId.has(idKey(student.studentId));

  const pick = (s: Student | null) => {
    setStudent(s);
    setPositions(s ? [...(officerByStudentId.get(idKey(s.studentId))?.positions ?? [])] : []);
  };

  const save = async () => {
    if (!student) return void toast.error("Please select a student first.");
    if (positions.length === 0) return void toast.error("Please assign at least one official position or role.");
    setSaving(true);
    try {
      const saved = await lscOfficersService.assign({
        studentId: student.studentId,
        // The edit fallback may use the officer id when the source student
        // record is no longer loaded. Never send that value as the students FK.
        studentDbId: students.some((s) => s.id === student.id) ? student.id : undefined,
        name: student.name,
        program: student.program,
        yearLevel: student.yearLevel,
        section: student.section,
        positions,
      });
      toast.success(`LSC Officer assigned: ${saved.name} (${formatLscPositions(saved.positions)})`);
      onSaved(saved);
    } catch (error) {
      console.error("Failed to assign LSC officer:", error);
      toast.error(`Failed to save officer assignment: ${errorText(error, String(error))}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isExisting ? "Manage LSC Officer Roles" : "Appoint LSC Officer"}
      description="Pick a student, then toggle every official position they hold."
      icon={<ShieldCheck className="h-5 w-5 text-brand-500" />}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving || !student || positions.length === 0} className="btn btn-primary">
            <ShieldCheck className="h-4 w-4" />
            {saving ? "Saving…" : isExisting ? "Save Officer Assignment" : "Assign LSC Officer"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="label">1. Select Student</p>
          <StudentPicker
            students={students}
            value={student}
            onChange={pick}
            badge={(s) => officerByStudentId.has(idKey(s.studentId)) && <span className="chip chip-brand">Current Officer</span>}
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="label">2. Select Official Positions / Roles</p>
            <span className="chip chip-brand mb-1.5">{positions.length} selected</span>
          </div>
          {positions.length > 0 && (
            <div className="mb-3 rounded-2xl border border-brand-500/20 bg-brand-500/5 px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Resulting Official Title</p>
              <p className="mt-0.5 break-words text-sm font-bold text-ink">{formatLscPositions(positions)}</p>
            </div>
          )}
          <div className="space-y-2.5">
            {POSITION_CATEGORIES.map((cat) => (
              <div key={cat.category} className="rounded-2xl border border-line/70 bg-surface-2/60 p-3.5">
                <p className="text-sm font-semibold text-ink">{cat.category}</p>
                <p className="text-xs text-muted">{cat.description}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {cat.positions.map((pos) => {
                    const selected = positions.includes(pos);
                    return (
                      <button
                        key={pos}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPositions((prev) => (selected ? prev.filter((p) => p !== pos) : [...prev, pos]))}
                        className={cn("btn btn-sm", selected ? "btn-primary" : "btn-secondary")}
                      >
                        {selected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        {pos}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function VolunteerDialog({ open, onClose, onSaved, students, events, volunteers }: DialogProps<EventVolunteer> & { events: Event[]; volunteers: EventVolunteer[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [student, setStudent] = useState<Student | null>(null);
  const [task, setTask] = useState(PRESET_VOLUNTEER_TASKS[0]);
  const [customTask, setCustomTask] = useState("");
  const [saving, setSaving] = useState(false);
  const finalTask = task === CUSTOM_TASK ? customTask.trim() : task;

  const save = async () => {
    if (saving) return;
    if (!eventId) return void toast.error("Please select an event.");
    if (!student) return void toast.error("Please select a student.");
    if (!finalTask) return void toast.error("Please specify a volunteer role or task.");
    const event = events.find((e) => e.id === eventId);
    if (!event) return void toast.error("Selected event not found.");
    // Guard against duplicate volunteer assignment for the same event
    if (volunteers.some((v) => v.eventId === eventId && (v.studentId === student.id || v.studentId === student.studentId))) {
      return void toast.error(`${student.name} is already assigned as a volunteer for ${event.name}.`);
    }
    setSaving(true);
    try {
      const saved = await eventVolunteersService.assign({
        eventId: event.id,
        eventName: event.name,
        // MUST use student's database primary key UUID referencing public.students(id)
        studentId: student.id,
        studentName: student.name,
        program: student.program,
        yearLevel: student.yearLevel,
        section: student.section,
        roleOrTask: finalTask,
        eventDate: event.date,
      });
      toast.success(`Assigned ${saved.studentName} as volunteer for ${saved.eventName} (${finalTask})`);
      onSaved(saved);
    } catch (error) {
      console.error("Failed to assign volunteer:", error);
      toast.error(errorText(error, "Failed to assign volunteer."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign Event Volunteer"
      description="Give a student a task for one event."
      icon={<Users className="h-5 w-5 text-brand-500" />}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving || !eventId || !student || !finalTask} className="btn btn-primary">
            <Plus className="h-4 w-4" />
            {saving ? "Saving…" : "Assign Volunteer"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="1. Select Event">
          {events.length === 0 ? (
            <span className="block text-sm text-warning">No events available yet.</span>
          ) : (
            <Select label="Event" value={eventId} onChange={setEventId} options={events.map((e) => [e.id, e.name] as const)} />
          )}
        </Field>
        <div>
          <p className="label">2. Select Student</p>
          <StudentPicker students={students} value={student} onChange={setStudent} />
        </div>
        <Field label="3. Assigned Task / Role">
          <Select label="Assigned task" value={task} onChange={setTask} options={[...PRESET_VOLUNTEER_TASKS, [CUSTOM_TASK, "Custom Task…"] as const]} />
        </Field>
        {task === CUSTOM_TASK && (
          <input
            type="text"
            value={customTask}
            onChange={(e) => setCustomTask(e.target.value)}
            placeholder="Enter specific task description…"
            className="input"
            aria-label="Custom task"
          />
        )}
      </div>
    </Modal>
  );
}

function OfficerCard({
  officer,
  photoUrl,
  onManage,
  onRemoveRole,
  onRemove,
}: {
  officer: LscOfficer;
  photoUrl?: string;
  onManage: () => void;
  onRemoveRole: (role: string) => void;
  onRemove: () => void;
}) {
  return (
    <article className="card card-hover flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-line/70 bg-brand-500/10 text-base font-bold text-brand-600">
          {photoUrl ? <img src={photoUrl} alt={`${officer.name}'s profile`} className="h-full w-full object-cover" draggable={false} /> : officer.name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold leading-tight text-ink">{officer.name}</h3>
          <p className="mt-0.5 text-xs text-muted">
            ID: <span className="font-mono text-ink">{officer.studentId}</span>
          </p>
        </div>
        <span className="chip chip-brand shrink-0">{classLabel(officer.program, officer.yearLevel, officer.section)}</span>
      </div>

      <div className="mt-4 rounded-2xl border border-brand-500/20 bg-brand-500/5 px-3.5 py-3">
        <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-brand-600">
          <ShieldCheck className="h-3 w-3" /> Official Position Display
        </p>
        <p className="mt-1 text-sm font-bold leading-snug text-ink">{formatLscPositions(officer.positions)}</p>
      </div>

      <p className="mb-1.5 mt-4 text-xs font-medium text-muted">Individual Assigned Roles</p>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {officer.positions.map((roleName) => (
          <span key={roleName} className="chip chip-neutral pr-1 text-ink">
            {roleName}
            <button
              type="button"
              onClick={() => onRemoveRole(roleName)}
              title={`Remove ${roleName} role only`}
              aria-label={`Remove ${roleName} role only`}
              className="grid h-5 w-5 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-line/60 pt-4">
        <button onClick={onManage} className="btn btn-secondary btn-sm flex-1">
          <Edit2 className="h-3.5 w-3.5" /> Manage Roles
        </button>
        <button
          onClick={onRemove}
          className="btn btn-ghost btn-sm btn-icon hover:bg-danger/10 hover:text-danger"
          title="Remove Officer Status"
          aria-label={`Remove officer status from ${officer.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}

/** The chosen student with a Change button, or a search box listing up to 10 matches. */
function StudentPicker({
  students,
  value,
  onChange,
  badge,
}: {
  students: Student[];
  value: Student | null;
  onChange: (student: Student | null) => void;
  badge?: (student: Student) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const results = query.trim() ? students.filter((s) => matchesSearchWords(`${s.name} ${s.studentId} ${s.program}`, query)).slice(0, 10) : [];
  const meta = (s: Student) => `${s.studentId} · ${classLabel(s.program, s.yearLevel, s.section)}`;

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{value.name}</p>
          <p className="truncate text-xs text-muted">ID: {meta(value)}</p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="btn btn-ghost btn-sm">
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <SearchInput value={query} onChange={setQuery} placeholder="Search student by name or ID…" />
      {query && (
        <div data-lenis-prevent className="max-h-48 divide-y divide-line overflow-y-auto rounded-2xl border border-line">
          {results.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted">No students found.</p>
          ) : (
            results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange(s)}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{s.name}</span>
                  <span className="block truncate text-xs text-muted">{meta(s)}</span>
                </span>
                {badge?.(s)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
