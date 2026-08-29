-- =====================================================================
--  Digital Transparency Board - Security, Accounts & Policies
-- =====================================================================
--  HOW TO RUN
--  ----------
--  1. Open the Supabase Dashboard and select your project.
--  2. Click "SQL Editor" -> "+ New query".
--  3. Paste the ENTIRE contents of this file and click "Run".
--  4. The script is idempotent (safe to re-run). It removes only the obsolete
--     profile-image column; authentication accounts and role assignments stay.
--
--  TROUBLESHOOTING
--  ---------------
--  If an earlier run failed with:
--      ERROR: 42704: role "publishable" does not exist
--  that has been fixed (publishable grants are now conditional). Simply
--  re-run the ENTIRE file — it is idempotent and safe to apply again.
--
--  If officer login fails, manage the account through Supabase Authentication.
--  This file does not create, repair, or mutate authentication records.
-- ---------------------------------------------------------------------
--  WHAT THIS DOES
--  --------------
--   1. Creates public.user_roles          (maps Supabase auth user -> role)
--   2. Creates role helper functions      (public.has_role / public.is_staff)
--   3. Creates a public "receipts" storage bucket + upload/read policies
--   4. REPLACES the open RLS policies with strict, role-aware policies:
--        - public (students, anon)      -> SELECT only (read the board)
--        - admin     -> can write to every table
--        - secretary -> can write attendance records only
--        - treasurer -> can write financial tables only
--        - students  -> can still submit feedback (INSERT) anonymously
--   5. SYNCs roles in public.user_roles for existing officer accounts:
--        admin@studentboard.ph     (role: admin)
--        secretary@studentboard.ph (role: secretary)
--        treasurer@studentboard.ph (role: treasurer)
--        auditor@studentboard.ph   (role: auditor)
--        boardmember@studentboard.ph (role: board-member)
--      The accounts must be created through Supabase Authentication. The
--      companion file supabase/create_officer_accounts.sql and
--      scripts/create-officers.mjs only synchronize roles for accounts that
--      already exist. Alternative path: Dashboard "Authentication > Users >
--      Add user" (enable "Auto Confirm User").
--   6. Removes the obsolete profile_image_url column from user_roles. Officer
--      images are local application assets, never Supabase data.
--
--  ⚠️ SECURITY NOTE
--  ---------------
--  Officer passwords are set only where each account is created through
--  Supabase Authentication and are outside the scope of this file.
-- =====================================================================

-- =====================================================================
-- 1. user_roles table
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id           uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role              text NOT NULL,
  name              text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Remove the temporary profile-image field from databases that received it in
-- an earlier version. This changes no auth accounts, passwords, roles, or
-- permissions; the dashboard now uses its local public logo asset instead.
ALTER TABLE public.user_roles
  DROP COLUMN IF EXISTS profile_image_url;

-- Re-apply the role whitelist every run so re-running this file on an
-- existing database upgrades the constraint to include the new roles
-- (auditor, board-member).
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
    CHECK (role IN ('admin', 'secretary', 'treasurer', 'auditor', 'board-member'));

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_read_own" ON public.user_roles;
CREATE POLICY "user_roles_read_own"
  ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Officers may read the board-member roster (id + name) so admins can
-- assign board members to events and members can see their assignments.
DROP POLICY IF EXISTS "user_roles_read_board_members" ON public.user_roles;
CREATE POLICY "user_roles_read_board_members"
  ON public.user_roles
  FOR SELECT TO authenticated
  USING (role = 'board-member');

-- anon / authenticated exist on every Supabase project and always need read
-- access to user_roles (the app reads the logged-in officer's role with it).
GRANT SELECT ON public.user_roles TO anon, authenticated;
-- "publishable" only exists on newer Supabase projects. On older projects it
-- causes `ERROR: role "publishable" does not exist`, so grant it conditionally.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'publishable') THEN
    GRANT SELECT ON public.user_roles TO publishable;
  END IF;
END $$;

-- =====================================================================
-- 2. Role helper functions (used by the RLS policies below)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.has_role(required_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = $1
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'secretary', 'treasurer', 'auditor', 'board-member')
  );
$$;

-- =====================================================================
-- 3. Storage: public "receipts" bucket + policies
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "receipts_public_read" ON storage.objects;
CREATE POLICY "receipts_public_read"
  ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "receipts_authenticated_upload" ON storage.objects;
