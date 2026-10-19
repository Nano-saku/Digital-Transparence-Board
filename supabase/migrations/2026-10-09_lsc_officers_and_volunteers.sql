-- =====================================================================
-- Digital Transparency Board - LSC Officers and Event Volunteers
-- =====================================================================
-- Purpose:
--   1. Strict manual management of LSC Officers and official positions/roles.
--      Zero automatic assignments or inferences.
--   2. Multi-role assignment support (e.g. Creative Director / Board Member).
--   3. Event Volunteers assignment and tracking.
--
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Create the lsc_officers table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lsc_officers (
  id            TEXT PRIMARY KEY,
  student_id    TEXT NOT NULL,
  student_db_id TEXT REFERENCES public.students(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  program       TEXT NOT NULL DEFAULT '',
  year_level    INTEGER NOT NULL DEFAULT 1,
  section       TEXT NOT NULL DEFAULT '',
  positions     TEXT[] NOT NULL DEFAULT '{}',
  preview_file_reference TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lsc_officers DROP COLUMN IF EXISTS image_url;

CREATE INDEX IF NOT EXISTS idx_lsc_officers_student_id
  ON public.lsc_officers (student_id);

CREATE INDEX IF NOT EXISTS idx_lsc_officers_name
  ON public.lsc_officers (name);

-- ---------------------------------------------------------------------
-- 2. Create the event_volunteers table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_volunteers (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_name    TEXT NOT NULL DEFAULT '',
  student_id    TEXT NOT NULL,
  student_name  TEXT NOT NULL,
  program       TEXT NOT NULL DEFAULT '',
  year_level    INTEGER NOT NULL DEFAULT 0,
  section       TEXT NOT NULL DEFAULT '',
  role_or_task  TEXT NOT NULL DEFAULT 'Volunteer',
  status        TEXT NOT NULL DEFAULT 'assigned',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_volunteers_event_id
  ON public.event_volunteers (event_id);

CREATE INDEX IF NOT EXISTS idx_event_volunteers_student_id
  ON public.event_volunteers (student_id);

-- ---------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------
ALTER TABLE public.lsc_officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_volunteers ENABLE ROW LEVEL SECURITY;

-- Read policies: public can read LSC Officers and Event Volunteers
DROP POLICY IF EXISTS "lsc_officers_read_public" ON public.lsc_officers;
CREATE POLICY "lsc_officers_read_public"
  ON public.lsc_officers
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "event_volunteers_read_public" ON public.event_volunteers;
CREATE POLICY "event_volunteers_read_public"
  ON public.event_volunteers
  FOR SELECT TO public
  USING (true);

-- Write policies: admin only
DROP POLICY IF EXISTS "lsc_officers_write_admin" ON public.lsc_officers;
CREATE POLICY "lsc_officers_write_admin"
  ON public.lsc_officers
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS "event_volunteers_write_admin" ON public.event_volunteers;
CREATE POLICY "event_volunteers_write_admin"
  ON public.event_volunteers
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

GRANT SELECT ON public.lsc_officers TO anon;
GRANT ALL ON public.lsc_officers TO authenticated;

GRANT SELECT ON public.event_volunteers TO anon;
GRANT ALL ON public.event_volunteers TO authenticated;
