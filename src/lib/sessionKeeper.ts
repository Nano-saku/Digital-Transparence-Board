import type { ViewState } from "@/types";

// Restores App's `currentView` after a reload (Supabase's auth session survives it on
// its own). sessionStorage, not localStorage: the student search runs on shared
// devices, so the next person reopening the tab must not land on someone's record.
const KEY = "dtb-view-session";

interface ViewSession {
  view: ViewState;
  /** Set when the restorable view is a student's own record. */
  studentId?: string;
}

function attempt<T>(action: string, run: () => T): T | null {
  try {
    return run();
  } catch (error) {
    console.warn(`Failed to ${action} view session:`, error);
    return null;
  }
}

export function saveViewSession(session: ViewSession): void {
  attempt("save", () => sessionStorage.setItem(KEY, JSON.stringify(session)));
}

export function loadViewSession(): ViewSession | null {
  return attempt("read", () => {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ViewSession) : null;
  });
}

export function clearViewSession(): void {
  attempt("clear", () => sessionStorage.removeItem(KEY));
}
