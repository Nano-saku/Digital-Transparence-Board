-- ============================================================
-- ATTENDANCE WRITE FIX
-- ============================================================
-- Run this once in Supabase Dashboard -> SQL Editor when attendance writes
-- fail with SQLSTATE 42501 (row-level security policy violation).
--
-- This does not make attendance public. Only authenticated users whose
-- public.user_roles role is admin or secretary can insert, update, or delete.
-- It is safe to run more than once.

BEGIN;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS session TEXT NOT NULL DEFAULT 'morning';
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS time_in TEXT NOT NULL DEFAULT '';
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS time_out TEXT NOT NULL DEFAULT '';

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Keep one row for each student/event/session. Prefer a real attendance result
-- over an automatically-created absent placeholder when old duplicates exist.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY student_id, event_id, session
      ORDER BY (status = 'absent') ASC, id DESC
    ) AS row_number
  FROM public.attendance
)
DELETE FROM public.attendance a
USING ranked r
WHERE a.id = r.id
  AND r.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_student_event_session_unique
  ON public.attendance (student_id, event_id, session);

DROP POLICY IF EXISTS "public_all" ON public.attendance;
DROP POLICY IF EXISTS "attendance_write_staff" ON public.attendance;
CREATE POLICY "attendance_write_staff" ON public.attendance
  FOR ALL TO authenticated
  USING (public.has_role('admin') OR public.has_role('secretary'))
  WITH CHECK (public.has_role('admin') OR public.has_role('secretary'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;

-- Re-sync the standard officer accounts. Authentication users themselves are
-- never created or modified by this script.
DO $$
DECLARE
  officer_email text;
  officer_role text;
  officer_name text;
  uid uuid;
BEGIN
  FOR officer_email, officer_role, officer_name IN VALUES
    ('admin@studentboard.ph', 'admin', 'Student Council Admin'),
    ('secretary@studentboard.ph', 'secretary', 'Council Secretary')
  LOOP
    SELECT id INTO uid FROM auth.users WHERE email = officer_email;
    IF uid IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role, name)
      VALUES (uid, officer_role, officer_name)
      ON CONFLICT (user_id) DO UPDATE
        SET role = EXCLUDED.role,
            name = EXCLUDED.name;
    END IF;
  END LOOP;
END $$;

COMMIT;