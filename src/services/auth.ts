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
  if (m.includes("invalid login credentials") || m.includes("invalid credentials")) {
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
    if (!data.user) throw new Error("Sign in succeeded but no user was returned.");

    const roleRecord = await fetchRole(data.user.id);
    if (!roleRecord) {
      // No role row → this Supabase user is not an officer. Sign back out
      // immediately so the app is never left in a half-authed state.
      await getSupabase().auth.signOut();
      throw new Error(
        "This account is not assigned an officer role. " +
          "Ask the administrator to add it to user_roles."
      );
    }

    return {
      user: data.user,
      role: roleRecord.role,
      displayName: roleRecord.name || toDisplayName(data.user, roleRecord.role),
    };
  },

  /** Restores a persisted session after a page reload (null when signed out). */
  async restoreSession(): Promise<AuthSession | null> {
    const {
      data: { session },
      error,
    } = await getSupabase().auth.getSession();
    if (error || !session?.user) return null;

    const roleRecord = await fetchRole(session.user.id);
    if (!roleRecord) {
      // The account lost its role (e.g. role row deleted) — sign out.
      await getSupabase().auth.signOut();
      return null;
    }
    return {
      user: session.user,
      role: roleRecord.role,
      displayName: roleRecord.name || toDisplayName(session.user, roleRecord.role),
    };
  },

  async signOut(): Promise<void> {
    await getSupabase().auth.signOut();
  },
};

export type { UserRole };