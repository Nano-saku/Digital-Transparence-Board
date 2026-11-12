import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Edit2,
  Info,
  Layers,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  lscOfficersService,
  eventVolunteersService,
  studentsService,
  eventsService,
  formatLscPositions,
  OFFICIAL_LSC_POSITIONS,
} from "@/services/db";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  LscOfficer,
  EventVolunteer,
  Student,
  Event,
  UserRole,
  OfficialLscPosition,
} from "@/types";
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

const POSITION_CATEGORIES: {
  category: string;
  description: string;
  positions: OfficialLscPosition[];
}[] = [
  {
    category: "Executive Council",
    description: "Core officer positions responsible for organization leadership.",
    positions: [
      "Governor",
      "Vice Governor",
      "External Vice Governor",
      "General Secretary",
      "Assistant Secretary",
      "Treasurer",
      "Auditor",
      "Assistant Auditor",
    ],
  },
  {
    category: "Governing Board",
    description: "Manual selection only. Roles do not automatically grant Board Member status.",
    positions: ["Board Member"],
  },
  {
    category: "Directors & Committee Heads",
    description: "Specialized leadership for creative and technical units.",
    positions: [
      "Creative Director",
      "Technical Director",
      "Creative Head",
      "Technical Head",
    ],
  },
  {
    category: "Working Committees",
    description: "Committee membership exists only when explicitly assigned.",
    positions: ["Creatives Committee", "Technical Committee"],
  },
  {
    category: "Marshall Unit",
    description: "Student safety and event-floor coordination roles.",
    positions: ["Marshall Head", "Marshall Committee"],
  },
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

export default function OfficerVolunteersManagementSection({
  onBack,
  role,
}: OfficerVolunteersManagementSectionProps) {
  const [activeTab, setActiveTab] = useState<"officers" | "volunteers">("officers");
  const [officers, setOfficers] = useState<LscOfficer[]>([]);
  const [volunteers, setVolunteers] = useState<EventVolunteer[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Officers search & filter
  const [officerSearch, setOfficerSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [programFilter, setProgramFilter] = useState<string>("all");

  // Volunteers search & filter
  const [volunteerSearch, setVolunteerSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");

  // Assign Officer Modal
  const [isAssignOfficerOpen, setIsAssignOfficerOpen] = useState(false);
  const [selectedStudentForOfficer, setSelectedStudentForOfficer] = useState<Student | null>(null);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [studentSearchInModal, setStudentSearchInModal] = useState("");

  // Assign Volunteer Modal
  const [isAssignVolunteerOpen, setIsAssignVolunteerOpen] = useState(false);
  const [volunteerEventId, setVolunteerEventId] = useState("");
  const [selectedStudentForVolunteer, setSelectedStudentForVolunteer] = useState<Student | null>(null);
  const [volunteerTask, setVolunteerTask] = useState(PRESET_VOLUNTEER_TASKS[0]);
  const [customVolunteerTask, setCustomVolunteerTask] = useState("");
  const [volunteerStudentSearchInModal, setVolunteerStudentSearchInModal] = useState("");

  // Deletion confirmations
  const [confirmDeleteOfficer, setConfirmDeleteOfficer] = useState<LscOfficer | null>(null);
  const [confirmDeleteVolunteer, setConfirmDeleteVolunteer] = useState<EventVolunteer | null>(null);
  const [confirmRemoveRole, setConfirmRemoveRole] = useState<{
    officer: LscOfficer;
    role: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [allOfficers, allVolunteers, allStudents, allEvents] = await Promise.all([
        lscOfficersService.getAll(),
        eventVolunteersService.getAll(),
        studentsService.getAll(),
        eventsService.getAll(),
      ]);
      setOfficers(allOfficers);
      setVolunteers(allVolunteers);
      setStudents(allStudents);
      setEvents(allEvents);
    } catch (err) {
      console.error("Failed to load officers and volunteers data:", err);
      toast.error("Could not load data. Please check connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // useRealtimeSync handles reconnection recovery so officer appointment
  // changes (INSERT/UPDATE/DELETE on lsc_officers) are never silently missed.
  useRealtimeSync({
    tables: ["lsc_officers", "event_volunteers", "students", "events"],
    onChange: () => void loadData(),
    channelPrefix: "officer-volunteers-management",
  });

  const officerStudentIdMap = useMemo(() => {
    const map = new Map<string, LscOfficer>();
    officers.forEach((o) => map.set(o.studentId.trim().toLowerCase(), o));
    return map;
  }, [officers]);

  const studentByStudentId = useMemo(
    () => new Map(students.map((student) => [student.studentId.trim().toLowerCase(), student])),
    [students],
  );

  const filteredOfficers = useMemo(() => {
    return officers.filter((officer) => {
      const q = officerSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        officer.name.toLowerCase().includes(q) ||
        officer.studentId.toLowerCase().includes(q) ||
        officer.positions.some((pos) => pos.toLowerCase().includes(q));

      const matchesRole =
        roleFilter === "all" ||
        (officer.positions as string[]).includes(roleFilter);

      const matchesProgram =
        programFilter === "all" ||
        officer.program.toLowerCase() === programFilter.toLowerCase();

      return matchesSearch && matchesRole && matchesProgram;
    });
  }, [officers, officerSearch, roleFilter, programFilter]);

  const programOptions = useMemo(() => {
    const set = new Set<string>();
    officers.forEach((o) => {
      if (o.program) set.add(o.program);
    });
    return Array.from(set).sort();
  }, [officers]);

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    for (const s of students) {
      map.set(s.id, s);
      map.set(s.studentId, s);
    }
    return map;
  }, [students]);

  const filteredVolunteers = useMemo(() => {
    return volunteers.filter((v) => {
      const q = volunteerSearch.trim().toLowerCase();
      const s = studentMap.get(v.studentId);
      const studentNum = (s?.studentId || "").toLowerCase();
      const matchesSearch =
        !q ||
        v.studentName.toLowerCase().includes(q) ||
        v.studentId.toLowerCase().includes(q) ||
        studentNum.includes(q) ||
        v.roleOrTask.toLowerCase().includes(q) ||
        (v.program || "").toLowerCase().includes(q);

      const matchesEvent = eventFilter === "all" || v.eventId === eventFilter;

      return matchesSearch && matchesEvent;
    });
  }, [volunteers, volunteerSearch, eventFilter, studentMap]);

  const searchedStudentsForOfficer = useMemo(() => {
    const q = studentSearchInModal.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.studentId.toLowerCase().includes(q) ||
          s.program.toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [students, studentSearchInModal]);

  const searchedStudentsForVolunteer = useMemo(() => {
    const q = volunteerStudentSearchInModal.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.studentId.toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [students, volunteerStudentSearchInModal]);

  const stats = useMemo(() => {
    const totalOfficers = officers.length;
    const boardMembersCount = officers.filter((o) =>
      (o.positions as string[]).includes("Board Member"),
    ).length;
    const committeeCount = officers.filter(
      (o) =>
        (o.positions as string[]).includes("Creatives Committee") ||
        (o.positions as string[]).includes("Technical Committee"),
    ).length;
    const totalVolunteers = volunteers.length;

    return {
      totalOfficers,
      boardMembersCount,
      committeeCount,
      totalVolunteers,
    };
  }, [officers, volunteers]);

  const handleOpenAssignOfficer = (existingOfficer?: LscOfficer) => {
    if (existingOfficer) {
      const matchingStudent = students.find(
        (s) =>
          s.studentId.trim().toLowerCase() ===
          existingOfficer.studentId.trim().toLowerCase(),
      );
      setSelectedStudentForOfficer(
        matchingStudent ?? {
          id: existingOfficer.studentDbId || existingOfficer.id,
          studentId: existingOfficer.studentId,
          name: existingOfficer.name,
          program: existingOfficer.program,
          yearLevel: existingOfficer.yearLevel,
          section: existingOfficer.section,
        },
      );
      setSelectedPositions([...(existingOfficer.positions as string[])]);
      setStudentSearchInModal("");
    } else {
      setSelectedStudentForOfficer(null);
      setSelectedPositions([]);
      setStudentSearchInModal("");
    }
    setIsAssignOfficerOpen(true);
  };

  const handleTogglePosition = (pos: string) => {
    setSelectedPositions((prev) => {
      if (prev.includes(pos)) {
        return prev.filter((p) => p !== pos);
      } else {
        return [...prev, pos];
      }
    });
  };

  const handleConfirmOfficerAssignment = async () => {
    if (!selectedStudentForOfficer) {
      toast.error("Please select a student first.");
      return;
    }
    if (selectedPositions.length === 0) {
      toast.error("Please assign at least one official position or role.");
      return;
    }
    try {
      setSaving(true);
      const saved = await lscOfficersService.assign({
        studentId: selectedStudentForOfficer.studentId,
        // The edit fallback may use the officer id when the source student
        // record is no longer loaded. Never send that value as the students FK.
        studentDbId: students.some(
          (student) => student.id === selectedStudentForOfficer.id,
        )
          ? selectedStudentForOfficer.id
          : undefined,
        name: selectedStudentForOfficer.name,
        program: selectedStudentForOfficer.program,
        yearLevel: selectedStudentForOfficer.yearLevel,
        section: selectedStudentForOfficer.section,
        positions: selectedPositions,
      });

      setOfficers((prev) => {
        const index = prev.findIndex((o) => o.studentId === saved.studentId);
        if (index >= 0) {
          const next = [...prev];
          next[index] = saved;
          return next;
        }
        return [saved, ...prev];
      });

      toast.success(
        `LSC Officer assigned: ${saved.name} (${formatLscPositions(saved.positions)})`,
      );
      setIsAssignOfficerOpen(false);
      setSelectedStudentForOfficer(null);
      setSelectedPositions([]);
    } catch (err) {
      console.error("Failed to assign LSC officer:", err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
      toast.error(`Failed to save officer assignment: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmRemoveSingleRole = async () => {
    if (!confirmRemoveRole) return;
    const { officer, role: roleToRemove } = confirmRemoveRole;

    try {
      setSaving(true);
      const updated = await lscOfficersService.removeRole(
        officer.studentId,
        roleToRemove,
      );
      if (updated) {
        setOfficers((prev) =>
          prev.map((o) => (o.id === updated.id ? updated : o)),
        );
        toast.success(
          `Removed role "${roleToRemove}" from ${officer.name}. Remaining roles: ${formatLscPositions(updated.positions)}`,
        );
      } else {
        setOfficers((prev) => prev.filter((o) => o.id !== officer.id));
        toast.success(
          `Removed role "${roleToRemove}" from ${officer.name}. Officer status has been cleared.`,
        );
      }
      setConfirmRemoveRole(null);
    } catch (err) {
      console.error("Failed to remove role:", err);
      toast.error("Failed to remove role. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteOfficer = async () => {
    if (!confirmDeleteOfficer) return;

    try {
      setSaving(true);
      await lscOfficersService.remove(confirmDeleteOfficer.id);
      setOfficers((prev) =>
        prev.filter((o) => o.id !== confirmDeleteOfficer.id),
      );
      toast.success(
        `Removed ${confirmDeleteOfficer.name} as an LSC Officer.`,
      );
      setConfirmDeleteOfficer(null);
    } catch (err) {
      console.error("Failed to remove officer:", err);
      toast.error("Failed to remove officer record.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAssignVolunteer = () => {
    setVolunteerEventId(events[0]?.id || "");
    setSelectedStudentForVolunteer(null);
    setVolunteerTask(PRESET_VOLUNTEER_TASKS[0]);
    setCustomVolunteerTask("");
    setVolunteerStudentSearchInModal("");
    setIsAssignVolunteerOpen(true);
  };

  const handleConfirmVolunteerAssignment = async () => {
    if (saving) return;

    if (!volunteerEventId) {
      toast.error("Please select an event.");
      return;
    }
    if (!selectedStudentForVolunteer) {
      toast.error("Please select a student.");
      return;
    }
    const finalTask =
      volunteerTask === "Custom"
        ? customVolunteerTask.trim()
        : volunteerTask;

    if (!finalTask) {
      toast.error("Please specify a volunteer role or task.");
      return;
    }

    const targetEvent = events.find((e) => e.id === volunteerEventId);
    if (!targetEvent) {
      toast.error("Selected event not found.");
      return;
    }

    // Guard against duplicate volunteer assignment for the same event
    const isAlreadyAssigned = volunteers.some(
      (v) =>
        v.eventId === volunteerEventId &&
        (v.studentId === selectedStudentForVolunteer.id ||
          v.studentId === selectedStudentForVolunteer.studentId),
    );
    if (isAlreadyAssigned) {
      toast.error(
        `${selectedStudentForVolunteer.name} is already assigned as a volunteer for ${targetEvent.name}.`,
      );
      return;
    }

    try {
      setSaving(true);
      const saved = await eventVolunteersService.assign({
        eventId: targetEvent.id,
        eventName: targetEvent.name,
        // MUST use student's database primary key UUID referencing public.students(id)
        studentId: selectedStudentForVolunteer.id,
        studentName: selectedStudentForVolunteer.name,
        program: selectedStudentForVolunteer.program,
        yearLevel: selectedStudentForVolunteer.yearLevel,
        section: selectedStudentForVolunteer.section,
        roleOrTask: finalTask,
        eventDate: targetEvent.date,
      });

      setVolunteers((prev) => [saved, ...prev]);
      toast.success(
        `Assigned ${saved.studentName} as volunteer for ${saved.eventName} (${finalTask})`,
      );
      setIsAssignVolunteerOpen(false);
      setSelectedStudentForVolunteer(null);
      setCustomVolunteerTask("");
    } catch (err) {
      console.error("Failed to assign volunteer:", err);
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || "Failed to assign volunteer.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteVolunteer = async () => {
    if (!confirmDeleteVolunteer || saving) return;

    try {
      setSaving(true);
      await eventVolunteersService.remove(confirmDeleteVolunteer.id);
      setVolunteers((prev) =>
        prev.filter((v) => v.id !== confirmDeleteVolunteer.id),
      );
      toast.success(
        `Removed volunteer ${confirmDeleteVolunteer.studentName} from event.`,
      );
      setConfirmDeleteVolunteer(null);
    } catch (err) {
      console.error("Failed to remove volunteer:", err);
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || "Failed to remove volunteer.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (role !== "admin") {
    return (
      <Page title="LSC Officers & Event Volunteers" subtitle="Manage official positions and volunteers" onBack={onBack}>
        <div className="card">
          <EmptyState
            icon={AlertCircle}
            title="Administrator Access Required"
            description="Only the Admin has permission to select LSC Officers, assign official positions, and manage event volunteers."
            action={
              <button onClick={onBack} className="btn btn-primary">
                Return to Dashboard
              </button>
            }
          />
        </div>
      </Page>
    );
  }

  const isOfficerFiltered = officerSearch !== "" || roleFilter !== "all" || programFilter !== "all";
  const isVolunteerFiltered = volunteerSearch !== "" || eventFilter !== "all";
  const editingExistingOfficer =
    !!selectedStudentForOfficer && officerStudentIdMap.has(selectedStudentForOfficer.studentId.trim().toLowerCase());
  const assignOfficerButton = (
    <button onClick={() => handleOpenAssignOfficer()} className="btn btn-primary">
      <UserPlus className="h-4 w-4" /> Assign LSC Officer
    </button>
  );
  const assignVolunteerButton = (
    <button onClick={handleOpenAssignVolunteer} className="btn btn-primary">
      <Plus className="h-4 w-4" /> Assign Event Volunteer
    </button>
  );

  return (
    <Page
      eyebrow="Council roster"
      title="LSC Officers & Event Volunteers"
      subtitle="Strict manual assignment of official positions and event volunteers"
      onBack={onBack}
      actions={activeTab === "officers" ? assignOfficerButton : assignVolunteerButton}
      hero={
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard featured icon={ShieldCheck} label="Total Officers" value={stats.totalOfficers} hint="Officially appointed" />
          <StatCard icon={Award} label="Board Members" value={stats.boardMembersCount} hint="Manual board roles" />
          <StatCard icon={Layers} tone="warning" label="Committees" value={stats.committeeCount} hint="Creatives & Tech" />
          <StatCard icon={Users} tone="success" label="Event Volunteers" value={stats.totalVolunteers} hint="Active assignments" />
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
          ).map(({ tab, label, icon: Icon, count }) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab)}
                className={cn("btn btn-sm", active ? "btn-primary" : "btn-ghost")}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
                <span className={cn("rounded-full px-1.5 text-[11px]", active ? "bg-white/20" : "bg-surface-2")}>{count}</span>
              </button>
            );
          })}
        </div>

        {activeTab === "officers" ? (
          <>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <SearchInput
                value={officerSearch}
                onChange={setOfficerSearch}
                placeholder="Search officers by name, student ID, or position…"
                className="flex-1"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input lg:w-52" aria-label="Official role">
                  <option value="all">All Official Roles</option>
                  {OFFICIAL_LSC_POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </select>
                <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} className="input lg:w-40" aria-label="Program">
                  <option value="all">All Programs</option>
                  {programOptions.map((prog) => (
                    <option key={prog} value={prog}>
                      {prog}
                    </option>
                  ))}
                </select>
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
            <SearchInput
              value={volunteerSearch}
              onChange={setVolunteerSearch}
              placeholder="Search volunteers by student name, ID, or task…"
              className="flex-1"
            />
            <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className="input lg:w-60" aria-label="Event">
              <option value="all">All Events</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <LoadingCard label={activeTab === "officers" ? "Loading officers…" : "Loading volunteers…"} />
      ) : activeTab === "officers" ? (
        filteredOfficers.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={ShieldCheck}
              title={isOfficerFiltered ? "No officers found" : "No LSC Officers yet"}
              description={
                isOfficerFiltered
                  ? "No officers match the selected search or filter criteria."
                  : "No students have been assigned as LSC Officers yet. Appoint the first officer to get started."
              }
              action={!isOfficerFiltered && assignOfficerButton}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredOfficers.map((officer) => (
              <OfficerCard
                key={officer.id}
                officer={officer}
                photoUrl={studentByStudentId.get(officer.studentId.trim().toLowerCase())?.profilePhotoUrl}
                onManage={() => handleOpenAssignOfficer(officer)}
                onRemoveRole={(roleName) => setConfirmRemoveRole({ officer, role: roleName })}
                onRemove={() => setConfirmDeleteOfficer(officer)}
              />
            ))}
          </div>
        )
      ) : filteredVolunteers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Users}
            title={isVolunteerFiltered ? "No volunteers found" : "No event volunteers yet"}
            description={
              isVolunteerFiltered
                ? "No volunteers match your criteria."
                : "No students have been assigned as volunteers for events yet. Assign a student to an event to get started."
            }
            action={!isVolunteerFiltered && assignVolunteerButton}
          />
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
                      <p className="font-mono text-xs text-muted">{studentMap.get(vol.studentId)?.studentId || vol.studentId}</p>
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
                        onClick={() => setConfirmDeleteVolunteer(vol)}
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

      {/* Assign / manage officer */}
      <Modal
        open={isAssignOfficerOpen}
        onClose={() => setIsAssignOfficerOpen(false)}
        size="lg"
        title={editingExistingOfficer ? "Manage LSC Officer Roles" : "Appoint LSC Officer"}
        description="Pick a student, then toggle every official position they hold."
        icon={<ShieldCheck className="h-5 w-5 text-brand-500" />}
        footer={
          <>
            <button type="button" onClick={() => setIsAssignOfficerOpen(false)} className="btn btn-secondary" disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmOfficerAssignment}
              disabled={saving || !selectedStudentForOfficer || selectedPositions.length === 0}
              className="btn btn-primary"
            >
              <ShieldCheck className="h-4 w-4" />
              {saving ? "Saving…" : editingExistingOfficer ? "Save Officer Assignment" : "Assign LSC Officer"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <p className="label">1. Select Student</p>
            {selectedStudentForOfficer ? (
              <SelectedStudent
                name={selectedStudentForOfficer.name}
                meta={
                  <>
                    ID: <span className="font-mono text-ink">{selectedStudentForOfficer.studentId}</span> ·{" "}
                    {classLabel(selectedStudentForOfficer.program, selectedStudentForOfficer.yearLevel, selectedStudentForOfficer.section)}
                  </>
                }
                onChange={() => {
                  setSelectedStudentForOfficer(null);
                  setSelectedPositions([]);
                }}
              />
            ) : (
              <StudentPicker
                query={studentSearchInModal}
                onQuery={setStudentSearchInModal}
                results={searchedStudentsForOfficer}
                meta={(s) => `${s.studentId} · ${s.program}`}
                badge={(s) => officerStudentIdMap.has(s.studentId.trim().toLowerCase()) && <span className="chip chip-brand">Current Officer</span>}
                onPick={(s) => {
                  setSelectedStudentForOfficer(s);
                  const existing = officerStudentIdMap.get(s.studentId.trim().toLowerCase());
                  setSelectedPositions(existing ? [...(existing.positions as string[])] : []);
                }}
              />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="label">2. Select Official Positions / Roles</p>
              <span className="chip chip-brand mb-1.5">{selectedPositions.length} selected</span>
            </div>

            {selectedPositions.length > 0 && (
              <div className="mb-3 rounded-2xl border border-brand-500/20 bg-brand-500/5 px-3.5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Resulting Official Title</p>
                <p className="mt-0.5 break-words text-sm font-bold text-ink">{formatLscPositions(selectedPositions)}</p>
              </div>
            )}

            <div className="space-y-2.5">
              {POSITION_CATEGORIES.map((cat) => (
                <div key={cat.category} className="rounded-2xl border border-line/70 bg-surface-2/60 p-3.5">
                  <p className="text-sm font-semibold text-ink">{cat.category}</p>
                  <p className="text-xs text-muted">{cat.description}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {cat.positions.map((pos) => {
                      const isSelected = selectedPositions.includes(pos);
                      return (
                        <button
                          key={pos}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => handleTogglePosition(pos)}
                          className={cn("btn btn-sm", isSelected ? "btn-primary" : "btn-secondary")}
                        >
                          {isSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
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

      {/* Assign event volunteer */}
      <Modal
        open={isAssignVolunteerOpen}
        onClose={() => setIsAssignVolunteerOpen(false)}
        title="Assign Event Volunteer"
        description="Give a student a task for one event."
        icon={<Users className="h-5 w-5 text-brand-500" />}
        footer={
          <>
            <button type="button" onClick={() => setIsAssignVolunteerOpen(false)} className="btn btn-secondary" disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmVolunteerAssignment}
              disabled={
                saving ||
                !volunteerEventId ||
                !selectedStudentForVolunteer ||
                (volunteerTask === "Custom" && !customVolunteerTask.trim())
              }
              className="btn btn-primary"
            >
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
              <select value={volunteerEventId} onChange={(e) => setVolunteerEventId(e.target.value)} className="input">
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div>
            <p className="label">2. Select Student</p>
            {selectedStudentForVolunteer ? (
              <SelectedStudent
                name={selectedStudentForVolunteer.name}
                meta={
                  <>
                    ID: <span className="font-mono text-ink">{selectedStudentForVolunteer.studentId}</span>
                  </>
                }
                onChange={() => setSelectedStudentForVolunteer(null)}
              />
            ) : (
              <StudentPicker
                query={volunteerStudentSearchInModal}
                onQuery={setVolunteerStudentSearchInModal}
                results={searchedStudentsForVolunteer}
                meta={(s) => s.studentId}
                onPick={setSelectedStudentForVolunteer}
              />
            )}
          </div>

          <Field label="3. Assigned Task / Role">
            <select value={volunteerTask} onChange={(e) => setVolunteerTask(e.target.value)} className="input">
              {PRESET_VOLUNTEER_TASKS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="Custom">Custom Task…</option>
            </select>
          </Field>
          {volunteerTask === "Custom" && (
            <input
              type="text"
              value={customVolunteerTask}
              onChange={(e) => setCustomVolunteerTask(e.target.value)}
              placeholder="Enter specific task description…"
              className="input"
              aria-label="Custom task"
            />
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmRemoveRole}
        title="Remove Official Role?"
        description={`Are you sure you want to remove the "${confirmRemoveRole?.role}" role from ${confirmRemoveRole?.officer.name}? Other assigned roles will remain untouched.`}
        confirmLabel="Remove Role"
        loading={saving}
        onConfirm={handleConfirmRemoveSingleRole}
        onClose={() => setConfirmRemoveRole(null)}
      />

      <ConfirmDialog
        open={!!confirmDeleteOfficer}
        title="Remove Officer Status?"
        description={`Are you sure you want to remove all officer roles and positions from ${confirmDeleteOfficer?.name}?`}
        confirmLabel="Remove Officer"
        loading={saving}
        onConfirm={handleConfirmDeleteOfficer}
        onClose={() => setConfirmDeleteOfficer(null)}
      />

      <ConfirmDialog
        open={!!confirmDeleteVolunteer}
        title="Remove Volunteer Assignment?"
        description={`Are you sure you want to remove ${confirmDeleteVolunteer?.studentName} from "${confirmDeleteVolunteer?.eventName}"?`}
        confirmLabel="Remove Volunteer"
        loading={saving}
        onConfirm={handleConfirmDeleteVolunteer}
        onClose={() => setConfirmDeleteVolunteer(null)}
      />
    </Page>
  );
}

/** "BSIT-3 A" style class label. */
function classLabel(program: string, yearLevel?: number, section?: string): string {
  return [`${program}${yearLevel ? `-${yearLevel}` : ""}`, section].filter(Boolean).join(" ");
}

interface OfficerCardProps {
  officer: LscOfficer;
  photoUrl?: string;
  onManage: () => void;
  onRemoveRole: (role: string) => void;
  onRemove: () => void;
}

function OfficerCard({ officer, photoUrl, onManage, onRemoveRole, onRemove }: OfficerCardProps) {
  return (
    <article className="card card-hover flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-line/70 bg-brand-500/10 text-base font-bold text-brand-600">
          {photoUrl ? (
            <img src={photoUrl} alt={`${officer.name}'s profile`} className="h-full w-full object-cover" draggable={false} />
          ) : (
            officer.name.charAt(0)
          )}
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
        {(officer.positions as string[]).map((roleName) => (
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

function SelectedStudent({ name, meta, onChange }: { name: string; meta: ReactNode; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{name}</p>
        <p className="truncate text-xs text-muted">{meta}</p>
      </div>
      <button type="button" onClick={onChange} className="btn btn-ghost btn-sm">
        Change
      </button>
    </div>
  );
}

interface StudentPickerProps {
  query: string;
  onQuery: (query: string) => void;
  /** Matches for the current query (empty while the query is empty). */
  results: Student[];
  meta: (student: Student) => string;
  badge?: (student: Student) => ReactNode;
  onPick: (student: Student) => void;
}

function StudentPicker({ query, onQuery, results, meta, badge, onPick }: StudentPickerProps) {
  return (
    <div className="space-y-2">
      <SearchInput value={query} onChange={onQuery} placeholder="Search student by name or ID…" />
      {query && (
        <div className="max-h-48 divide-y divide-line overflow-y-auto rounded-2xl border border-line">
          {results.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted">No students found.</p>
          ) : (
            results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s)}
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
