import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  UserPlus,
  Users,
  Search,
  Plus,
  Trash2,
  Edit2,
  X,
  CheckCircle2,
  Award,
  Layers,
  Sparkles,
  Info,
  AlertCircle,
} from "lucide-react";
import SectionLayout from "@/components/common/SectionLayout";
import SectionLoader from "@/components/SectionLoader";
import SectionEmptyState from "@/components/SectionEmptyState";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import SearchFilterBar from "@/components/common/SearchFilterBar";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  lscOfficersService,
  eventVolunteersService,
  studentsService,
  eventsService,
  formatLscPositions,
  OFFICIAL_LSC_POSITIONS,
  subscribeToTables,
} from "@/services/db";
import type {
  LscOfficer,
  EventVolunteer,
  Student,
  Event,
  UserRole,
  OfficialLscPosition,
} from "@/types";
import { toast } from "sonner";

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
    return subscribeToTables(
      ["lsc_officers", "event_volunteers", "students", "events"],
      () => void loadData(),
      "officer-volunteers-management",
    );
  }, [loadData]);

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
      <SectionLayout
        title="LSC Officers & Event Volunteers"
        subtitle="Manage official positions and volunteers"
        onBack={onBack}
      >
        <div className="glass-card p-8 text-center max-w-lg mx-auto my-12">
          <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-dark mb-2">
            Administrator Access Required
          </h2>
          <p className="text-sm text-text-secondary mb-6">
            Only the Admin has permission to select LSC Officers, assign official
            positions, and manage event volunteers.
          </p>
          <button onClick={onBack} className="btn-primary px-6 py-2">
            Return to Dashboard
          </button>
        </div>
      </SectionLayout>
    );
  }

  return (
    <SectionLayout
      title="LSC Officers & Event Volunteers"
      subtitle="Strict manual assignment of official positions and event volunteers"
      onBack={onBack}
      headerActions={
        <div className="flex items-center gap-2">
          {activeTab === "officers" ? (
            <button
              onClick={() => handleOpenAssignOfficer()}
              className="btn-primary flex items-center gap-2 px-4 py-2 text-sm shadow-md hover:shadow-lg transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>Assign LSC Officer</span>
            </button>
          ) : (
            <button
              onClick={handleOpenAssignVolunteer}
              className="btn-primary flex items-center gap-2 px-4 py-2 text-sm shadow-md hover:shadow-lg transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Assign Event Volunteer</span>
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-2">
          <button
            onClick={() => setActiveTab("officers")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeTab === "officers"
                ? "bg-lsc-gold text-navy-dark shadow-sm font-semibold"
                : "text-text-secondary hover:text-dark hover:bg-white/5"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>LSC Officers ({officers.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("volunteers")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              activeTab === "volunteers"
                ? "bg-lsc-gold text-navy-dark shadow-sm font-semibold"
                : "text-text-secondary hover:text-dark hover:bg-white/5"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Event Volunteers ({volunteers.length})</span>
          </button>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card p-4 rounded-xl border border-white/10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Total Officers
              </span>
              <ShieldCheck className="w-4 h-4 text-lsc-gold" />
            </div>
            <p className="text-2xl font-bold text-dark">{stats.totalOfficers}</p>
            <p className="text-xs text-text-secondary mt-1">Officially appointed</p>
          </div>

          <div className="glass-card p-4 rounded-xl border border-white/10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Board Members
              </span>
              <Award className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-blue-400">
              {stats.boardMembersCount}
            </p>
            <p className="text-xs text-text-secondary mt-1">Manual board roles</p>
          </div>

          <div className="glass-card p-4 rounded-xl border border-white/10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Committees
              </span>
              <Layers className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-2xl font-bold text-purple-400">
              {stats.committeeCount}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Creatives & Tech
            </p>
          </div>

          <div className="glass-card p-4 rounded-xl border border-white/10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Event Volunteers
              </span>
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400">
              {stats.totalVolunteers}
            </p>
            <p className="text-xs text-text-secondary mt-1">Active assignments</p>
          </div>
        </div>

        {/* TAB 1: LSC OFFICERS */}
        {activeTab === "officers" && (
          <div className="space-y-4">
            {/* Search and Filters */}
            <div className="glass-card p-4 rounded-xl space-y-3">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1">
                  <SearchFilterBar
                    value={officerSearch}
                    onChange={setOfficerSearch}
                    placeholder="Search officers by name, student ID, or position..."
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="glass-select text-sm px-3 py-2 rounded-lg min-w-[180px]"
                  >
                    <option value="all">All Official Roles</option>
                    {OFFICIAL_LSC_POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>

                  <select
                    value={programFilter}
                    onChange={(e) => setProgramFilter(e.target.value)}
                    className="glass-select text-sm px-3 py-2 rounded-lg min-w-[140px]"
                  >
                    <option value="all">All Programs</option>
                    {programOptions.map((prog) => (
                      <option key={prog} value={prog}>
                        {prog}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Policy note */}
              <div className="flex items-center gap-2 text-xs text-text-secondary bg-white/5 p-2 rounded-lg">
                <Info className="w-3.5 h-3.5 text-lsc-gold shrink-0" />
                <span>
                  <strong>Strict Policy:</strong> Zero automatic inferences. Adding a
                  role never replaces existing roles; removing an individual role
                  leaves remaining roles intact.
                </span>
              </div>
            </div>

            {/* Officers Grid */}
            {loading ? (
              <SectionLoader />
            ) : filteredOfficers.length === 0 ? (
              <SectionEmptyState
                message={
                  officerSearch || roleFilter !== "all" || programFilter !== "all"
                    ? "No officers match the selected search or filter criteria."
                    : "No students have been assigned as LSC Officers yet. Click 'Assign LSC Officer' above to appoint an officer."
                }
                icon={ShieldCheck}
                card
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOfficers.map((officer) => (
                  <div
                    key={officer.id}
                    className="glass-card p-5 rounded-xl border border-white/10 flex flex-col justify-between hover:border-lsc-gold/40 transition-all shadow-sm"
                  >
                    <div>
                      {/* Officer Header */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-12 h-12 rounded-full overflow-hidden border border-white/20 bg-navy-card shrink-0 flex items-center justify-center">
                          {studentByStudentId.get(officer.studentId.trim().toLowerCase())?.profilePhotoUrl ? (
                            <img
                              src={studentByStudentId.get(officer.studentId.trim().toLowerCase())?.profilePhotoUrl}
                              alt={`${officer.name}'s profile`}
                              className="h-full w-full object-cover"
                              draggable={false}
                            />
                          ) : (
                            <div className="w-full h-full bg-lsc-gold/20 flex items-center justify-center text-lsc-gold font-bold text-base">
                              {officer.name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-lg text-dark leading-tight truncate">
                            {officer.name}
                          </h3>
                          <p className="text-xs text-text-secondary mt-0.5">
                            ID: <span className="font-mono text-dark">{officer.studentId}</span>
                          </p>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-primary-500/10 text-primary-400 border border-primary-500/20 shrink-0">
                          {officer.program} {officer.yearLevel ? `-${officer.yearLevel}` : ""} {officer.section}
                        </span>
                      </div>

                      {/* Official Formatted Position Banner */}
                      <div className="mb-3 p-2.5 rounded-lg bg-navy-card/90 border border-lsc-gold/30">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-lsc-gold flex items-center gap-1 mb-1">
                          <ShieldCheck className="w-3 h-3" />
                          Official Position Display
                        </span>
                        <p className="text-sm font-bold text-dark leading-snug">
                          {formatLscPositions(officer.positions)}
                        </p>
                      </div>

                      {/* Individual Roles with independent remove (x) */}
                      <div className="mb-4">
                        <p className="text-xs text-text-secondary mb-1.5 font-medium">
                          Individual Assigned Roles:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(officer.positions as string[]).map((roleName) => (
                            <span
                              key={roleName}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-white/10 text-dark border border-white/15"
                            >
                              <span>{roleName}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmRemoveRole({ officer, role: roleName })
                                }
                                title={`Remove ${roleName} role only`}
                                className="text-text-secondary hover:text-red-400 transition-colors p-0.5 rounded"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Officer Actions */}
                    <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleOpenAssignOfficer(officer)}
                        className="glass-button flex-1 py-1.5 px-3 text-xs flex items-center justify-center gap-1.5 text-dark hover:text-lsc-gold font-medium"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Manage Roles</span>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteOfficer(officer)}
                        className="glass-button p-2 text-text-secondary hover:text-red-400 hover:border-red-400/30 transition-colors"
                        title="Remove Officer Status"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: EVENT VOLUNTEERS */}
        {activeTab === "volunteers" && (
          <div className="space-y-4">
            {/* Search and Filters */}
            <div className="glass-card p-4 rounded-xl flex flex-col md:flex-row gap-3">
              <div className="flex-1">
                <SearchFilterBar
                  value={volunteerSearch}
                  onChange={setVolunteerSearch}
                  placeholder="Search volunteers by student name, ID, or task..."
                />
              </div>
              <div>
                <select
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  className="glass-select text-sm px-3 py-2 rounded-lg min-w-[200px]"
                >
                  <option value="all">All Events</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Volunteers Table */}
            {loading ? (
              <SectionLoader />
            ) : filteredVolunteers.length === 0 ? (
              <SectionEmptyState
                message={
                  volunteerSearch || eventFilter !== "all"
                    ? "No volunteers match your criteria."
                    : "No students have been assigned as volunteers for events yet. Click 'Assign Event Volunteer' above to assign a student."
                }
                icon={Users}
                card
              />
            ) : (
              <div className="glass-card overflow-hidden rounded-xl border border-white/10">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white/5 border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      <tr>
                        <th className="p-4">Student</th>
                        <th className="p-4">Program / Section</th>
                        <th className="p-4">Event</th>
                        <th className="p-4">Assigned Task / Role</th>
                        <th className="p-4">Assigned On</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-normal">
                      {filteredVolunteers.map((vol) => {
                        const studentInfo = studentMap.get(vol.studentId);
                        const displayStudentId = studentInfo?.studentId || vol.studentId;
                        return (
                          <tr key={vol.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4">
                              <div className="font-semibold text-dark">{vol.studentName}</div>
                              <div className="text-xs font-mono text-text-secondary">
                                {displayStudentId}
                              </div>
                            </td>
                            <td className="p-4 text-text-secondary text-xs">
                              {vol.program || "N/A"}{" "}
                              {vol.yearLevel ? `-${vol.yearLevel}` : ""} {vol.section || ""}
                            </td>
                            <td className="p-4">
                              <span className="font-medium text-dark">{vol.eventName}</span>
                            </td>
                            <td className="p-4">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                <Sparkles className="w-3 h-3" />
                                {vol.roleOrTask}
                              </span>
                            </td>
                            <td className="p-4 text-xs text-text-secondary">
                              {new Date(vol.createdAt).toLocaleDateString()}
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => setConfirmDeleteVolunteer(vol)}
                                className="p-1.5 rounded-lg text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                title="Remove Volunteer Assignment"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= ASSIGN OFFICER MODAL ================= */}
        <Dialog open={isAssignOfficerOpen} onOpenChange={setIsAssignOfficerOpen}>
          <DialogContent
            noScrollArea
            showCloseButton={false}
            className="lsc-officer-modal glass-card-strong w-[calc(100vw-32px)] max-w-[520px] max-h-[90vh] flex flex-col gap-0 overflow-hidden rounded-xl border-white/20 p-0"
          >
            <DialogHeader className="lsc-officer-modal__header shrink-0 flex-row items-center justify-between gap-3 border-b border-white/10 px-6 py-0 text-left">
              <div className="flex min-w-0 items-center gap-2.5">
                <ShieldCheck className="h-[18px] w-[18px] shrink-0 text-lsc-gold" />
                <DialogTitle className="truncate text-lg font-semibold leading-[1.2] text-dark">
                  {selectedStudentForOfficer &&
                  officerStudentIdMap.has(
                    selectedStudentForOfficer.studentId.trim().toLowerCase(),
                  )
                    ? "Manage LSC Officer Roles"
                    : "Appoint LSC Officer"}
                </DialogTitle>
              </div>
              <DialogClose className="lsc-officer-modal__close ring-offset-background focus:ring-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary opacity-80 transition-opacity hover:bg-white/10 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2">
                <X className="h-[18px] w-[18px]" />
                <span className="sr-only">Close</span>
              </DialogClose>
            </DialogHeader>

            <ScrollArea type="always" className="lsc-officer-modal__content min-h-0 flex-1">
              <div className="lsc-officer-modal__content-inner w-full min-w-0 space-y-3">
                {/* Step 1: Select Student */}
                <div className="lsc-officer-modal__section w-full min-w-0">
                <label className="lsc-officer-modal__section-title block text-xs font-semibold uppercase tracking-[0.03em] text-text-secondary">
                  1. Select Student
                </label>
                {selectedStudentForOfficer ? (
                  <div className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between gap-3 w-full min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-dark truncate">
                        {selectedStudentForOfficer.name}
                      </p>
                      <p className="text-xs text-text-secondary truncate">
                        ID: <span className="font-mono text-dark">{selectedStudentForOfficer.studentId}</span> • {selectedStudentForOfficer.program} {selectedStudentForOfficer.yearLevel ? `-${selectedStudentForOfficer.yearLevel}` : ""} {selectedStudentForOfficer.section}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudentForOfficer(null);
                        setSelectedPositions([]);
                      }}
                      className="text-xs text-text-secondary hover:text-red-400 p-1 shrink-0 font-medium transition-colors"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="w-full min-w-0">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                      <input
                        type="text"
                        value={studentSearchInModal}
                        onChange={(e) => setStudentSearchInModal(e.target.value)}
                        placeholder="Search student by name or ID..."
                        className="lsc-officer-modal__input glass-input h-[38px] w-full rounded-[9px] px-3 pl-9 text-sm"
                        autoFocus
                      />
                    </div>
                    {studentSearchInModal && (
                      <div className="max-h-48 overflow-y-auto visible-scrollbar rounded-lg border border-white/10 bg-navy-card divide-y divide-white/5">
                        {searchedStudentsForOfficer.length === 0 ? (
                          <p className="text-xs text-text-secondary p-3 text-center">
                            No students found.
                          </p>
                        ) : (
                          searchedStudentsForOfficer.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setSelectedStudentForOfficer(s);
                                const existing = officerStudentIdMap.get(
                                  s.studentId.trim().toLowerCase(),
                                );
                                if (existing) {
                                  setSelectedPositions([...(existing.positions as string[])]);
                                } else {
                                  setSelectedPositions([]);
                                }
                              }}
                              className="w-full text-left p-2.5 hover:bg-white/5 flex items-center justify-between transition-colors"
                            >
                              <div className="min-w-0 flex-1 mr-2">
                                <div className="text-sm font-semibold text-dark truncate">{s.name}</div>
                                <div className="text-xs text-text-secondary truncate">{s.studentId} • {s.program}</div>
                              </div>
                              {officerStudentIdMap.has(s.studentId.trim().toLowerCase()) && (
                                <span className="text-[10px] font-semibold bg-lsc-gold/20 text-lsc-gold px-2 py-0.5 rounded shrink-0">
                                  Current Officer
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Assign Official Roles (Multi-select) */}
              <div className="lsc-officer-modal__section w-full min-w-0">
                <div className="lsc-officer-modal__section-header flex items-center justify-between gap-2">
                  <label className="lsc-officer-modal__section-title block text-xs font-semibold uppercase tracking-[0.03em] text-text-secondary">
                    3. Select Official Positions / Roles
                  </label>
                  <span className="shrink-0 text-[11px] font-medium text-lsc-gold">
                    {selectedPositions.length} selected
                  </span>
                </div>

                {/* Formatted Preview */}
                {selectedPositions.length > 0 && (
                  <div className="mb-3 p-2.5 rounded-lg bg-navy-card/80 border border-lsc-gold/30">
                    <span className="text-[10px] uppercase font-bold text-text-secondary block mb-1">
                      Resulting Official Title:
                    </span>
                    <span className="text-sm font-bold text-dark break-words">
                      {formatLscPositions(selectedPositions)}
                    </span>
                  </div>
                )}

                {/* Categories */}
                <div className="lsc-officer-modal__role-groups flex w-full min-w-0 flex-col">
                  {POSITION_CATEGORIES.map((cat) => (
                    <div
                      key={cat.category}
                      className="lsc-officer-modal__role-card w-full min-w-0 rounded-[10px] border border-white/5 bg-white/5"
                    >
                      <div className="lsc-officer-modal__role-group-header w-full">
                        <span className="block text-xs font-semibold leading-[1.3] text-dark">
                          {cat.category}
                        </span>
                        <span className="block text-[10px] leading-[1.35] text-text-secondary opacity-75">
                          {cat.description}
                        </span>
                      </div>
                      <div className="lsc-officer-modal__role-buttons flex w-full flex-wrap items-center">
                        {cat.positions.map((pos) => {
                          const isSelected = selectedPositions.includes(pos);
                          return (
                            <button
                              key={pos}
                              type="button"
                              onClick={() => handleTogglePosition(pos)}
                              className={`lsc-officer-modal__role-button inline-flex h-[30px] min-h-[30px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-2.5 text-[11px] font-medium transition-all ${
                                isSelected
                                  ? "bg-lsc-gold text-navy-dark shadow-sm font-semibold ring-1 ring-lsc-gold"
                                  : "bg-white/10 text-dark hover:bg-white/20 border border-white/10"
                              }`}
                            >
                              {isSelected ? (
                                <CheckCircle2 className="h-[13px] w-[13px] shrink-0" />
                              ) : (
                                <Plus className="h-[13px] w-[13px] shrink-0 text-text-secondary" />
                              )}
                              <span>{pos}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              </div>
            </ScrollArea>

            {/* Action buttons (pinned DialogFooter) */}
            <DialogFooter className="lsc-officer-modal__footer flex-row items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAssignOfficerOpen(false)}
                className="lsc-officer-modal__cancel glass-button inline-flex h-[34px] items-center justify-center rounded-[9px] px-3.5 text-sm text-text-secondary hover:text-dark"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmOfficerAssignment}
                disabled={
                  saving ||
                  !selectedStudentForOfficer ||
                  selectedPositions.length === 0
                }
                className="lsc-officer-modal__assign btn-primary inline-flex h-[34px] min-w-[170px] items-center justify-center gap-1.5 rounded-[9px] px-4 text-sm shadow-md"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  {saving
                    ? "Saving..."
                    : selectedStudentForOfficer &&
                        officerStudentIdMap.has(
                          selectedStudentForOfficer.studentId.trim().toLowerCase(),
                        )
                      ? "Save Officer Assignment"
                      : "Assign LSC Officer"}
                </span>
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ================= ASSIGN VOLUNTEER MODAL ================= */}
        <Dialog open={isAssignVolunteerOpen} onOpenChange={setIsAssignVolunteerOpen}>
          <DialogContent
            noScrollArea
            className="glass-card-strong w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] flex flex-col border-white/20 p-5 sm:p-6"
          >
            <DialogHeader className="pr-6 pb-3 border-b border-white/10 shrink-0">
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-dark">
                <Users className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="truncate">Assign Event Volunteer</span>
              </DialogTitle>
            </DialogHeader>

            <ScrollArea type="always" className="flex-1 min-h-0 py-2 pr-2">
              <div className="space-y-4 py-1 pr-1 w-full min-w-0 max-w-full">
              <div className="w-full min-w-0">
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
                  1. Select Event
                </label>
                {events.length === 0 ? (
                  <p className="text-xs text-amber-400">No events available yet.</p>
                ) : (
                  <select
                    value={volunteerEventId}
                    onChange={(e) => setVolunteerEventId(e.target.value)}
                    className="glass-select w-full text-sm px-3 py-2 rounded-lg"
                  >
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="w-full min-w-0">
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
                  2. Select Student
                </label>
                {selectedStudentForVolunteer ? (
                  <div className="p-3 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between gap-3 w-full min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-dark truncate">{selectedStudentForVolunteer.name}</p>
                      <p className="text-xs text-text-secondary truncate">
                        ID: <span className="font-mono text-dark">{selectedStudentForVolunteer.studentId}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedStudentForVolunteer(null)}
                      className="text-xs text-text-secondary hover:text-red-400 p-1 shrink-0 font-medium transition-colors"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={volunteerStudentSearchInModal}
                        onChange={(e) => setVolunteerStudentSearchInModal(e.target.value)}
                        placeholder="Search student by name or ID..."
                        className="glass-input pl-9 w-full text-sm py-2 rounded-lg"
                      />
                    </div>
                    {volunteerStudentSearchInModal && (
                      <div className="max-h-40 overflow-y-auto visible-scrollbar rounded-lg border border-white/10 bg-navy-card divide-y divide-white/5">
                        {searchedStudentsForVolunteer.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelectedStudentForVolunteer(s)}
                            className="w-full text-left p-2.5 hover:bg-white/5 flex items-center justify-between transition-colors"
                          >
                            <div className="text-sm font-semibold text-dark">{s.name}</div>
                            <div className="text-xs text-text-secondary">{s.studentId}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="w-full min-w-0">
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary mb-1">
                  3. Assigned Task / Role
                </label>
                <select
                  value={volunteerTask}
                  onChange={(e) => setVolunteerTask(e.target.value)}
                  className="glass-select w-full text-sm px-3 py-2 rounded-lg mb-2"
                >
                  {PRESET_VOLUNTEER_TASKS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="Custom">Custom Task...</option>
                </select>
                {volunteerTask === "Custom" && (
                  <input
                    type="text"
                    value={customVolunteerTask}
                    onChange={(e) => setCustomVolunteerTask(e.target.value)}
                    placeholder="Enter specific task description..."
                    className="glass-input w-full text-sm py-2 rounded-lg"
                  />
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="pt-3 border-t border-white/10 flex items-center justify-end gap-2.5 w-full min-w-0 shrink-0 mt-auto">
            <button
              type="button"
              onClick={() => setIsAssignVolunteerOpen(false)}
              className="glass-button px-4 py-2 text-sm text-text-secondary hover:text-dark shrink-0"
              disabled={saving}
            >
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
              className="btn-primary px-5 py-2 text-sm flex items-center gap-2 shrink-0 shadow-md"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>{saving ? "Saving..." : "Assign Volunteer"}</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        {/* Confirm Remove Single Role */}
        <ConfirmDialog
          open={!!confirmRemoveRole}
          title="Remove Official Role?"
          description={`Are you sure you want to remove the "${confirmRemoveRole?.role}" role from ${confirmRemoveRole?.officer.name}? Other assigned roles will remain untouched.`}
          confirmLabel="Remove Role"
          loading={saving}
          onConfirm={handleConfirmRemoveSingleRole}
          onClose={() => setConfirmRemoveRole(null)}
        />

        {/* Confirm Delete Entire Officer Status */}
        <ConfirmDialog
          open={!!confirmDeleteOfficer}
          title="Remove Officer Status?"
          description={`Are you sure you want to remove all officer roles and positions from ${confirmDeleteOfficer?.name}?`}
          confirmLabel="Remove Officer"
          loading={saving}
          onConfirm={handleConfirmDeleteOfficer}
          onClose={() => setConfirmDeleteOfficer(null)}
        />

        {/* Confirm Delete Volunteer */}
        <ConfirmDialog
          open={!!confirmDeleteVolunteer}
          title="Remove Volunteer Assignment?"
          description={`Are you sure you want to remove ${confirmDeleteVolunteer?.studentName} from "${confirmDeleteVolunteer?.eventName}"?`}
          confirmLabel="Remove Volunteer"
          loading={saving}
          onConfirm={handleConfirmDeleteVolunteer}
          onClose={() => setConfirmDeleteVolunteer(null)}
        />
      </div>
    </SectionLayout>
  );
}

