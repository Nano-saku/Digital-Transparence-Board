import type {
  Student,
  Event,
  AttendanceRecord,
  ContributionRecord,
  PaymentRecord,
  Transaction,
  Receipt,
  FeedbackItem,
  AuditLogEntry,
  Admin,
  FinancialSummary,
  EventAllocation,
} from "@/types";

// Sample Students
export const students: Student[] = [
  {
    id: "1",
    studentId: "2021-00001",
    name: "Juan Dela Cruz",
    program: "BS Computer Science",
    yearLevel: 3,
    section: "A",
  },
  {
    id: "2",
    studentId: "2021-00002",
    name: "Maria Santos",
    program: "BS Information Technology",
    yearLevel: 3,
    section: "B",
  },
  {
    id: "3",
    studentId: "2021-00003",
    name: "Pedro Reyes",
    program: "BS Computer Science",
    yearLevel: 2,
    section: "A",
  },
  {
    id: "4",
    studentId: "2021-00004",
    name: "Ana Garcia",
    program: "BS Information Systems",
    yearLevel: 4,
    section: "C",
  },
  {
    id: "5",
    studentId: "2021-00005",
    name: "Jose Martinez",
    program: "BS Computer Science",
    yearLevel: 3,
    section: "B",
  },
  {
    id: "6",
    studentId: "2022-00001",
    name: "Lisa Torres",
    program: "BS Information Technology",
    yearLevel: 2,
    section: "A",
  },
  {
    id: "7",
    studentId: "2022-00002",
    name: "Carlos Rivera",
    program: "BS Computer Science",
    yearLevel: 2,
    section: "C",
  },
  {
    id: "8",
    studentId: "2022-00003",
    name: "Sofia Cruz",
    program: "BS Information Systems",
    yearLevel: 3,
    section: "A",
  },
];

// Sample Events
export const events: Event[] = [
  {
    id: "1",
    name: "General Assembly (GA)",
    allocationAmount: 500,
    date: "2024-08-15",
  },
  { id: "2", name: "Buwan ng Wika", allocationAmount: 300, date: "2024-08-30" },
  {
    id: "3",
    name: "Acquaintance Party",
    allocationAmount: 800,
    date: "2024-09-10",
  },
  { id: "4", name: "Intramurals", allocationAmount: 600, date: "2024-10-05" },
  {
    id: "5",
    name: "Intramural Shirt",
    allocationAmount: 350,
    date: "2024-09-25",
  },
];

// Sample Attendance Records
export const attendanceRecords: AttendanceRecord[] = [
  {
    id: "1",
    studentId: "1",
    eventId: "1",
    eventName: "General Assembly (GA)",
    date: "2024-08-15",
    status: "present",
  },
  {
    id: "2",
    studentId: "1",
    eventId: "2",
    eventName: "Buwan ng Wika",
    date: "2024-08-30",
    status: "present",
  },
  {
    id: "3",
    studentId: "1",
    eventId: "3",
    eventName: "Acquaintance Party",
    date: "2024-09-10",
    status: "absent",
  },
  {
    id: "4",
    studentId: "1",
    eventId: "4",
    eventName: "Intramurals",
    date: "2024-10-05",
    status: "present",
  },
  {
    id: "5",
    studentId: "2",
    eventId: "1",
    eventName: "General Assembly (GA)",
    date: "2024-08-15",
    status: "present",
  },
  {
    id: "6",
    studentId: "2",
    eventId: "2",
    eventName: "Buwan ng Wika",
    date: "2024-08-30",
    status: "present",
  },
  {
    id: "7",
    studentId: "3",
    eventId: "1",
    eventName: "General Assembly (GA)",
    date: "2024-08-15",
    status: "absent",
  },
  {
    id: "8",
    studentId: "3",
    eventId: "4",
    eventName: "Intramurals",
    date: "2024-10-05",
    status: "present",
  },
];

