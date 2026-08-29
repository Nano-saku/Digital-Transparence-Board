import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ------------------------------------------------------------------
// Supabase configuration
// ------------------------------------------------------------------
// Values come from your Supabase project dashboard:
// Project Settings > API > Project URL and Publishable key (or anon key).
// Copy .env.example to .env and fill in the values.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null = null;

/** True when the required Supabase env vars are present. */
export const isSupabaseConfigured = (): boolean =>
  Boolean(supabaseUrl && supabaseKey);

/**
 * Returns the initialized Supabase client, or throws a helpful error when the
 * project has not been configured yet. Initialization is lazy so importing
 * this module (and the db service layer) never crashes the app.
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env and add your " +
        "Supabase project URL and publishable key. See SUPABASE_INTEGRATION.md " +
        "for details."
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseKey, {
      // The app now uses real Supabase Auth (officer accounts from
      // supabase/security.sql), so sessions persist across reloads.
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}