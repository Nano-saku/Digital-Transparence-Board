// Student Types
export interface Student {
  id: string;
  studentId: string;
  name: string;
  program: string;
  yearLevel: number;
  section: string;
}

// Event Types
export interface Event {
  id: string;
  name: string;
  allocationAmount: number;
  date?: string;
  /**
   * Morning / Afternoon scheduled attendance windows, each 24h "HH:MM" (e.g.
   * "06:00" for a 6:00 AM start). The QR scanner compares each scan's actual
   * time against these to auto-derive attendance status: Present when scanned
   * on/before the applicable session's Time In, Late when scanned after it,
   * Absent when never scanned (auto-marked at 10:00 PM on the event day).
   * The Morning window applies until the Afternoon window begins, then the
   * Afternoon Time In is used.
   */
  morningTimeIn?: string;
  morningTimeOut?: string;
  afternoonTimeIn?: string;
  afternoonTimeOut?: string;
  /**
   * Legacy single-session schedule (24h "HH:MM") kept for events created
   * before the Morning/Afternoon split. The DB mapper treats time_in/time_out
   * as the Morning window when the new Morning columns are empty.
   */
  timeIn?: string;
  timeOut?: string;
  /** Catalog member snapshots assigned to this event. */
  assignedMembers?: { memberId: string; memberName: string }[];
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
  session: 'morning' | 'afternoon';
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
  | "admin-dashboard"
  | "student-management"
  | "event-management"
  | "payment-management"
  | "contribution-management"
  | "attendance-management"
  | "transaction-management"
  | "feedback-management";
