-- ============================================================
-- ATTENDANCE AUTHORIZATION FIX + AUTOMATIC ABSENT RPC
-- ============================================================
-- Run once in Supabase Dashboard -> SQL Editor. Safe to run more than once.
--
-- Fixes "Failed to auto-mark absent students - not authorized" (SQLSTATE
-- 42501) for officer accounts. Before this script, the Automatic Absent RPC
-- did not exist (PostgREST PGRST202), so the app wrote directly to
-- public.attendance under RLS; any request that reached PostgREST without a
-- live officer JWT ran as `anon` and was rejected. This script:
--   * attendance stays protected by RLS; only authenticated users whose
--     public.user_roles role is 'admin' or 'secretary' may write;
--   * installs public.mark_absent_if_missing(p_event_id, p_session), a
--     role-checked RPC that inserts "absent" rows ONLY for students who have
--     no attendance row for the event's date (Present/Late/Absent rows are
--     never modified).
--
-- This script never deletes attendance rows, never creates or modifies
-- auth.users accounts, and does not touch foreign keys.

BEGIN;

-- ------------------------------------------------------------
-- 1. Role helper (identical to security.sql). Reads public.user_roles by
--    auth.uid(), never JWT claims, so role changes apply on the next request.
-- ------------------------------------------------------------
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

-- RLS policies call has_role as the requesting role; without EXECUTE the
-- policy check itself fails with 42501.
GRANT EXECUTE ON FUNCTION public.has_role(text) TO anon, authenticated;

-- ------------------------------------------------------------
-- 2. Attendance RLS: public read (unchanged), officer-only write.
-- ------------------------------------------------------------
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_all" ON public.attendance;

-- Keep the public attendance board readable even on databases where the
-- only read access came from the legacy "public_all" policy dropped above.
DROP POLICY IF EXISTS "attendance_read_public" ON public.attendance;
CREATE POLICY "attendance_read_public" ON public.attendance
  FOR SELECT TO public USING (true);
GRANT SELECT ON public.attendance TO anon;

