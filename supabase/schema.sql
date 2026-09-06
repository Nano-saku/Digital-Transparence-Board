-- =====================================================================
--  Digital Transparency Board - Supabase (PostgreSQL) database setup
-- =====================================================================
--  HOW TO RUN THIS FILE
--  --------------------
--  This file is the REFERENCE setup for a Supabase project:
--    1. Open the Supabase Dashboard and select your project.
--    2. Click "SQL Editor" -> "+ New query".
--    3. Paste the ENTIRE contents of this file into the editor.
--    4. Click "Run".
--  5. Then run supabase/security.sql in the same editor to apply the
--       existing-account role mappings and security policies — do not skip it.
--
--  This file is non-destructive and rerunnable: it creates or preserves the
--  production structure and never drops tables or inserts demo records.
--
--  It creates the 10 tables the app uses, adds lookup indexes, enables
--  Row Level Security with strict role-based policies (public = read
--  only; writes require an admin / secretary / treasurer / auditor /
--  board-member account with the matching permission), and
--    leaves all operational tables empty for production data entry.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Create tables
-- ---------------------------------------------------------------------
-- Intentionally no DROP statements: this script must not remove production data.
CREATE TABLE IF NOT EXISTS public.students (
  id         TEXT PRIMARY KEY,         -- app-level string id (was the Firestore doc id)
  student_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  program    TEXT NOT NULL,
  year_level INTEGER NOT NULL DEFAULT 0,
  section    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.events (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  allocation_amount   INTEGER NOT NULL DEFAULT 0,
  date                TEXT,          -- ISO 'YYYY-MM-DD' kept as text for app parity
  -- Scheduled attendance windows (24h HH:MM). The QR scanner compares the
  -- actual scan time against these to auto-derive Present / Late / Absent.
  -- Each event has a Morning session and an Afternoon session (both optional;
  -- an empty window means that session is not held).
  time_in             TEXT NOT NULL DEFAULT '',
  time_out            TEXT NOT NULL DEFAULT '',
  morning_time_in     TEXT NOT NULL DEFAULT '',
  morning_time_out    TEXT NOT NULL DEFAULT '',
  afternoon_time_in   TEXT NOT NULL DEFAULT '',
  afternoon_time_out  TEXT NOT NULL DEFAULT '',
  -- Board members assigned to this event (parallel arrays of user id + name
  -- snapshots; the names are stored so the list survives profile renames).
  assigned_member_ids   TEXT[] NOT NULL DEFAULT '{}',
  assigned_member_names TEXT[] NOT NULL DEFAULT '{}'
);

-- A display catalog, deliberately separate from auth.users. Only members who
-- need dashboard access require an account; the catalog can contain all seven
-- elected names without creating seven login accounts.
CREATE TABLE IF NOT EXISTS public.board_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  account_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_board_members_name ON public.board_members (lower(name));
CREATE INDEX IF NOT EXISTS idx_board_members_account_user_id ON public.board_members (account_user_id);

CREATE TABLE IF NOT EXISTS public.attendance (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  event_id   TEXT NOT NULL,
  event_name TEXT NOT NULL DEFAULT '',
  date       TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'present',  -- present | absent | late | excused
  -- Which shift the row belongs to — the app records Morning and Afternoon
  -- separately, so one student can have two rows per event. Existing rows
  -- default to Morning. REQUIRED: every attendance write from the app sends
  -- this column, so a database missing it rejects all Time In/Out saves.
  session    TEXT NOT NULL DEFAULT 'morning',  -- morning | afternoon
  -- Manual time-in / time-out for the shift the student attended (24h HH:MM).
  -- Events commonly run an AM session (e.g. 06:00 - 12:00) and/or a PM
  -- session (e.g. 13:00 - 17:00) - the secretary records these by hand.
  time_in    TEXT NOT NULL DEFAULT '',
  time_out   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_event_id   ON public.attendance (event_id);

CREATE TABLE IF NOT EXISTS public.contributions (
  id                TEXT PRIMARY KEY,
  student_id        TEXT NOT NULL,
  event_id          TEXT NOT NULL,
  event_name        TEXT NOT NULL DEFAULT '',
  required_amount   INTEGER NOT NULL DEFAULT 0,
  amount_paid       INTEGER NOT NULL DEFAULT 0,
  remaining_balance INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_contributions_student_id ON public.contributions (student_id);
CREATE INDEX IF NOT EXISTS idx_contributions_event_id   ON public.contributions (event_id);

CREATE TABLE IF NOT EXISTS public.payments (
  id           TEXT PRIMARY KEY,
  student_id   TEXT NOT NULL,
  student_name TEXT NOT NULL DEFAULT '',
  event_id     TEXT,
  event_name   TEXT,
  amount       INTEGER NOT NULL DEFAULT 0,
  date         TEXT NOT NULL DEFAULT '',
  receipt_url  TEXT,
  or_number    TEXT,
  recorded_by  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON public.payments (student_id);
CREATE INDEX IF NOT EXISTS idx_payments_event_id   ON public.payments (event_id);

-- ---------------------------------------------------------------------
-- Official Receipt (OR) number sequence.
-- Holds the last-used six-digit sequence number for every calendar year so
-- OR numbers (OR-YYYY-NNNNNN) are unique and continuous across sessions and
-- devices, and automatically restart at 000001 when the year changes.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.or_sequence (
  year      INTEGER PRIMARY KEY CHECK (year >= 2000),
  last_used INTEGER NOT NULL DEFAULT 0 CHECK (last_used >= 0)
);

-- Atomically reserves and returns the next Official Receipt number.
-- Runs with SECURITY DEFINER so the counter row can always be advanced even
-- though RLS is enabled; callers may only obtain numbers the app asks for, so
-- this does not leak data and cannot be used to mint receipts for partial
-- payments (the app enforces the fully-paid rule before calling it).
CREATE OR REPLACE FUNCTION public.get_next_or_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_yr  INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  next_seq    INTEGER;
BEGIN
  INSERT INTO public.or_sequence (year, last_used)
  VALUES (current_yr, 0)
  ON CONFLICT (year) DO NOTHING;

  UPDATE public.or_sequence
     SET last_used = last_used + 1
   WHERE year = current_yr
   RETURNING last_used INTO next_seq;

  RETURN 'OR-' || current_yr::TEXT || '-' || LPAD(next_seq::TEXT, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_or_number() TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.transactions (
  id                  TEXT PRIMARY KEY,
  date                TEXT NOT NULL DEFAULT '',
  description         TEXT NOT NULL DEFAULT '',
  event_id            TEXT,
  event_name          TEXT,
  amount              INTEGER NOT NULL DEFAULT 0,
  type                TEXT NOT NULL DEFAULT 'income'
                      CHECK (type IN ('income', 'expense')),
  responsible_officer TEXT NOT NULL DEFAULT '',
  receipt_url         TEXT
);
CREATE INDEX IF NOT EXISTS idx_transactions_event_id ON public.transactions (event_id);

CREATE TABLE IF NOT EXISTS public.feedback (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL CHECK (type IN ('inquiry', 'complaint', 'suggestion')),
  title        TEXT,
  message      TEXT NOT NULL,
  student_name TEXT,
  student_id   TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'in-progress', 'resolved'))
);

-- ---------------------------------------------------------------------
-- 3. Row Level Security (strict, role-based)
-- ---------------------------------------------------------------------
-- The transparency board is PUBLIC for reading (anyone may view the
-- records). Writing is restricted to the staff roles created by
-- supabase/security.sql:
--     admin      -> may write every table
--     secretary  -> may write attendance only
--     treasurer  -> may write financial tables only
--     auditor    -> may write contribution/payment/transaction tables
--     board-member -> read-only access to assigned event data
-- Public visitors can still submit feedback (INSERT on feedback).
-- The helper functions below are (re)created here so this file also
-- works standalone; supabase/security.sql creates the accounts.

-- Staff role mapping (owned by security.sql — never dropped here so
-- officer accounts survive a schema.sql re-run).
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id           uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role              text NOT NULL CHECK (role IN ('admin', 'secretary', 'treasurer', 'auditor', 'board-member')),
  name              text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_read_own" ON public.user_roles;
CREATE POLICY "user_roles_read_own"
  ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

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

CREATE OR REPLACE FUNCTION public.has_role(required_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = $1
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'secretary', 'treasurer', 'auditor', 'board-member')
  );
$$;

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Public read access (the whole point of a transparency board)
DROP POLICY IF EXISTS "students_read_public" ON public.students;
CREATE POLICY "students_read_public" ON students FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "events_read_public" ON public.events;
CREATE POLICY "events_read_public" ON events FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "board_members_read_public" ON public.board_members;
CREATE POLICY "board_members_read_public" ON public.board_members FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "attendance_read_public" ON public.attendance;
CREATE POLICY "attendance_read_public" ON attendance FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "contributions_read_public" ON public.contributions;
CREATE POLICY "contributions_read_public" ON contributions FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "payments_read_public" ON public.payments;
CREATE POLICY "payments_read_public" ON payments FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "transactions_read_public" ON public.transactions;
CREATE POLICY "transactions_read_public" ON transactions FOR SELECT TO public USING (true);

-- admin: write everything
DROP POLICY IF EXISTS "students_write_admin" ON public.students;
CREATE POLICY "students_write_admin" ON students FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
DROP POLICY IF EXISTS "events_write_admin" ON public.events;
CREATE POLICY "events_write_admin" ON events FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
DROP POLICY IF EXISTS "board_members_write_admin" ON public.board_members;
CREATE POLICY "board_members_write_admin" ON public.board_members FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- admin or secretary: attendance
DROP POLICY IF EXISTS "attendance_write_staff" ON public.attendance;
CREATE POLICY "attendance_write_staff" ON attendance FOR ALL TO authenticated
  USING (public.has_role('admin') OR public.has_role('secretary'))
  WITH CHECK (public.has_role('admin') OR public.has_role('secretary'));

-- admin, treasurer, or auditor: financial tables
DROP POLICY IF EXISTS "contributions_write_staff" ON public.contributions;
CREATE POLICY "contributions_write_staff" ON contributions FOR ALL TO authenticated
  USING (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'))
  WITH CHECK (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'));
DROP POLICY IF EXISTS "payments_write_staff" ON public.payments;
CREATE POLICY "payments_write_staff" ON payments FOR ALL TO authenticated
  USING (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'))
  WITH CHECK (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'));
DROP POLICY IF EXISTS "transactions_write_staff" ON public.transactions;
CREATE POLICY "transactions_write_staff" ON transactions FOR ALL TO authenticated
  USING (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'))
  WITH CHECK (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'));

-- feedback: anyone may submit; staff may read; admin updates/deletes
DROP POLICY IF EXISTS "feedback_submit_public" ON public.feedback;
CREATE POLICY "feedback_submit_public" ON feedback FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "feedback_read_staff" ON public.feedback;
CREATE POLICY "feedback_read_staff" ON feedback FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "feedback_update_admin" ON public.feedback;
CREATE POLICY "feedback_update_admin" ON feedback FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
DROP POLICY IF EXISTS "feedback_delete_admin" ON public.feedback;
CREATE POLICY "feedback_delete_admin" ON feedback FOR DELETE TO authenticated USING (public.has_role('admin'));

-- Make sure the roles that the API keys map to can reach the tables.
-- Grants alone do not bypass RLS — policies are the source of truth.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'publishable') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO publishable';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5. Supabase Realtime for live UI synchronization
-- ---------------------------------------------------------------------
-- The React sections always re-query the source tables on a change event; this
-- publication merely delivers those events and never stores duplicate totals.
-- The guards make the block safe to re-run in an existing Supabase project.
DO $$
DECLARE
  source_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH source_table IN ARRAY ARRAY[
      'students', 'events', 'board_members', 'attendance',
      'contributions', 'payments', 'transactions', 'feedback'
    ]
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = source_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', source_table);
      END IF;
    END LOOP;
  END IF;
END $$;

-- Production setup intentionally contains no demo rows.

-- =====================================================================
-- DONE. The React app will now read/write these tables.
-- =====================================================================