// Sample Contribution Records
export const contributionRecords: ContributionRecord[] = [
  {
    id: "1",
    studentId: "1",
    eventId: "1",
    eventName: "General Assembly (GA)",
    requiredAmount: 500,
    amountPaid: 500,
    remainingBalance: 0,
  },
  {
    id: "2",
    studentId: "1",
    eventId: "2",
    eventName: "Buwan ng Wika",
    requiredAmount: 300,
    amountPaid: 300,
    remainingBalance: 0,
  },
  {
    id: "3",
    studentId: "1",
    eventId: "3",
    eventName: "Acquaintance Party",
    requiredAmount: 800,
    amountPaid: 400,
    remainingBalance: 400,
  },
  {
    id: "4",
    studentId: "1",
    eventId: "4",
    eventName: "Intramurals",
    requiredAmount: 600,
    amountPaid: 600,
    remainingBalance: 0,
  },
  {
    id: "5",
    studentId: "1",
    eventId: "5",
    eventName: "Intramural Shirt",
    requiredAmount: 350,
    amountPaid: 350,
    remainingBalance: 0,
  },
  {
    id: "6",
    studentId: "2",
    eventId: "1",
    eventName: "General Assembly (GA)",
    requiredAmount: 500,
    amountPaid: 500,
    remainingBalance: 0,
  },
  {
    id: "7",
    studentId: "2",
    eventId: "2",
    eventName: "Buwan ng Wika",
    requiredAmount: 300,
    amountPaid: 200,
    remainingBalance: 100,
  },
  {
    id: "8",
    studentId: "3",
    eventId: "1",
    eventName: "General Assembly (GA)",
    requiredAmount: 500,
    amountPaid: 0,
    remainingBalance: 500,
  },
];

// Sample Payment Records
export const paymentRecords: PaymentRecord[] = [
  {
    id: "1",
    studentId: "1",
    studentName: "Juan Dela Cruz",
    eventId: "1",
    eventName: "General Assembly (GA)",
    amount: 500,
    date: "2024-08-10",
    recordedBy: "Admin User",
    receiptUrl: "/receipts/receipt1.jpg",
  },
  {
    id: "2",
    studentId: "1",
    studentName: "Juan Dela Cruz",
    eventId: "2",
    eventName: "Buwan ng Wika",
    amount: 300,
    date: "2024-08-25",
    recordedBy: "Admin User",
    receiptUrl: "/receipts/receipt2.jpg",
  },
  {
    id: "3",
    studentId: "1",
    studentName: "Juan Dela Cruz",
    eventId: "3",
    eventName: "Acquaintance Party",
    amount: 400,
    date: "2024-09-05",
    recordedBy: "Admin User",
  },
  {
    id: "4",
    studentId: "1",
    studentName: "Juan Dela Cruz",
    eventId: "4",
    eventName: "Intramurals",
    amount: 600,
    date: "2024-09-28",
    recordedBy: "Admin User",
    receiptUrl: "/receipts/receipt3.jpg",
  },
  {
    id: "5",
    studentId: "2",
    studentName: "Maria Santos",
    eventId: "1",
    eventName: "General Assembly (GA)",
    amount: 500,
    date: "2024-08-12",
    recordedBy: "Admin User",
  },
  {
    id: "6",
    studentId: "2",
    studentName: "Maria Santos",
    eventId: "2",
    eventName: "Buwan ng Wika",
    amount: 200,
    date: "2024-08-28",
    recordedBy: "Admin User",
  },
];