CREATE POLICY "receipts_authenticated_upload"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');

-- =====================================================================
-- 3b. Non-destructive schema additions (safe on an existing database)
-- =====================================================================
-- New in this version: board members can be assigned to events. schema.sql
-- already declares these columns for fresh setups; this block upgrades an
-- existing database without dropping any data.
CREATE TABLE IF NOT EXISTS public.board_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  account_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_board_members_name
  ON public.board_members (lower(name));
CREATE INDEX IF NOT EXISTS idx_board_members_account_user_id
  ON public.board_members (account_user_id);

ALTER TABLE events ADD COLUMN IF NOT EXISTS assigned_member_ids   TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE events ADD COLUMN IF NOT EXISTS assigned_member_names TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "board_members_read_public" ON public.board_members;
CREATE POLICY "board_members_read_public" ON public.board_members FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "board_members_write_admin" ON public.board_members;
CREATE POLICY "board_members_write_admin" ON public.board_members FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_members TO anon, authenticated;

-- Scheduled attendance windows per event (24h HH:MM). The QR scanner compares
-- the actual scan time against these to auto-derive Present / Late / Absent.
-- Each event has a Morning session and an Afternoon session (both optional).
ALTER TABLE events ADD COLUMN IF NOT EXISTS time_in            TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS time_out           TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS morning_time_in    TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS morning_time_out   TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS afternoon_time_in  TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS afternoon_time_out TEXT NOT NULL DEFAULT '';

-- Attendance manual time-in / time-out (24h HH:MM). The secretary/admin
-- types the shift each student attended, e.g. 06:00 - 12:00 (AM session)
-- or 13:00 - 17:00 (PM session). Safe to re-run on any database.
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS time_in  TEXT NOT NULL DEFAULT '';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS time_out TEXT NOT NULL DEFAULT '';

-- Which shift each attendance row belongs to (Morning / Afternoon session).
-- REQUIRED for Time In / Time Out recording: every insert/update sent by the
-- app includes this column, so an existing database WITHOUT it rejects all
-- attendance writes ("Could not find the 'session' column of 'attendance'").
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS session TEXT NOT NULL DEFAULT 'morning';

-- =====================================================================
-- 4. Strict, role-aware RLS policies
-- =====================================================================
-- Remove the old open "public_all" policies (created by schema.sql).
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_all" ON students;
DROP POLICY IF EXISTS "public_all" ON events;
DROP POLICY IF EXISTS "public_all" ON attendance;
DROP POLICY IF EXISTS "public_all" ON contributions;
DROP POLICY IF EXISTS "public_all" ON payments;
DROP POLICY IF EXISTS "public_all" ON transactions;
DROP POLICY IF EXISTS "public_all" ON feedback;
DROP POLICY IF EXISTS "public_all" ON financial_summaries;
DROP POLICY IF EXISTS "public_all" ON event_allocations;

-- ---------------------------------------------------------------------
-- students (admin can write)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "students_read_public" ON students;
CREATE POLICY "students_read_public" ON students FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "students_write_admin" ON students;
CREATE POLICY "students_write_admin" ON students FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- ---------------------------------------------------------------------
-- events (admin can write)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "events_read_public" ON events;
CREATE POLICY "events_read_public" ON events FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "events_write_admin" ON events;
CREATE POLICY "events_write_admin" ON events FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- ---------------------------------------------------------------------
-- attendance (admin + secretary can write — secretary does attendance)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "attendance_read_public" ON attendance;
CREATE POLICY "attendance_read_public" ON attendance FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "attendance_write_staff" ON attendance;
CREATE POLICY "attendance_write_staff" ON attendance FOR ALL TO authenticated
  USING (public.has_role('admin') OR public.has_role('secretary'))
  WITH CHECK (public.has_role('admin') OR public.has_role('secretary'));

