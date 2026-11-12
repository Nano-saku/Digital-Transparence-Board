import type { UserRole, ViewState } from "@/types";

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  secretary: "Secretary",
  treasurer: "Treasurer",
  auditor: "Auditor",
  "board-member": "Board Member",
};

const ALL: UserRole[] = ["admin", "secretary", "treasurer", "auditor", "board-member"];
const FINANCE: UserRole[] = ["admin", "treasurer", "auditor"];
const RECORDS: UserRole[] = ["admin", "secretary"];

/** Which roles may open each staff-only view. Public views are absent. */
export const VIEW_ROLES: Partial<Record<ViewState, UserRole[]>> = {
  "student-management": RECORDS,
  "attendance-management": RECORDS,
  "report-management": RECORDS,
  "requirement-files-management": ["admin"],
  "officer-volunteers-management": ["admin"],
  "system-logs": ["admin"],
  "contribution-management": FINANCE,
  "payment-management": FINANCE,
  "transaction-management": FINANCE,
  "event-management": ALL,
  "feedback-management": ALL,
};

/** Staff-only views, plus the dashboard: the views a reload may restore. */
export const STAFF_VIEWS: ViewState[] = ["admin-dashboard", ...(Object.keys(VIEW_ROLES) as ViewState[])];

/** `undefined` for public views; otherwise whether `role` may open `view`. */
export function canAccess(role: UserRole | null, view: ViewState): boolean | undefined {
  const allowed = VIEW_ROLES[view];
  if (!allowed) return undefined;
  return role !== null && allowed.includes(role);
}