// Sample Transactions
export const transactions: Transaction[] = [
  {
    id: "1",
    date: "2024-08-10",
    description: "Student contributions - General Assembly",
    eventId: "1",
    eventName: "General Assembly (GA)",
    amount: 2500,
    type: "income",
    responsibleOfficer: "Treasurer",
    receiptUrl: "/receipts/collection1.jpg",
  },
  {
    id: "2",
    date: "2024-08-15",
    description: "Venue rental for General Assembly",
    eventId: "1",
    eventName: "General Assembly (GA)",
    amount: 1500,
    type: "expense",
    responsibleOfficer: "Treasurer",
    receiptUrl: "/receipts/expense1.jpg",
  },
  {
    id: "3",
    date: "2024-08-25",
    description: "Student contributions - Buwan ng Wika",
    eventId: "2",
    eventName: "Buwan ng Wika",
    amount: 1500,
    type: "income",
    responsibleOfficer: "Treasurer",
  },
  {
    id: "4",
    date: "2024-08-30",
    description: "Food and decorations - Buwan ng Wika",
    eventId: "2",
    eventName: "Buwan ng Wika",
    amount: 1200,
    type: "expense",
    responsibleOfficer: "Treasurer",
    receiptUrl: "/receipts/expense2.jpg",
  },
  {
    id: "5",
    date: "2024-09-05",
    description: "Partial payments - Acquaintance Party",
    eventId: "3",
    eventName: "Acquaintance Party",
    amount: 2000,
    type: "income",
    responsibleOfficer: "Treasurer",
  },
  {
    id: "6",
    date: "2024-09-28",
    description: "Student contributions - Intramurals",
    eventId: "4",
    eventName: "Intramurals",
    amount: 3000,
    type: "income",
    responsibleOfficer: "Treasurer",
    receiptUrl: "/receipts/collection2.jpg",
  },
  {
    id: "7",
    date: "2024-09-30",
    description: "Sports equipment purchase",
    eventId: "4",
    eventName: "Intramurals",
    amount: 2500,
    type: "expense",
    responsibleOfficer: "Treasurer",
    receiptUrl: "/receipts/expense3.jpg",
  },
  {
    id: "8",
    date: "2024-10-01",
    description: "Office supplies",
    amount: 350,
    type: "expense",
    responsibleOfficer: "Secretary",
    receiptUrl: "/receipts/expense4.jpg",
  },
];

// Sample Receipts
export const receipts: Receipt[] = [
  {
    id: "1",
    url: "/receipts/receipt1.jpg",
    thumbnailUrl: "/receipts/thumb1.jpg",
    title: "Payment - Juan Dela Cruz - GA",
    uploadedAt: "2024-08-10",
    uploadedBy: "Admin User",
    relatedEventId: "1",
  },
  {
    id: "2",
    url: "/receipts/receipt2.jpg",
    thumbnailUrl: "/receipts/thumb2.jpg",
    title: "Payment - Juan Dela Cruz - Buwan ng Wika",
    uploadedAt: "2024-08-25",
    uploadedBy: "Admin User",
    relatedEventId: "2",
  },
  {
    id: "3",
    url: "/receipts/receipt3.jpg",
    thumbnailUrl: "/receipts/thumb3.jpg",
    title: "Payment - Juan Dela Cruz - Intramurals",
    uploadedAt: "2024-09-28",
    uploadedBy: "Admin User",
    relatedEventId: "4",
  },
  {
    id: "4",
    url: "/receipts/expense1.jpg",
    thumbnailUrl: "/receipts/thumb_expense1.jpg",
    title: "Venue Rental - General Assembly",
    uploadedAt: "2024-08-15",
    uploadedBy: "Treasurer",
    relatedEventId: "1",
  },
  {
    id: "5",
    url: "/receipts/expense2.jpg",
    thumbnailUrl: "/receipts/thumb_expense2.jpg",
    title: "Food & Decorations - Buwan ng Wika",
    uploadedAt: "2024-08-30",
    uploadedBy: "Treasurer",
    relatedEventId: "2",
  },
  {
    id: "6",
    url: "/receipts/expense3.jpg",
    thumbnailUrl: "/receipts/thumb_expense3.jpg",
    title: "Sports Equipment - Intramurals",
    uploadedAt: "2024-09-30",
    uploadedBy: "Treasurer",
    relatedEventId: "4",
  },
];

// Sample Feedback
export const feedbackItems: FeedbackItem[] = [
  {
    id: "1",
    type: "inquiry",
    message: "When is the deadline for Intramurals payment?",
    studentName: "Juan Dela Cruz",
    studentId: "2021-00001",
    isAnonymous: false,
    submittedAt: "2024-09-20",
    status: "resolved",
  },
  {
    id: "2",
    type: "complaint",
    title: "Incorrect attendance record",
    message:
      "My attendance for Acquaintance Party was marked absent but I was present.",
    studentName: "Maria Santos",
    studentId: "2021-00002",
    isAnonymous: false,
    submittedAt: "2024-09-15",
    status: "in-progress",
  },
  {
    id: "3",
    type: "suggestion",
    title: "More transparency on expenses",
    message:
      "It would be helpful to see more detailed breakdown of event expenses.",
    isAnonymous: true,
    submittedAt: "2024-09-10",
    status: "pending",
  },
];

