import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase"; // Relative path

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://hqxdssfvqyyrytvtkcmf.supabase.co";
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxeGRzc2Z2cXl5cnl0dnRrY21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTYxMDksImV4cCI6MjA4OTMzMjEwOX0.zrXJVPmQU7RhjeSW7qAwj48GEwVfYfUirLagOLzUO9s";

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);

export const isSupabaseConfigured = () => {
  return !!supabaseUrl && !!supabaseKey;
};
