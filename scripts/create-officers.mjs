// Synchronizes roles for existing officer accounts through the Supabase Admin API.
// It never creates users and never changes passwords.
//
// Usage:
//   1. Add SUPABASE_SERVICE_ROLE_KEY to .env.
//   2. node scripts/create-officers.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.");
  process.exit(1);
}

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const officers = [
  { email: "admin@studentboard.ph", role: "admin", name: "Student Council Admin" },
  { email: "secretary@studentboard.ph", role: "secretary", name: "Council Secretary" },
  { email: "treasurer@studentboard.ph", role: "treasurer", name: "Council Treasurer" },
  { email: "auditor@studentboard.ph", role: "auditor", name: "Council Auditor" },
  { email: "boardmember@studentboard.ph", role: "board-member", name: "Board Member" },
];

for (const officer of officers) {
  const { data, error } = await admin.auth.admin.getUserByEmail(officer.email);
  if (error || !data?.user) {
    console.log(`${officer.email}: missing; no account was created`);
    continue;
  }

  const { error: roleError } = await admin
    .from("user_roles")
    .upsert(
      { user_id: data.user.id, role: officer.role, name: officer.name },
      { onConflict: "user_id" }
    );
  console.log(
    `${officer.email}: role ${officer.role}`,
    roleError ? `ERROR -> ${roleError.message}` : "synchronized"
  );
}

console.log("Done. Existing authentication accounts and passwords were not changed.");