// Sample Audit Logs
export const auditLogs: AuditLogEntry[] = [
  {
    id: "1",
    date: "2024-09-28 14:30:00",
    action: "Payment recorded",
    dataModified: "Payment for Juan Dela Cruz - Intramurals",
    responsibleAdmin: "Admin User",
    previousValue: "Unpaid",
    newValue: "Paid - 600",
  },
  {
    id: "2",
    date: "2024-09-15 10:15:00",
    action: "Attendance updated",
    dataModified: "Attendance for Maria Santos - Buwan ng Wika",
    responsibleAdmin: "Admin User",
    previousValue: "Absent",
    newValue: "Present",
  },
  {
    id: "3",
    date: "2024-09-10 09:00:00",
    action: "Event allocation changed",
    dataModified: "Acquaintance Party allocation",
    responsibleAdmin: "Super Admin",
    previousValue: "700",
    newValue: "800",
  },
  {
    id: "4",
    date: "2024-09-05 16:45:00",
    action: "Receipt uploaded",
    dataModified: "Receipt for venue rental",
    responsibleAdmin: "Treasurer",
    previousValue: "None",
    newValue: "expense1.jpg",
  },
  {
    id: "5",
    date: "2024-09-01 11:20:00",
    action: "Student record added",
    dataModified: "New student: Lisa Torres",
    responsibleAdmin: "Admin User",
    previousValue: "N/A",
    newValue: "2022-00001",
  },
];

// Sample Admin
export const admins: Admin[] = [
  { id: "1", username: "admin", name: "Admin User", role: "admin" },
  { id: "2", username: "superadmin", name: "Super Admin", role: "superadmin" },
  { id: "3", username: "treasurer", name: "Treasurer", role: "admin" },
];

// Financial Summary
export const financialSummary: FinancialSummary = {
  totalBudget: 50000,
  totalFundsCollected: 32500,
  totalFundsSpent: 28450,
  remainingBudget: 21550,
  totalExpectedContributions: 48000,
};

// Event Allocations
export const eventAllocations: EventAllocation[] = [
  {
    eventId: "1",
    eventName: "General Assembly (GA)",
    allocationAmount: 500,
    totalCollected: 2500,
    totalSpent: 1500,
    remainingBalance: 1000,
  },
  {
    eventId: "2",
    eventName: "Buwan ng Wika",
    allocationAmount: 300,
    totalCollected: 1500,
    totalSpent: 1200,
    remainingBalance: 300,
  },
  {
    eventId: "3",
    eventName: "Acquaintance Party",
    allocationAmount: 800,
    totalCollected: 2000,
    totalSpent: 0,
    remainingBalance: 2000,
  },
  {
    eventId: "4",
    eventName: "Intramurals",
    allocationAmount: 600,
    totalCollected: 3000,
    totalSpent: 2500,
    remainingBalance: 500,
  },
  {
    eventId: "5",
    eventName: "Intramural Shirt",
    allocationAmount: 350,
    totalCollected: 1750,
    totalSpent: 1400,
    remainingBalance: 350,
  },
];

// Helper functions
export function getStudentById(studentId: string): Student | undefined {
  return students.find((s) => s.studentId === studentId || s.id === studentId);
}

export function getStudentByName(name: string): Student | undefined {
  return students.find((s) =>
    s.name.toLowerCase().includes(name.toLowerCase()),
  );
}

export function getAttendanceByStudent(studentId: string): AttendanceRecord[] {
  return attendanceRecords.filter((a) => a.studentId === studentId);
}

export function getContributionsByStudent(
  studentId: string,
): ContributionRecord[] {
  return contributionRecords.filter((c) => c.studentId === studentId);
}

export function getPaymentsByStudent(studentId: string): PaymentRecord[] {
  return paymentRecords.filter((p) => p.studentId === studentId);
}

export function getReceiptsByStudent(studentId: string): Receipt[] {
  const studentPayments = paymentRecords.filter(
    (p) => p.studentId === studentId && p.receiptUrl,
  );
  return receipts.filter((r) =>
    studentPayments.some((p) => p.receiptUrl === r.url),
  );
}

export function getEventById(eventId: string): Event | undefined {
  return events.find((e) => e.id === eventId);
}

export function getTransactionsByEvent(eventId: string): Transaction[] {
  return transactions.filter((t) => t.eventId === eventId);
}
