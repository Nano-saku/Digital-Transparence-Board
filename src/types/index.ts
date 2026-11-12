export interface StudentRequirementFile {
  id: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  fileType?: string;
  isPublished: boolean;
  /** When true, only students in the file's access list may see/download it. */
  restricted: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  studentId: string;
  name: string;
  program: string;
  yearLevel: number;
  section: string;
  profilePhotoUrl?: string;
  /** Supabase Auth user linked to this student for secure self-service updates. */
  accountUserId?: string;
  isLscOfficer?: boolean;
  lscPositions?: string[];
}

export type EventSession = "morning" | "afternoon" | "evening";

export interface EventSchedule {
  period: EventSession;
  timeInEnabled: boolean;
  timeOutEnabled: boolean;
  timeIn?: string;
  timeOut?: string;
}

export interface AuditLog {
  id: string;
  actorUserId?: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Event {
  id: string;
  name: string;
  allocationAmount: number;
  /** Excluded from Attendance Management. */
  isNonConducting?: boolean;
  /** Eligible students may be automatically marked absent after the event date ends. */
  autoMarkAbsent?: boolean;
  /** No contribution requirement; excluded from Event Collection Performance. */
  isNoContribution?: boolean;
  date?: string;
  /** Last day a student's contribution counts as on-time. Empty string = no deadline set. */
  contributionDeadline?: string;
  /** Whether the post-event evaluation is currently rolled out to students. */
  evaluationActive?: boolean;
  /** Google Form URL for this event's evaluation (ideally prefilled with name/ID entry IDs). */
  evaluationFormUrl?: string;
  schedules?: EventSchedule[];
  /** Board members assigned to oversee this event. */
  assignedMembers?: { memberId: string; memberName: string }[];
  // Legacy per-session times, read only as a fallback for events created before `schedules`.
  morningTimeIn?: string;
  morningTimeOut?: string;
  afternoonTimeIn?: string;
  afternoonTimeOut?: string;
  eveningTimeIn?: string;
  eveningTimeOut?: string;
  timeIn?: string;
  timeOut?: string;
}

/** A row synced from an event's evaluation Google Sheet; studentId/studentName are trimmed + lowercased. */
export interface EventEvaluation {
  id: string;
  eventId: string;
  studentId: string;
  studentName: string;
  submittedAt: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  eventId: string;
  eventName: string;
  date: string;
  status: "present" | "absent" | "excuse";
  /** Each event tracks attendance separately per session. */
  session: EventSession;
  /** 24h "HH:MM" captured from the QR scan in / out (shown as 12-hour labels). */
  timeIn?: string;
  timeOut?: string;
}

export interface ContributionRecord {
  id: string;
  studentId: string;
  eventId: string;
  eventName: string;
  requiredAmount: number;
  amountPaid: number;
  remainingBalance: number;
}

/** One installment in a PaymentRecord's append-only payment history. */
export interface PaymentItem {
  amount: number;
  /** ISO date (YYYY-MM-DD) the installment was recorded. */
  date: string;
  /** Payment status at the time of this installment. */
  status: "Partial" | "Fully Paid";
}

export interface PaymentRecord {
  id: string;
  studentId: string;
  studentName: string;
  eventId: string;
  eventName: string;
  contributionId: string;
  /** Cumulative total paid for this contribution (sum of all installments). */
  amount: number;
  date: string;
  /** Database timestamp of the successful payment insert/update. */
  recordedAt?: string;
  receiptUrl?: string;
  /** Official Receipt number, e.g. "OR-2026-000001"; assigned on the first payment and reused after. */
  orNumber?: string;
  recordedBy: string;
  /** Installments in order, only ever appended to. */
  paymentItems: PaymentItem[];
}

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

/** An inquiry, complaint or suggestion. */
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

export type UserRole = "admin" | "secretary" | "treasurer" | "auditor" | "board-member";

/** A catalog board member; accountUserId is optional for login access. */
export interface BoardMember {
  id: string;
  name: string;
  accountUserId?: string;
}

export const OFFICIAL_LSC_POSITIONS = [
  "Governor",
  "Vice Governor",
  "External Vice Governor",
  "General Secretary",
  "Assistant Secretary",
  "Treasurer",
  "Auditor",
  "Assistant Auditor",
  "Board Member",
  "Creative Director",
  "Technical Director",
  "Creative Head",
  "Technical Head",
  "Creatives Committee",
  "Technical Committee",
  "Marshall Head",
  "Marshall Committee",
] as const;

export type OfficialLscPosition = (typeof OFFICIAL_LSC_POSITIONS)[number];

export interface LscOfficer {
  id: string;
  studentId: string;
  studentDbId?: string;
  name: string;
  program: string;
  yearLevel: number;
  section: string;
  positions: OfficialLscPosition[] | string[];
  createdAt: string;
  updatedAt: string;
}

export interface EventVolunteer {
  id: string;
  eventId: string;
  eventName: string;
  studentId: string;
  studentName: string;
  program?: string;
  yearLevel?: number;
  section?: string;
  roleOrTask: string;
  status: "assigned" | "active" | "completed";
  expiresAt?: string;
  createdAt: string;
}

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
  /** Expected total after excluding current LSC officers. */
  expectedAmount?: number;
  totalCollected: number;
  totalSpent: number;
  remainingBalance: number;
}

/** Financial values calculated directly from the live operational records. */
export interface FinancialReport {
  summary: FinancialSummary;
  eventAllocations: EventAllocation[];
}

export type ViewState =
  | "landing"
  | "student-record"
  | "officer-record"
  | "evaluation-required"
  | "transparency"
  | "inquiry"
  | "complaint"
  | "suggestion"
  | "admin-login"
  | "admin-forgot-password"
  | "admin-reset-password"
  | "admin-dashboard"
  | "student-management"
  | "officer-volunteers-management"
  | "event-management"
  | "payment-management"
  | "contribution-management"
  | "attendance-management"
  | "transaction-management"
  | "feedback-management"
  | "report-management"
  | "requirement-files-management"
  | "system-logs";
