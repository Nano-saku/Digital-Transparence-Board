import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type ChangeEvent,
} from "react";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  User,
  Calendar,
  Save,
  Loader2,
  Coins,
  FileText,
} from "lucide-react";
import { useSectionEntrance } from "@/hooks/useSectionEntrance";
import SectionLoader from "@/components/SectionLoader";
import SectionEmptyState from "@/components/SectionEmptyState";
import SectionBackButton from "@/components/SectionBackButton";
import {
  contributionsService,
  studentsService,
  eventsService,
  subscribeToTables,
} from "@/services/db";
import type { ContributionRecord, Student, Event } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatPeso } from "@/lib/format";
import { contributionStatus } from "@/lib/contributions";
import {
  parseCsv,
  excelRowsToRecords,
  pickField,
  parseAmount,
} from "@/lib/spreadsheet";
import { readSheet } from "read-excel-file/browser";
interface ContributionManagementSectionProps {
  onBack: () => void;
}

/** A contribution record enriched with the student's display info. */
interface ContributionRow extends ContributionRecord {
  studentName: string;
  studentId: string;
}

/** Form state shared by the Add and Edit modals. */
interface ContributionForm {
  studentId: string;
  eventId: string;
  requiredAmount: number;
  amountPaid: number;
}

const EMPTY_FORM: ContributionForm = {
  studentId: "",
  eventId: "",
  requiredAmount: 0,
  amountPaid: 0,
};