-- ---------------------------------------------------------------------
-- contributions (admin + treasurer + auditor can write)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "contributions_read_public" ON contributions;
CREATE POLICY "contributions_read_public" ON contributions FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "contributions_write_staff" ON contributions;
CREATE POLICY "contributions_write_staff" ON contributions FOR ALL TO authenticated
  USING (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'))
  WITH CHECK (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'));

-- ---------------------------------------------------------------------
-- payments (admin + treasurer + auditor can write)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "payments_read_public" ON payments;
CREATE POLICY "payments_read_public" ON payments FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "payments_write_staff" ON payments;
CREATE POLICY "payments_write_staff" ON payments FOR ALL TO authenticated
  USING (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'))
  WITH CHECK (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'));

-- ---------------------------------------------------------------------
-- transactions (admin + treasurer + auditor can write)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "transactions_read_public" ON transactions;
CREATE POLICY "transactions_read_public" ON transactions FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "transactions_write_staff" ON transactions;
CREATE POLICY "transactions_write_staff" ON transactions FOR ALL TO authenticated
  USING (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'))
  WITH CHECK (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'));

-- ---------------------------------------------------------------------
-- financial_summaries (admin + treasurer can write)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "financial_summaries_read_public" ON financial_summaries;
CREATE POLICY "financial_summaries_read_public" ON financial_summaries FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "financial_summaries_write_staff" ON financial_summaries;
CREATE POLICY "financial_summaries_write_staff" ON financial_summaries FOR ALL TO authenticated
  USING (public.has_role('admin') OR public.has_role('treasurer'))
  WITH CHECK (public.has_role('admin') OR public.has_role('treasurer'));

-- ---------------------------------------------------------------------
-- event_allocations (admin + treasurer can write)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "event_allocations_read_public" ON event_allocations;
CREATE POLICY "event_allocations_read_public" ON event_allocations FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "event_allocations_write_staff" ON event_allocations;
CREATE POLICY "event_allocations_write_staff" ON event_allocations FOR ALL TO authenticated
  USING (public.has_role('admin') OR public.has_role('treasurer'))
  WITH CHECK (public.has_role('admin') OR public.has_role('treasurer'));

-- ---------------------------------------------------------------------
-- feedback
--   - INSERT is open to everyone (students submit complaints/inquiries).
--   - SELECT is restricted to staff only (admin / secretary / treasurer).
--   - UPDATE / DELETE are admin only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "feedback_submit_public" ON feedback;
CREATE POLICY "feedback_submit_public" ON feedback FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "feedback_read_staff" ON feedback;
CREATE POLICY "feedback_read_staff" ON feedback FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "feedback_update_admin" ON feedback;
CREATE POLICY "feedback_update_admin" ON feedback FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
DROP POLICY IF EXISTS "feedback_delete_admin" ON feedback;
CREATE POLICY "feedback_delete_admin" ON feedback FOR DELETE TO authenticated USING (public.has_role('admin'));

-- Make sure the API roles can reach the tables (kept permissive at the
-- GRANT level so policies remain the single source of truth).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'publishable') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO publishable';
  END IF;
END $$;

DO $$
DECLARE
  officer_email text;
  officer_role text;
  officer_name text;
  uid           uuid;
BEGIN
  -- Existing accounts are provisioned through Supabase Authentication. This
  -- block only synchronizes the application-side role mapping.
  FOR officer_email, officer_role, officer_name IN VALUES
    ('admin@studentboard.ph',     'admin',       'Student Council Admin'),
    ('secretary@studentboard.ph', 'secretary',   'Council Secretary'),
    ('treasurer@studentboard.ph', 'treasurer',   'Council Treasurer'),
    ('auditor@studentboard.ph',   'auditor',     'Council Auditor'),
    ('boardmember@studentboard.ph', 'board-member', 'Board Member')
  LOOP
    SELECT id INTO uid FROM auth.users WHERE email = officer_email;

    IF uid IS NULL THEN
      RAISE NOTICE 'OFFICER ACCOUNT MISSING for % — create it (Dashboard > Authentication > Users > Add user, Auto Confirm ON), then re-run this file.', officer_email;
      CONTINUE;
    END IF;

    INSERT INTO public.user_roles (user_id, role, name)
    VALUES (uid, officer_role, officer_name)
    ON CONFLICT (user_id) DO UPDATE
      SET role = EXCLUDED.role,
          name = EXCLUDED.name;

    RAISE NOTICE 'Role % synced for %', officer_role, officer_email;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 6. Sanity check: role assignments
-- ---------------------------------------------------------------------
SELECT u.email, r.role, r.name
FROM auth.users u
JOIN public.user_roles r ON r.user_id = u.id
ORDER BY r.role;

-- =====================================================================
-- DONE. Officer roles are provisioned. The accounts themselves must
-- exist in auth.users (Dashboard "Add user" or scripts/create-officers.mjs)
-- for the app's Admin page sign-in to work.
-- =====================================================================