DROP POLICY IF EXISTS "attendance_write_staff" ON public.attendance;
CREATE POLICY "attendance_write_staff" ON public.attendance
  FOR ALL TO authenticated
  USING (public.has_role('admin') OR public.has_role('secretary'))
  WITH CHECK (public.has_role('admin') OR public.has_role('secretary'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;

-- ------------------------------------------------------------
-- 3. One row per student + event + date (attendance_student_event_date_key).
--    Only created when missing AND no duplicates exist; never deletes rows.
-- ------------------------------------------------------------
--    The name may already exist as a UNIQUE INDEX (created outside a
--    constraint), which pg_constraint does not list. Check pg_class too, so
--    an existing index/constraint of that name is reused, never recreated.
DO $$
DECLARE
  v_existing_def text;
BEGIN
  IF to_regclass('public.attendance_student_event_date_key') IS NOT NULL THEN
    SELECT pg_get_indexdef('public.attendance_student_event_date_key'::regclass)
      INTO v_existing_def;
    RAISE NOTICE 'attendance_student_event_date_key already exists, kept as is: %',
      v_existing_def;
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_student_event_date_key'
      AND conrelid = 'public.attendance'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.attendance
      GROUP BY student_id, event_id, date
      HAVING count(*) > 1
    ) THEN
      RAISE NOTICE 'attendance_student_event_date_key not created: duplicate student/event/date rows exist.';
    ELSE
      ALTER TABLE public.attendance
        ADD CONSTRAINT attendance_student_event_date_key
        UNIQUE (student_id, event_id, date);
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. Automatic Absent RPC
-- ------------------------------------------------------------
-- SECURITY DEFINER so the bulk insert is one statement, but it authorizes
-- the caller itself with the same rule as attendance_write_staff. RLS on
-- public.attendance is unchanged for every other write path.
DROP FUNCTION IF EXISTS public.mark_absent_if_missing(text, text);

CREATE FUNCTION public.mark_absent_if_missing(
  p_event_id text,
  p_session  text DEFAULT 'morning'
)
RETURNS SETOF public.attendance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event    public.events%ROWTYPE;
  v_inserted integer := 0;
  v_actor    public.user_roles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in: Automatic Absent requires an officer session.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role('admin') OR public.has_role('secretary')) THEN
    RAISE EXCEPTION 'Only admin or secretary accounts can record attendance.'
      USING ERRCODE = '42501';
  END IF;

  IF p_session IS NULL OR p_session NOT IN ('morning', 'afternoon', 'evening') THEN
    RAISE EXCEPTION 'Invalid attendance session: %', p_session
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event % does not exist.', p_event_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Non-conducting events never take attendance.
  IF COALESCE((to_jsonb(v_event) ->> 'is_non_conducting')::boolean, false) THEN
    RETURN;
  END IF;

  -- Only after the event's calendar day has ended in Asia/Manila (same rule
  -- as hasEventAttendanceDayEnded in src/lib/attendance.ts). The ::date cast
  -- only runs on a validated YYYY-MM-DD value.
  IF v_event.date IS NULL OR v_event.date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN;
  END IF;
  IF (now() AT TIME ZONE 'Asia/Manila')::date <= v_event.date::date THEN
    RETURN;
  END IF;

  -- Serialize concurrent runs (several open tabs/devices) per event.
  PERFORM pg_advisory_xact_lock(hashtext('attendance-auto-absent:' || p_event_id));

  -- NOT EXISTS skips students with ANY row for the date (Present, Late,
  -- Absent, any session). ON CONFLICT DO NOTHING keeps it idempotent if a
  -- scan lands between the check and the insert: the scanned row wins.
  RETURN QUERY
    WITH inserted AS (
      INSERT INTO public.attendance
        (id, student_id, event_id, event_name, date, status, session, time_in, time_out)
      SELECT
        gen_random_uuid()::text, s.id, v_event.id, v_event.name, v_event.date,
        'absent', p_session, '', ''
      FROM public.students s
      WHERE NOT EXISTS (
        SELECT 1 FROM public.attendance x
        WHERE x.student_id = s.id
          AND x.event_id = v_event.id
          AND x.date = v_event.date
      )
      ON CONFLICT DO NOTHING
      RETURNING *
    )
    SELECT * FROM inserted;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 AND to_regclass('public.audit_logs') IS NOT NULL THEN
    SELECT * INTO v_actor FROM public.user_roles WHERE user_id = auth.uid();
    INSERT INTO public.audit_logs
      (id, actor_user_id, actor_name, actor_role, action, entity_type,
       entity_id, description, metadata)
    VALUES (
      gen_random_uuid()::text,
      auth.uid(),
      COALESCE(NULLIF(v_actor.name, ''), 'Officer'),
      COALESCE(v_actor.role, 'unknown'),
      'ATTENDANCE_AUTO_ABSENT',
      'attendance',
      v_event.id,
      format('Automatically marked %s student(s) absent for %s.', v_inserted, v_event.name),
      jsonb_build_object('eventId', v_event.id, 'date', v_event.date, 'count', v_inserted)
    );
  END IF;
END;
$$;

-- Supabase's default privileges grant EXECUTE on new functions to anon;
-- this RPC is for signed-in officers only.
REVOKE ALL ON FUNCTION public.mark_absent_if_missing(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_absent_if_missing(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_absent_if_missing(text, text) TO authenticated;

-- ------------------------------------------------------------
-- 5. Attendance officer roles
-- ------------------------------------------------------------
-- Adds the missing public.user_roles row for the standard attendance
-- officer accounts only when the auth user exists and has no role yet.
-- Existing roles and auth.users accounts are never modified.
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
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Make the RPC visible to the Supabase REST API immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ------------------------------------------------------------
-- Verification (optional; run after the script)
-- ------------------------------------------------------------
-- Officers allowed to write attendance:
--   SELECT u.email, r.role FROM public.user_roles r
--   JOIN auth.users u ON u.id = r.user_id
--   WHERE r.role IN ('admin', 'secretary');
-- RPC installed and callable by signed-in users:
--   SELECT has_function_privilege('authenticated',
--     'public.mark_absent_if_missing(text, text)', 'EXECUTE');