export default function ContributionManagementSection({
  onBack,
}: ContributionManagementSectionProps) {
  const [records, setRecords] = useState<ContributionRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ContributionRecord | null>(
    null,
  );
  const [form, setForm] = useState<ContributionForm>(EMPTY_FORM);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEvent, setFilterEvent] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [contributionToDelete, setContributionToDelete] =
    useState<ContributionRow | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [contributions, allStudents, allEvents] = await Promise.all([
        contributionsService.getAll(),
        studentsService.getAll(),
        eventsService.getAll(),
      ]);

      const studentById = new Map(allStudents.map((s) => [s.id, s]));
      const rows: ContributionRow[] = contributions.map((record) => {
        const student = studentById.get(record.studentId);
        return {
          ...record,
          studentName: student?.name ?? "Unknown Student",
          studentId: student?.studentId ?? "—",
        };
      });

      setRecords(rows);
      setStudents(allStudents);
      setEvents(allEvents);
    } catch (error) {
      console.error("Error loading contribution records:", error);
      toast.error("Failed to load contribution records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Records are always read from Supabase again after a related change, rather
  // than retaining a separate client-side copy of contribution data.
  useEffect(() => {
    return subscribeToTables(
      ["contributions", "students", "events"],
      loadData,
      "contribution-management",
    );
  }, [loadData]);

  useSectionEntrance(sectionRef, [
    {
      ref: contentRef,
      from: { y: "6vh", opacity: 0 },
      to: { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" },
    },
  ]);

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => a.name.localeCompare(b.name)),
    [students],
  );
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.name.localeCompare(b.name)),
    [events],
  );

  const filteredRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return records.filter((record) => {
      const matchesSearch =
        !query ||
        record.studentName.toLowerCase().includes(query) ||
        record.studentId.toLowerCase().includes(query);
      const matchesEvent = !filterEvent || record.eventId === filterEvent;
      const matchesStatus =
        !filterStatus || contributionStatus(record).label === filterStatus;
      return matchesSearch && matchesEvent && matchesStatus;
    });
  }, [records, searchTerm, filterEvent, filterStatus]);

  // Summary stats
  const totalRequired = useMemo(
    () => records.reduce((sum, r) => sum + r.requiredAmount, 0),
    [records],
  );
  const totalPaid = useMemo(
    () => records.reduce((sum, r) => sum + r.amountPaid, 0),
    [records],
  );
  const totalBalance = useMemo(
    () => records.reduce((sum, r) => sum + r.remainingBalance, 0),
    [records],
  );

  const computedBalance = Math.max(0, form.requiredAmount - form.amountPaid);

  const openAddModal = () => {
    setEditingRecord(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (record: ContributionRow) => {
    setEditingRecord(record);
    setForm({
      studentId: record.studentId,
      eventId: record.eventId,
      requiredAmount: record.requiredAmount,
      amountPaid: record.amountPaid,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    // Basic validation
    if (!form.studentId || !form.eventId) {
      toast.error("Please select both a student and an event");
      return;
    }
    if (form.requiredAmount <= 0) {
      toast.error("Required amount must be greater than zero");
      return;
    }
    if (form.amountPaid < 0) {
      toast.error("Amount paid cannot be negative");
      return;
    }

    const student = students.find((s) => s.id === form.studentId);
    const event = events.find((e) => e.id === form.eventId);
    if (!student || !event) {
      toast.error("Selected student or event no longer exists");
      return;
    }

    // One contribution record per student + event combination.
    const conflict = records.find(
      (r) =>
        (editingRecord ? r.id !== editingRecord.id : true) &&
        r.studentId === form.studentId &&
        r.eventId === form.eventId,
    );
    if (conflict) {
      toast.error(
        "This student already has a contribution record for that event",
      );
      return;
    }

    try {
      setSaving(true);
      const payload = {
        studentId: form.studentId,
        eventId: form.eventId,
        eventName: event.name,
        requiredAmount: form.requiredAmount,
        amountPaid: form.amountPaid,
        remainingBalance: computedBalance,
      };

      const enrich = (record: ContributionRecord) => {
        const studentInfo = students.find((s) => s.id === record.studentId);
        return {
          ...record,
          studentName: studentInfo?.name ?? "Unknown Student",
          studentId: studentInfo?.studentId ?? "—",
        };
      };

      if (editingRecord) {
        const updated = await contributionsService.update(
          editingRecord.id,
          payload,
        );
        setRecords(
          records.map((r) => (r.id === editingRecord.id ? enrich(updated) : r)),
        );
        toast.success("Contribution updated successfully");
      } else {
        const created = await contributionsService.create(payload);
        setRecords([...records, enrich(created)]);
        toast.success("Contribution added successfully");
      }

      setShowModal(false);
      setEditingRecord(null);
      setForm(EMPTY_FORM);
    } catch (error) {
      console.error("Error saving contribution record:", error);
      toast.error("Failed to save contribution record");
    } finally {
      setSaving(false);
    }
  };

  const handleContributionDelete = (record: ContributionRow) => {
    setContributionToDelete(record);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteContribution = async () => {
    if (!contributionToDelete) return;

    try {
      await contributionsService.delete(contributionToDelete.id);

      setRecords((prev) =>
        prev.filter((record) => record.id !== contributionToDelete.id),
      );

      toast.success(
        `${contributionToDelete.studentName}'s contribution record has been deleted.`,
      );

      setShowDeleteConfirm(false);
      setContributionToDelete(null);
    } catch (error) {
      console.error("Error deleting contribution:", error);

      toast.error(
        `Failed to delete ${contributionToDelete.studentName}'s contribution record.`,
      );
    }
  };
  // ---------------------------------------------------------------------------
  // CSV / Excel import
  // ---------------------------------------------------------------------------

  const importContributionRows = async (rows: Record<string, string>[]) => {
    if (rows.length === 0) {
      toast.error("File is empty or invalid");
      return;
    }

    // Lookup tables (case-insensitive) so rows can reference the student by
    // ID or by full name, and the event by name.
    const studentById = new Map(
      students.map((s) => [s.studentId.toLowerCase(), s]),
    );
    const studentByName = new Map(
      students.map((s) => [s.name.toLowerCase(), s]),
    );
    const eventByName = new Map(events.map((e) => [e.name.toLowerCase(), e]));

    const parsed: Array<Omit<ContributionRecord, "id">> = [];
    let unmatched = 0;

    for (const row of rows) {
      const fileStudentId = pickField(
        row,
        "studentid",
        "studentno",
        "studentnumber",
        "studid",
        "idnumber",
        "lrn",
        "id",
      );
      const studentName = pickField(row, "name", "fullname", "studentname");
      const eventName = pickField(
        row,
        "event",
        "eventname",
        "activity",
        "contributionfor",
      );

      const student =
        studentById.get(fileStudentId.toLowerCase()) ??
        studentByName.get(studentName.toLowerCase());
      const event = eventByName.get(eventName.toLowerCase());

      if (!student || !event) {
        unmatched++;
        continue;
      }

      const requiredAmount = parseAmount(
        pickField(
          row,
          "required",
          "requiredamount",
          "requiredamountpeso",
          "amount",
          "fee",
          "contribution",
        ),
      );
      if (requiredAmount <= 0) {
        unmatched++;
        continue;
      }

      const amountPaid = parseAmount(
        pickField(
          row,
          "amountpaid",
          "paid",
          "paidamount",
          "collected",
          "payment",
        ),
      );

      parsed.push({
        studentId: student.id,
        eventId: event.id,
        eventName: event.name,
        requiredAmount,
        amountPaid,
        remainingBalance: Math.max(0, requiredAmount - amountPaid),
      });
    }

    if (parsed.length === 0) {
      toast.error(
        "No valid rows found. Expected columns: Student ID / Name, Event, Required Amount, Amount Paid",
      );
      return;
    }

    // Skip rows that already exist in the table or are duplicated in the file.
    const existingKeys = new Set(
      records.map(
        (r) => `${r.studentId.toLowerCase()}|${r.eventId.toLowerCase()}`,
      ),
    );
    const seen = new Set<string>();
    const deduped = parsed.filter((c) => {
      const key = `${c.studentId.toLowerCase()}|${c.eventId.toLowerCase()}`;
      if (existingKeys.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (deduped.length === 0) {
      toast.info("All rows in the file already have contribution records");
      return;
    }

    try {
      setImporting(true);
      for (const payload of deduped) {
        await contributionsService.create(payload);
      }
      await loadData();
      const skipped = unmatched + (parsed.length - deduped.length);
      toast.success(
        skipped > 0
          ? `${deduped.length} contribution(s) imported, ${skipped} skipped (duplicates or unmatched)`
          : `${deduped.length} contribution(s) imported successfully`,
      );
    } catch (error) {
      console.error("Error importing contribution records:", error);
      toast.error("Failed to import contribution records");
    }
  };

  const handleImportFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const isExcel = file.name.toLowerCase().endsWith(".xlsx");
    if (!isCsv && !isExcel) {
      toast.error("Please upload a .csv or .xlsx file");
      return;
    }

    try {
      setImporting(true);
      const rows = isCsv
        ? parseCsv(await file.text())
        : excelRowsToRecords(await readSheet(file));
      await importContributionRows(rows);
    } catch (error) {
      console.error(`Error importing ${isCsv ? "CSV" : "Excel"} file:`, error);
      toast.error(`Failed to import ${isCsv ? "CSV" : "Excel"} file`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <section
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-orange relative overflow-hidden py-20 lg:py-24"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-40 left-20 w-72 h-72 rounded-full bg-white blur-3xl" />
        <div className="absolute bottom-40 right-20 w-96 h-96 rounded-full bg-white blur-3xl" />
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12"
      >
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <SectionBackButton onClick={onBack} />
            <div>
              <h1 className="font-display font-bold text-2xl lg:text-3xl text-dark">
                Contribution Records
              </h1>
              <p className="text-text-secondary text-sm">
                Manage each student's contribution to every event
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => importInputRef.current?.click()}
              className="glass-button px-4 py-2.5 text-sm w-fit"
              disabled={loading || importing}
              title="Import contribution records from a CSV (.csv) or Excel (.xlsx) file. Expected columns: Student ID / Name, Event, Required Amount, Amount Paid."
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>{importing ? "Importing..." : "Upload CSV / Excel"}</span>
            </button>
            <button
              onClick={openAddModal}
              className="btn-primary px-4 py-2.5 text-sm w-fit"
              disabled={loading || importing}
            >
              <Plus className="w-4 h-4" />
              <span>Add Contribution</span>
            </button>
          </div>

          {/* Hidden file input for CSV / Excel import */}
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleImportFileSelected}
          />
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="glass-card px-4 py-3">
            <p className="text-xs text-text-secondary">Total Records</p>
            <p className="text-xl font-bold text-dark">
              {records.length.toLocaleString()}
            </p>
          </div>
          <div className="glass-card px-4 py-3">
            <p className="text-xs text-text-secondary">Total Required</p>
            <p className="text-xl font-bold text-purple-600">
              {formatPeso(totalRequired)}
            </p>
          </div>
          <div className="glass-card px-4 py-3">
            <p className="text-xs text-text-secondary">Total Collected</p>
            <p className="text-xl font-bold text-green-600">
              {formatPeso(totalPaid)}
            </p>
          </div>
          <div className="glass-card px-4 py-3">
            <p className="text-xs text-text-secondary">Total Balance</p>
            <p className="text-xl font-bold text-red">
              {formatPeso(totalBalance)}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card p-4 mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder="Search by student name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="glass-input pl-10 pr-4 py-2 text-sm w-full"
              disabled={loading}
            />
          </div>
          <select
            value={filterEvent}
            onChange={(e) => setFilterEvent(e.target.value)}
            className="glass-input px-4 py-2 text-sm"
            disabled={loading}
          >
            <option value="">All Events</option>
            {sortedEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="glass-input px-4 py-2 text-sm"
            disabled={loading}
          >
            <option value="">All Statuses</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Partial Payment">Partial Payment</option>
            <option value="Fully Paid">Fully Paid</option>
          </select>
        </div>

        {/* Loading State */}
        {loading && <SectionLoader message="Loading contribution records..." />}

        {/* Records Table */}
        {!loading && (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Event</th>
                    <th className="text-right">Required</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Balance</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => {
                    const status = contributionStatus(record);
                    return (
                      <tr key={record.id} className="group">
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-red/10 flex items-center justify-center">
                              <User className="w-4 h-4 text-red" />
                            </div>
                            <div>
                              <span className="font-medium text-dark block">
                                {record.studentName}
                              </span>
                              <span className="text-xs text-text-secondary">
                                {record.studentId}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-text-secondary" />
                            <span className="text-text-secondary">
                              {record.eventName}
                            </span>
                          </div>
                        </td>
                        <td className="text-right text-text-secondary">
                          {formatPeso(record.requiredAmount)}
                        </td>
                        <td className="text-right font-medium text-green-600">
                          {formatPeso(record.amountPaid)}
                        </td>
                        <td className="text-right text-text-secondary">
                          {formatPeso(record.remainingBalance)}
                        </td>
                        <td className={`font-medium ${status.className}`}>
                          {status.label}
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditModal(record)}
                              className="p-2 rounded-lg"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4 text-blue-600" />
                            </button>
                            <button
                              onClick={() => handleContributionDelete(record)}
                              className="p-2 rounded-lg hover:bg-red-500/10"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 text-red" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredRecords.length === 0 && (
              <SectionEmptyState
                message="No contribution records found"
                icon={Coins}
                compact
              />
            )}
          </div>
        )}

        {/* Stats */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-text-secondary">
          <span>
            Total Records:{" "}
            <strong className="text-dark">{records.length}</strong>
          </span>
          <span>
            Filtered:{" "}
            <strong className="text-dark">{filteredRecords.length}</strong>
          </span>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Dialog
        open={showModal}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setShowModal(false);
            setEditingRecord(null);
          }
        }}
      >
        <DialogContent className="glass-card-strong max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              {editingRecord ? "Edit Contribution" : "Add Contribution"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Student
              </label>
              <select
                value={form.studentId}
                onChange={(e) =>
                  setForm({ ...form, studentId: e.target.value })
                }
                className="glass-input w-full px-4 py-2"
                disabled={saving}
              >
                <option value="">Select student...</option>
                {sortedStudents.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.studentId} – {student.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Event
              </label>
              <select
                value={form.eventId}
                onChange={(e) => setForm({ ...form, eventId: e.target.value })}
                className="glass-input w-full px-4 py-2"
                disabled={saving}
              >
                <option value="">Select event...</option>
                {sortedEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  Required Amount (₱)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.requiredAmount || ""}
                  onChange={(e) =>
                    setForm({ ...form, requiredAmount: Number(e.target.value) })
                  }
                  className="glass-input w-full px-4 py-2"
                  placeholder="e.g., 150"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  Amount Paid (₱)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.amountPaid || ""}
                  onChange={(e) =>
                    setForm({ ...form, amountPaid: Number(e.target.value) })
                  }
                  className="glass-input w-full px-4 py-2"
                  placeholder="e.g., 0"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="rounded-xl bg-white/30 border border-white/50 px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-text-secondary">Remaining Balance</span>
              <span
                className={`font-semibold ${computedBalance > 0 ? "text-red-500" : "text-green-600"}`}
              >
                {formatPeso(computedBalance)}
              </span>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingRecord(null);
                }}
                className="flex-1 glass-button px-4 py-2.5"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2"
                disabled={
                  saving ||
                  !form.studentId ||
                  !form.eventId ||
                  form.requiredAmount <= 0
                }
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {editingRecord ? "Update" : "Save"}
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete Contribution Confirmation Dialog */}
      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setShowDeleteConfirm(false);
            setContributionToDelete(null);
          }
        }}
      >
        <DialogContent className="glass-card-strong max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              Delete Contribution
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <p className="text-sm text-text-secondary">
              Are you sure you want to delete the contribution record for{" "}
              <span className="font-medium text-dark">
                {contributionToDelete?.studentName}
              </span>
              ?
            </p>

            <p className="text-xs text-text-secondary/80">
              This action cannot be undone. This student's contribution record
              for{" "}
              <span className="font-medium">
                {contributionToDelete?.eventName}
              </span>{" "}
              will be permanently removed.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setContributionToDelete(null);
                }}
                className="flex-1 glass-button px-4 py-2.5"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmDeleteContribution}
                className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2 !bg-red !border-none"
              >
                <Trash2 className="w-4 h-4" />
                Delete Contribution
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
