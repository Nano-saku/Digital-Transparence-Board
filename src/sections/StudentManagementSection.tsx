import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  User,
  FileSpreadsheet,
  Save,
  Loader2,
  QrCode,
} from "lucide-react";
import { getOrdinalSuffix } from "@/lib/format";
import SectionLoader from "@/components/SectionLoader";
import SectionEmptyState from "@/components/SectionEmptyState";
import SectionLayout from "@/components/common/SectionLayout";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import SearchFilterBar from "@/components/common/SearchFilterBar";
import { studentsService } from "@/services/db";
import type { Student } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import StudentQrModal from "@/components/StudentQrModal";
import { toast } from "sonner";
import { pickField } from "@/lib/spreadsheet";
import { ATTENDANCE_COURSES } from "@/lib/kmeans";
import { useSearch } from "@/hooks/useSearch";
import { useSpreadsheetImport } from "@/hooks/useSpreadsheetImport";
interface StudentManagementSectionProps {
  onBack: () => void;
}

export default function StudentManagementSection({
  onBack,
}: StudentManagementSectionProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [qrStudent, setQrStudent] = useState<Student | null>(null);

  // Form state for adding/editing
  const [formData, setFormData] = useState({
    studentId: "",
    name: "",
    program: "",
    yearLevel: 1,
    section: "",
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  // Load students from database
  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    try {
      setLoading(true);
      const data = await studentsService.getAll();
      setStudents(data);
    } catch (error) {
      console.error("Error loading students:", error);
      toast.error("Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  const { searchTerm, setSearchTerm, filters, setFilter, filtered: filteredStudents } =
    useSearch<Student>({
      items: students,
      searchKeys: ["name", "studentId"],
      filters: {
        program: (s) => s.program,
        year: (s) => s.yearLevel.toString(),
        section: (s) => s.section?.trim().replace(/^\d+/, "") ?? "",
      },
    });

  const programs = useMemo(
    () =>
      [
        ...new Set(
          students
            .map((s) => s.program?.trim())
            .filter((program): program is string => Boolean(program)),
        ),
      ].sort(),
    [students],
  );
  const yearLevels = useMemo(
    () => [...new Set(students.map((s) => s.yearLevel))].sort(),
    [students],
  );
  const sections = useMemo(
    () =>
      [
        ...new Set(
          students
            .map((s) => s.section?.trim().replace(/^\d+/, ""))
            .filter((section): section is string => Boolean(section)),
        ),
      ].sort(),
    [students],
  );
  const handleAddStudent = async () => {
    const studentId = formData.studentId.trim();
    const name = formData.name.trim();
    const program = formData.program.trim();
    const section = formData.section.trim();
    if (!studentId || !name || !program || !section) {
      toast.error("Please complete all student fields");
      return;
    }
    if (
      students.some(
        (student) =>
          student.studentId.toLowerCase() === studentId.toLowerCase(),
      )
    ) {
      toast.error("A student with this Student ID already exists");
      return;
    }
    try {
      setSaving(true);
      const newStudent = await studentsService.create({
        studentId,
        name,
        program,
        yearLevel: formData.yearLevel,
        section,
      });
      setStudents([...students, newStudent]);
      setShowAddModal(false);
      setFormData({
        studentId: "",
        name: "",
        program: "",
        yearLevel: 1,
        section: "",
      });
      toast.success("Student added successfully");
    } catch (error) {
      console.error("Error adding student:", error);
      toast.error("Failed to add student");
    } finally {
      setSaving(false);
    }
  };

  const handleEditStudent = async () => {
    if (editingStudent) {
      const studentId = formData.studentId.trim();
      const name = formData.name.trim();
      const program = formData.program.trim();
      const section = formData.section.trim();
      if (!studentId || !name || !program || !section) {
        toast.error("Please complete all student fields");
        return;
      }
      if (
        students.some(
          (student) =>
            student.id !== editingStudent.id &&
            student.studentId.toLowerCase() === studentId.toLowerCase(),
        )
      ) {
        toast.error("A student with this Student ID already exists");
        return;
      }
      try {
        setSaving(true);
        const updated = await studentsService.update(editingStudent.id, {
          studentId,
          name,
          program,
          yearLevel: formData.yearLevel,
          section,
        });
        setStudents(
          students.map((s) => (s.id === editingStudent.id ? updated : s)),
        );
        setEditingStudent(null);
        setFormData({
          studentId: "",
          name: "",
          program: "",
          yearLevel: 1,
          section: "",
        });
        toast.success("Student updated successfully");
      } catch (error) {
        console.error("Error updating student:", error);
        toast.error("Failed to update student");
      } finally {
        setSaving(false);
      }
    }
  };

  const handleDeleteStudent = (student: Student) => {
    setStudentToDelete(student);
    setShowDeleteConfirm(true);
  };
  const confirmDeleteStudent = async () => {
    if (!studentToDelete) return;

    try {
      await studentsService.delete(studentToDelete.id);

      setStudents((prev) =>
        prev.filter((student) => student.id !== studentToDelete.id),
      );

      toast.success(`${studentToDelete.name} has been deleted.`);

      setShowDeleteConfirm(false);
      setStudentToDelete(null);
    } catch (error) {
      console.error("Error deleting student:", error);
      toast.error(`Failed to delete ${studentToDelete.name}.`);
    }
  };
  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      studentId: student.studentId,
      name: student.name,
      program: student.program,
      yearLevel: student.yearLevel,
      section: student.section,
    });
  };

  const openAddModal = () => {
    setEditingStudent(null);
    setFormData({
      studentId: "",
      name: "",
      program: "",
      yearLevel: 1,
      section: "",
    });
    setShowAddModal(true);
  };

  const importStudentRows = async (rows: Record<string, string>[]) => {
    if (rows.length === 0) {
      toast.error("File is empty or invalid");
      return;
    }

    const parsed = rows
      .map(mapCsvRowToStudent)
      .filter((s): s is Omit<Student, "id"> => s !== null);

    if (parsed.length === 0) {
      toast.error(
        "No valid rows found. Expected columns: Student ID, Name, Program, Year Level, Section",
      );
      return;
    }

    // Skip rows already in the table or duplicated within the file.
    const existingIds = new Set(students.map((s) => s.studentId.toLowerCase()));
    const seen = new Set<string>();
    const deduped = parsed.filter((s) => {
      const key = s.studentId.toLowerCase();
      if (existingIds.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (deduped.length === 0) {
      toast.info("All rows in the file already exist in the table");
      return;
    }

    const { created, failed } = await studentsService.createMany(deduped);
    setStudents((prev) => [...prev, ...created]);
    const skipped = parsed.length - deduped.length;

    if (failed.length > 0) {
      const shown = failed
        .slice(0, 5)
        .map((f) => `${f.name || f.studentId}: ${f.error}`);
      const more = failed.length > 5 ? `, +${failed.length - 5} more` : "";
      toast.error(
        `${created.length} imported, ${failed.length} row(s) failed`,
        {
          description: shown.join("; ") + more,
        },
      );
    } else {
      toast.success(
        skipped > 0
          ? `${created.length} student(s) imported, ${skipped} duplicate(s) skipped`
          : `${created.length} student(s) imported successfully`,
      );
    }
  };

  // Shared CSV / Excel file-read shell + importing state (row mapping handled by
  // importStudentRows above).
  const { importing, handleFileSelected, importInputRef } = useSpreadsheetImport(
    {
      onRows: importStudentRows,
    },
  );

  return (
    <SectionLayout
      title="Student Management"
      subtitle="Manage student records and information"
      onBack={onBack}
      headerActions={
        <>
          <button
            onClick={() => importInputRef.current?.click()}
            className="glass-button px-4 py-2.5 text-sm"
            disabled={loading || importing}
            title="Import students from a CSV (.csv) or Excel (.xlsx) file. Expected columns: Student ID, Name, Program, Year Level, Section."
          >
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {importing ? "Importing..." : "Upload CSV / Excel"}
            </span>
          </button>
          <button
            onClick={openAddModal}
            className="btn-primary px-4 py-2.5 text-sm"
            disabled={loading || importing}
          >
            <Plus className="w-4 h-4" />
            <span>Add Student</span>
          </button>
        </>
      }
    >
      {/* Hidden file input for CSV / Excel import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={handleFileSelected}
      />

        {/* Filters */}
        <div className="glass-card p-4 mb-4 flex flex-wrap gap-3">
          <SearchFilterBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search students..."
            className="flex-1 min-w-[200px]"
          />
          <select
            value={filters.program}
            onChange={(e) => setFilter("program", e.target.value)}
            className="glass-input px-4 py-2 text-sm"
            disabled={loading}
          >
            <option value="">All Programs</option>
            {programs.map((program) => (
              <option key={program} value={program}>
                {program}
              </option>
            ))}
          </select>
          <select
            value={filters.year}
            onChange={(e) => setFilter("year", e.target.value)}
            className="glass-input px-4 py-2 text-sm"
            disabled={loading}
          >
            <option value="">All Years</option>
            {yearLevels.map((year) => (
              <option key={year} value={year}>
                {year}
                {getOrdinalSuffix(year)} Year
              </option>
            ))}
          </select>
          <select
            value={filters.section}
            onChange={(e) => setFilter("section", e.target.value)}
            className="glass-input px-4 py-2 text-sm"
            disabled={loading}
          >
            <option value="">All Sections</option>

            {sections.map((section) => (
              <option key={section} value={section}>
                Section {section}
              </option>
            ))}
          </select>
        </div>

        {/* Loading State */}
        {loading && <SectionLoader message="Loading students..." />}

        {/* Students Table */}
        {!loading && (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Name</th>
                    <th>Program</th>
                    <th>Year</th>
                    <th>Section</th>
                    <th className="text-center">QR</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => (
                    <tr key={student.id} className="group">
                      <td className="font-medium text-dark">
                        {student.studentId}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-red/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-red" />
                          </div>
                          <span className="font-medium text-dark">
                            {student.name}
                          </span>
                        </div>
                      </td>
                      <td className="text-text-secondary">{student.program}</td>
                      <td className="text-text-secondary">
                        {student.yearLevel}
                        {getOrdinalSuffix(student.yearLevel)} Year
                      </td>
                      <td className="text-text-secondary">{student.section}</td>
                      <td className="text-center">
                        <button
                          onClick={() => setQrStudent(student)}
                          className="p-2 rounded-lg"
                          title={`Download attendance QR for ${student.name}`}
                        >
                          <QrCode className="w-4 h-4 text-dark" />
                        </button>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditModal(student)}
                            className="p-2 rounded-lg"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4 text-blue-600" />
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(student)}
                            className="p-2 rounded-lg hover:bg-red-500/10"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-red" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredStudents.length === 0 && (
              <SectionEmptyState
                message="No students found"
                icon={User}
                compact
              />
            )}
          </div>
        )}

        {/* Stats */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-text-secondary">
          <span>
            Total Students:{" "}
            <strong className="text-dark">{students.length}</strong>
          </span>
          <span>
            Filtered:{" "}
            <strong className="text-dark">{filteredStudents.length}</strong>
          </span>
        </div>

      {/* Add/Edit Modal */}
      <Dialog
        open={showAddModal || !!editingStudent}
        onOpenChange={() => {
          setShowAddModal(false);
          setEditingStudent(null);
        }}
      >
        <DialogContent className="glass-card-strong max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              {editingStudent ? "Edit Student" : "Add New Student"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Student ID
              </label>
              <input
                type="text"
                value={formData.studentId}
                onChange={(e) =>
                  setFormData({ ...formData, studentId: e.target.value })
                }
                className="glass-input w-full px-4 py-2"
                placeholder="e.g., 2021-00001"
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="glass-input w-full px-4 py-2"
                placeholder="e.g., Juan Dela Cruz"
                disabled={saving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Program
              </label>
              <input
                type="text"
                list="program-suggestions"
                value={formData.program}
                onChange={(e) =>
                  setFormData({ ...formData, program: e.target.value })
                }
                className="glass-input w-full px-4 py-2"
                placeholder="e.g., BSIT, ACT, DIT"
                disabled={saving}
              />
              <datalist id="program-suggestions">
                {ATTENDANCE_COURSES.map((course) => (
                  <option key={course} value={course} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  Year Level
                </label>
                <select
                  value={formData.yearLevel}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      yearLevel: parseInt(e.target.value),
                    })
                  }
                  className="glass-input w-full px-4 py-2"
                  disabled={saving}
                >
                  {[1, 2, 3, 4, 5].map((year) => (
                    <option key={year} value={year}>
                      {year}
                      {getOrdinalSuffix(year)} Year
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  Section
                </label>
                <input
                  type="text"
                  value={formData.section}
                  onChange={(e) =>
                    setFormData({ ...formData, section: e.target.value })
                  }
                  className="glass-input w-full px-4 py-2"
                  placeholder="e.g., A"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingStudent(null);
                }}
                className="flex-1 glass-button px-4 py-2.5"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={editingStudent ? handleEditStudent : handleAddStudent}
                className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2"
                disabled={
                  saving ||
                  !formData.studentId ||
                  !formData.name ||
                  !formData.program ||
                  !formData.section
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
                    {editingStudent ? "Update" : "Save"}
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete Student Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setStudentToDelete(null);
        }}
        onConfirm={confirmDeleteStudent}
        title="Delete Student"
        description={`Are you sure you want to delete ${studentToDelete?.name ?? "this student"}?`}
        warningText="This action cannot be undone. The student's record will be permanently removed from the system."
        confirmLabel="Delete Student"
      />
      {/* Attendance QR Code Modal */}
      <StudentQrModal student={qrStudent} onClose={() => setQrStudent(null)} />
    </SectionLayout>
  );
}

// ---------------------------------------------------------------------------
// Import helpers
// ---------------------------------------------------------------------------

/** Flexibly maps one CSV/Excel row to a Student. Returns null when name and ID are missing. */
function mapCsvRowToStudent(
  row: Record<string, string>,
): Omit<Student, "id"> | null {
  const studentId = pickField(
    row,
    "studentid",
    "studentno",
    "studentnumber",
    "studid",
    "idnumber",
    "lrn",
    "id",
  );
  const name = pickField(row, "name", "fullname", "studentname");
  if (!studentId || !name) return null;

  const yearRaw = parseInt(
    pickField(row, "yearlevel", "year", "gradelevel", "grade", "gradelvl"),
    10,
  );

  return {
    studentId,
    name,
    program: pickField(row, "program", "course", "degree", "programofstudy"),
    yearLevel: Number.isNaN(yearRaw) || yearRaw < 1 ? 1 : yearRaw,
    section: pickField(row, "section", "class", "block"),
  };
}
