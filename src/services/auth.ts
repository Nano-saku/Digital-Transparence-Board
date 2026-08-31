import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type { UserRole } from "@/types";

// ------------------------------------------------------------------
// Auth service — real Supabase Auth for officer accounts.
//
// Accounts are created in Supabase by supabase/security.sql:
//   admin@studentboard.ph     (role: admin)
//   secretary@studentboard.ph (role: secretary)
//   treasurer@studentboard.ph (role: treasurer)
//
// The role lives in the public.user_roles table (one row per officer).
// ------------------------------------------------------------------

export interface AuthSession {
  user: User;
  role: UserRole;
  // Human-readable name used for the "recorded by" fields.
  displayName: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Student Council Admin",
  secretary: "Council Secretary",
  treasurer: "Council Treasurer",
  auditor: "Council Auditor",
  "board-member": "Board Member",
};
const AUTH_CACHE_KEY = "dtb-offline-auth-session";

interface CachedAuthSession {
  userId: string;
  role: UserRole;
  displayName: string;
}
function saveCachedAuthSession(session: AuthSession): void {
  try {
    localStorage.setItem(
      AUTH_CACHE_KEY,
      JSON.stringify({
        userId: session.user.id,
        role: session.role,
        displayName: session.displayName,
      } satisfies CachedAuthSession),
    );
  } catch (error) {
    console.warn("Failed to cache auth session:", error);
  }
}

function getCachedAuthSession(user: User): CachedAuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);

    if (!raw) return null;

    const cached = JSON.parse(raw) as CachedAuthSession;

    // Never use another user's cached role.
    if (cached.userId !== user.id) return null;

    return cached;
  } catch (error) {
    console.warn("Failed to read cached auth session:", error);
    return null;
  }
}

function clearCachedAuthSession(): void {
  try {
    localStorage.removeItem(AUTH_CACHE_KEY);
  } catch (error) {
    console.warn("Failed to clear cached auth session:", error);
  }
}

/** Reads the officer's role from public.user_roles. */
interface RoleRecord {
  role: UserRole;
  name: string | null;
}

async function fetchRole(userId: string): Promise<RoleRecord | null> {
  const { data, error } = await getSupabase()
    .from("user_roles")
    .select("role, name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("auth: could not read role:", error.message);
    return null;
  }
  if (!data || !data.role) return null;
  return data as RoleRecord;
}

function toDisplayName(user: User, role: UserRole): string {
  const metaName =
    user.user_metadata?.name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.display_name;
  if (metaName) return String(metaName);
  return ROLE_LABELS[role];
}

function friendlyAuthMessage(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("invalid login credentials") ||
    m.includes("invalid credentials")
  ) {
    return "Invalid email or password. Please try again.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email address before signing in.";
  }
  if (m.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (m.includes("email address")) {
    return "No account found with that email address.";
  }
  if (m.includes("password should be at least")) {
    return "Password should be at least 6 characters.";
  }
  if (m.includes("same password") || m.includes("different from the old")) {
    return "New password must be different from your current password.";
  }
  if (m.includes("auth session missing") || m.includes("session_not_found")) {
    return "This reset link has expired or was already used. Request a new one.";
  }
  return message;
}

export const authService = {
  /** Signs an officer in with email + password and resolves their role. */
  async signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await getSupabase().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) throw new Error(friendlyAuthMessage(error.message));
    if (!data.user)
      throw new Error("Sign in succeeded but no user was returned.");

    const roleRecord = await fetchRole(data.user.id);
    if (!roleRecord) {
      // No role row → this Supabase user is not an officer. Sign back out
      // immediately so the app is never left in a half-authed state.
      await getSupabase().auth.signOut();
      throw new Error(
        "This account is not assigned an officer role. " +
          "Ask the administrator to add it to user_roles.",
      );
    }

    const authSession: AuthSession = {
      user: data.user,
      role: roleRecord.role,
      displayName: roleRecord.name || toDisplayName(data.user, roleRecord.role),
    };

    saveCachedAuthSession(authSession);

    return authSession;
  },

  /** Restores a persisted session after a page reload (null when signed out). */
  async restoreSession(): Promise<AuthSession | null> {
    const {
      data: { session },
      error,
    } = await getSupabase().auth.getSession();

    if (error || !session?.user) {
      return null;
    }

    const cached = getCachedAuthSession(session.user);

    try {
      const roleRecord = await fetchRole(session.user.id);

      if (roleRecord) {
        const authSession: AuthSession = {
          user: session.user,
          role: roleRecord.role,
          displayName:
            roleRecord.name || toDisplayName(session.user, roleRecord.role),
        };

        saveCachedAuthSession(authSession);

        return authSession;
      }

      /*
       * If Supabase is reachable but the user genuinely has no role,
       * this account should not remain authenticated as an officer.
       */
      if (navigator.onLine) {
        clearCachedAuthSession();
        await getSupabase().auth.signOut();
        return null;
      }
    } catch (error) {
      console.warn(
        "Could not verify role online. Attempting offline auth recovery:",
        error,
      );
    }

    /*
     * Offline fallback:
     * Supabase still has a valid persisted session, but we cannot
     * query user_roles. Restore the previously verified local role.
     */
    if (cached) {
      return {
        user: session.user,
        role: cached.role,
        displayName: cached.displayName,
      };
    }

    return null;
  },

  async signOut(): Promise<void> {
    clearCachedAuthSession();
    await getSupabase().auth.signOut();
  },

  /**
   * Sends a password-reset email to an officer account. The link in that
   * email brings them back to this app (redirectTo below), at which point
   * Supabase fires a PASSWORD_RECOVERY auth event — see onPasswordRecovery.
   * Uses the anon key only; safe to call from the browser.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await getSupabase().auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: window.location.origin + window.location.pathname },
    );
    if (error) throw new Error(friendlyAuthMessage(error.message));
  },

  /**
   * Sets a new password. Must be called while a recovery session is active
   * (i.e. after the PASSWORD_RECOVERY event has fired), or while an officer
   * is normally signed in.
   */
  async hasRecoverySession(): Promise<boolean> {
    const {
      data: { session },
      error,
    } = await getSupabase().auth.getSession();

    if (error) {
      console.error("Could not check recovery session:", error);
      return false;
    }

    return Boolean(session);
  },
  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await getSupabase().auth.updateUser({
      password: newPassword,
    });
    if (error) throw new Error(friendlyAuthMessage(error.message));
  },

  /**
   * Subscribes to the PASSWORD_RECOVERY auth event, which Supabase fires
   * once when the user lands on this page via a password-reset link.
   * Returns an unsubscribe function.
   */
  onPasswordRecovery(callback: () => void): () => void {
    const supabase = getSupabase();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        callback();
      }
    });

    return () => subscription.unsubscribe();
  },
};

export type { UserRole };
