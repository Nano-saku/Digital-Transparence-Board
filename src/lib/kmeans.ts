// ======================================================================
// Attendance course catalog
// ======================================================================
// The 5 programs tracked for attendance purposes. This module previously
// also contained a K-means clustering engine (grouping students into course
// sections) for an older attendance-overview UI; that logic was unused by
// any section and has been removed. Only the course catalog remains and is
// consumed by StudentManagementSection for its program datalist suggestions.
// ======================================================================

export const ATTENDANCE_COURSES = ["ACT", "DIT", "BSIT", "BPA", "BSAB"] as const;
export type AttendanceCourse = (typeof ATTENDANCE_COURSES)[number];
