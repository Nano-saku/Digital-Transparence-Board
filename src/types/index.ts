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
}

// Attendance Types
export interface AttendanceRecord {
  id: string;
  studentId: string;
  eventId: string;
  eventName: string;
  date: string;
  status: 'present' | 'absent';
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
  type: 'income' | 'expense';
  responsibleOfficer: string;
  receiptUrl?: string;
}

// Receipt Types
export interface Receipt {
  id: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  uploadedAt: string;
  uploadedBy: string;
  relatedEventId?: string;
}

// Inquiry/Complaint/Suggestion Types
export interface FeedbackItem {
  id: string;
  type: 'inquiry' | 'complaint' | 'suggestion';
  title?: string;
  message: string;
  studentName?: string;
  studentId?: string;
  isAnonymous: boolean;
  submittedAt: string;
  status: 'pending' | 'in-progress' | 'resolved';
}

// Audit Log Types
export interface AuditLogEntry {
  id: string;
  date: string;
  action: string;
  dataModified: string;
  responsibleAdmin: string;
  previousValue?: string;
  newValue?: string;
}

// Admin Types
export interface Admin {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'superadmin';
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

// View State Types
export type ViewState = 
  | 'landing'
  | 'student-record'
  | 'transparency'
  | 'inquiry'
  | 'complaint'
  | 'suggestion'
  | 'admin-login'
  | 'admin-dashboard'
  | 'student-management'
  | 'event-management'
  | 'payment-management'
  | 'attendance-management'
  | 'transaction-management';
