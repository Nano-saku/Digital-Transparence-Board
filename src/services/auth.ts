import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { auditLogsService } from "@/services/db";
import type { UserRole } from "@/types";

// Officer accounts live in Supabase Auth; each officer's role is a row in
// public.user_roles (see supabase/security.sql).

export interface AuthSession {
  user: User;
  role: UserRole;
  /** Used for the "recorded by" fields. */
  displayName: string;
}

// Fallback "recorded by" names (persisted on records, so keep them stable).
const DEFAULT_NAMES: Record<UserRole, string> = {
  admin: "Student Council Admin",
  secretary: "Council Secretary",
  treasurer: "Council Treasurer",
  auditor: "Council Auditor",
  "board-member": "Board Member",
};

// Last verified role, so a signed-in officer can still open the app offline.
const AUTH_CACHE_KEY = "dtb-offline-auth-session";
type CachedAuthSession = { userId: string; role: UserRole; displayName: string };

function storage<T>(action: () => T, label: string): T | null {
  try {
    return action();
  } catch (error) {
    console.warn(`Failed to ${label} auth session:`, error);
    return null;
  }
}

const saveCachedSession = ({ user, role, displayName }: AuthSession) =>
  storage(
    () =>
      localStorage.setItem(
        AUTH_CACHE_KEY,
        JSON.stringify({ userId: user.id, role, displayName } satisfies CachedAuthSession),
      ),
    "cache",
  );

const clearCachedSession = () => storage(() => localStorage.removeItem(AUTH_CACHE_KEY), "clear cached");

function readCachedSession(user: User): CachedAuthSession | null {
  const cached = storage(() => {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedAuthSession) : null;
  }, "read cached");
  // Never reuse another user's cached role.
  return cached?.userId === user.id ? cached : null;
}

/** The officer's role row, or null when there is none. Throws when the lookup itself fails. */
async function fetchRole(userId: string): Promise<{ role: UserRole; name: string | null } | null> {
  const { data, error } = await getSupabase()
    .from("user_roles")
    .select("role, name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.role ? data : null;
}

function buildSession(user: User, role: UserRole, name: string | null): AuthSession {
  const meta = user.user_metadata ?? {};
  const displayName = name || meta.name || meta.full_name || meta.display_name || DEFAULT_NAMES[role];
  const session = { user, role, displayName: String(displayName) };
  saveCachedSession(session);
  return session;
}

/** Best-effort sign-in/out audit entry: authentication must work even when audit storage is down. */
async function auditAuth(session: AuthSession, action: "OFFICER_SIGNED_IN" | "OFFICER_SIGNED_OUT"): Promise<void> {
  const signedIn = action === "OFFICER_SIGNED_IN";
  try {
    await auditLogsService.create({
      actorUserId: session.user.id,
      actorName: session.displayName,
      actorRole: session.role,
      action,
      entityType: "authentication",
      entityId: session.user.id,
      description: `${session.displayName} ${signedIn ? "signed in successfully" : "signed out"}.`,
      metadata: { email: session.user.email ?? undefined },
    });
  } catch (auditError) {
    console.warn(`Could not record officer ${signedIn ? "login" : "logout"} audit:`, auditError);
  }
}

const FRIENDLY_MESSAGES: [RegExp, string][] = [
  [/invalid (login )?credentials/, "Invalid email or password. Please try again."],
  [/email not confirmed/, "Please confirm your email address before signing in."],
  [/rate limit/, "Too many attempts. Please wait a moment and try again."],
  [/email address/, "No account found with that email address."],
  [/password should be at least/, "Password should be at least 6 characters."],
  [/same password|different from the old/, "New password must be different from your current password."],
  [/auth session missing|session_not_found/, "This reset link has expired or was already used. Request a new one."],
];

const friendlyError = (message: string): Error =>
  new Error(FRIENDLY_MESSAGES.find(([pattern]) => pattern.test(message.toLowerCase()))?.[1] ?? message);

export const authService = {
  /** Signs an officer in with email + password and resolves their role. */
  async signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await getSupabase().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw friendlyError(error.message);
    if (!data.user) throw new Error("Sign in succeeded but no user was returned.");

    const roleRecord = await fetchRole(data.user.id).catch((roleError: { message?: string }) => {
      console.error("auth: could not read role:", roleError.message);
      return null;
    });
    if (!roleRecord) {
      // Not an officer: never leave the app half-authenticated.
      await getSupabase().auth.signOut();
      throw new Error(
        "This account is not assigned an officer role. Ask the administrator to add it to user_roles.",
      );
    }
    const session = buildSession(data.user, roleRecord.role, roleRecord.name);
    await auditAuth(session, "OFFICER_SIGNED_IN");
    return session;
  },

  /** Restores a persisted session after reload (null when signed out). */
  async restoreSession(): Promise<AuthSession | null> {
    const {
      data: { session },
      error,
    } = await getSupabase().auth.getSession();
    if (error || !session?.user) return null;
    const { user } = session;

    try {
      const roleRecord = await fetchRole(user.id);
      if (roleRecord) return buildSession(user, roleRecord.role, roleRecord.name);
      // A reachable server says this user has no role: sign them out.
      clearCachedSession();
      await getSupabase().auth.signOut();
      return null;
    } catch (roleError) {
      console.warn("Could not verify role online. Attempting offline auth recovery:", roleError);
    }

    // Supabase still holds a valid session but user_roles is unreachable: reuse the last verified role.
    const cached = readCachedSession(user);
    return cached ? { user, role: cached.role, displayName: cached.displayName } : null;
  },

  /** Signs out, auditing first (while still authenticated) when `session` is given. */
  async signOut(session?: AuthSession): Promise<void> {
    if (session) await auditAuth(session, "OFFICER_SIGNED_OUT");
    clearCachedSession();
    await getSupabase().auth.signOut();
  },

  /** Emails a reset link that returns to this page and fires PASSWORD_RECOVERY. */
  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) throw friendlyError(error.message);
  },

  async hasRecoverySession(): Promise<boolean> {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) {
      console.error("Could not check recovery session:", error);
      return false;
    }
    return Boolean(data.session);
  },

  /** Sets a new password (needs a recovery session or a normal sign-in). */
  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await getSupabase().auth.updateUser({ password: newPassword });
    if (error) throw friendlyError(error.message);
  },

  /** Calls back when the user lands here from a password-reset link. Returns an unsubscribe. */
  onPasswordRecovery(callback: () => void): () => void {
    const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) callback();
    });
    return () => data.subscription.unsubscribe();
  },
};

export type { UserRole };
