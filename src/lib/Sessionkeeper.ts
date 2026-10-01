import type { ViewState } from "@/types";

// ------------------------------------------------------------------
// Session keeper — restores "where you were" after a page reload.
//
// Supabase's own auth session (see lib/supabase.ts) already survives a
// reload on its own — but App.tsx's `currentView` always starts back at
// "landing" on mount, so an officer mid-dashboard, or a student who just
// verified and is looking at their record, gets dropped back to the
// public landing page on every refresh even though nothing actually
// signed them out.
//
// Scoped to sessionStorage on purpose, not localStorage: the student
// search flow is meant to run on shared/public devices, and we don't
// want the *next* person to reopen the tab later and land on a
// stranger's student record. sessionStorage clears when the tab/browser
// closes, so this only smooths over reloads within one sitting.
// ------------------------------------------------------------------

const KEY = "dtb-view-session";

interface ViewSession {
  view: ViewState;
  /** Set when the restorable view is a student's own record. */
  studentId?: string;
}

export function saveViewSession(session: ViewSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch (error) {
    console.warn("Failed to save view session:", error);
  }
}

export function loadViewSession(): ViewSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ViewSession;
  } catch (error) {
    console.warn("Failed to read view session:", error);
    return null;
  }
}

export function clearViewSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch (error) {
    console.warn("Failed to clear view session:", error);
  }
}
