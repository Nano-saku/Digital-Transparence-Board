import type { LscOfficer, Student } from "@/types";

/**
 * Builds the current officer set from appointment rows.
 *
 * `studentDbId` is authoritative. The student-number fallback exists only for
 * legacy appointment rows that were created before the foreign key was stored,
 * and is ignored when the number is not unique among the loaded students.
 * Appointment rows are current because the database model has no status or
 * end-date column; removing the row ends the appointment.
 */
export function activeLscOfficerStudentIds(
  students: Student[],
  appointments: LscOfficer[],
): Set<string> {
  const ids = new Set<string>();
  const byStudentNumber = new Map<string, Student[]>();

  for (const student of students) {
    const key = student.studentId.trim().toLowerCase();
    const matches = byStudentNumber.get(key) ?? [];
    matches.push(student);
    byStudentNumber.set(key, matches);
  }

  for (const appointment of appointments) {
    if (appointment.studentDbId) {
      ids.add(appointment.studentDbId);
      continue;
    }

    const matches = byStudentNumber.get(appointment.studentId.trim().toLowerCase()) ?? [];
    if (matches.length === 1) ids.add(matches[0].id);
  }

  return ids;
}

export function isActiveLscOfficer(
  studentId: string,
  officerStudentIds: ReadonlySet<string>,
): boolean {
  return officerStudentIds.has(studentId);
}