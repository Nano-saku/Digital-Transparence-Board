import type { LscOfficer, Student } from "@/types";

/**
 * Student db ids of current officers (appointment rows have no end date; deleting
 * the row ends it). `studentDbId` is authoritative; legacy rows without it fall back
 * to the student number, ignored when that number is not unique among `students`.
 */
export function activeLscOfficerStudentIds(students: Student[], appointments: LscOfficer[]): Set<string> {
  const key = (studentNumber: string) => studentNumber.trim().toLowerCase();
  // null marks a student number shared by several students.
  const byNumber = new Map<string, Student | null>();
  for (const student of students) {
    const k = key(student.studentId);
    byNumber.set(k, byNumber.has(k) ? null : student);
  }

  const ids = new Set<string>();
  for (const { studentDbId, studentId } of appointments) {
    const id = studentDbId || byNumber.get(key(studentId))?.id;
    if (id) ids.add(id);
  }
  return ids;
}

export function isActiveLscOfficer(studentId: string, officerStudentIds: ReadonlySet<string>): boolean {
  return officerStudentIds.has(studentId);
}
