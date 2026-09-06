// Student Requirement File Types
export interface StudentRequirementFile {
  id: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  fileType?: string;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Student Types
export interface Student {
  id: string;
  studentId: string;
  name: string;
  program: string;
  yearLevel: number;
  section: string;
}

export type EventSession = "morning" | "afternoon" | "evening";

export interface EventSchedule {
  period: EventSession;

  timeInEnabled: boolean;
  timeOutEnabled: boolean;

  timeIn?: string;
  timeOut?: string;
}
// Event Types
export interface Event {
  id: string;
  name: string;
  allocationAmount: number;
  date?: string;

  schedules?: EventSchedule[];

  // Legacy fields - keep temporarily for older events
  morningTimeIn?: string;
  morningTimeOut?: string;
  afternoonTimeIn?: string;
  afternoonTimeOut?: string;

  timeIn?: string;
  timeOut?: string;

  assignedMembers?: {
    memberId: string;
    memberName: string;
  }[];
}

// Attendance Types
export interface AttendanceRecord {
  id: string;
  studentId: string;
  eventId: string;
  eventName: string;
  date: string;
  status: "present" | "late" | "absent";
  /**
   * Session for the attendance record: 'morning' or 'afternoon'.
   * Each event has separate attendance tracking for Morning Time In/Out
   * and Afternoon Time In/Out.
   */
  session: EventSession;
  /**
   * Time-in / time-out captured automatically from the QR scan time (24h
   * "HH:MM", e.g. "06:00"). Time In is set when the student's QR is scanned
   * to mark them in; Time Out when they are scanned out. The UI always
   * displays both in 12-hour AM/PM labels.
   */
  timeIn?: string;
  timeOut?: string;
}

// Contribution/Payment Types
export interface ContributionRecord {
  id: string;
  studentId: string;
  eventId: string;
  eventName: string;
  requiredAmount: number;
  amountPaid: number;
  remainingBalance: number;
}

export interface PaymentRecord {
  id: string;
  studentId: string;
  studentName: string;
  eventId: string;
  eventName: string;
  contributionId: string;
  amount: number;
  date: string;
  receiptUrl?: string;
  /** Official Receipt (OR) number, e.g. "OR-2026-000001". Assigned only when
   *  the student's contribution for the event is fully paid. */
  orNumber?: string;
  recordedBy: string;
}

// Transaction Types
export interface Transaction {
  id: string;
  date: string;
  description: string;
  eventId?: string;
  eventName?: string;
  amount: number;
  type: "income" | "expense";
  responsibleOfficer: string;
  receiptUrl?: string;
}

// Inquiry/Complaint/Suggestion Types
export interface FeedbackItem {
  id: string;
  type: "inquiry" | "complaint" | "suggestion";
  title?: string;
  message: string;
  studentName?: string;
  studentId?: string;
  isAnonymous: boolean;
  submittedAt: string;
  status: "pending" | "in-progress" | "resolved";
}

// Staff / auth types
export type UserRole =
  | "admin"
  | "secretary"
  | "treasurer"
  | "auditor"
  | "board-member";

/** A catalog board member; account_user_id is optional for login access. */
export interface BoardMember {
  id: string;
  name: string;
  accountUserId?: string;
}

// Financial Summary Types
export interface FinancialSummary {
  totalBudget: number;
  totalFundsCollected: number;
  totalFundsSpent: number;
  remainingBudget: number;
  totalExpectedContributions: number;
}

export interface EventAllocation {
  eventId: string;
  eventName: string;
  allocationAmount: number;
  totalCollected: number;
  totalSpent: number;
  remainingBalance: number;
}

/** Financial values calculated directly from the live operational records. */
export interface FinancialReport {
  summary: FinancialSummary;
  eventAllocations: EventAllocation[];
}

// View State Types
export type ViewState =
  | "landing"
  | "student-record"
  | "transparency"
  | "inquiry"
  | "complaint"
  | "suggestion"
  | "admin-login"
  | "admin-forgot-password"
  | "admin-reset-password"
  | "admin-dashboard"
  | "student-management"
  | "event-management"
  | "payment-management"
  | "contribution-management"
  | "attendance-management"
  | "transaction-management"
  | "feedback-management"
  | "report-management"
  | "requirement-files-management";
