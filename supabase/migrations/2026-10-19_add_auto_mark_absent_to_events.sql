-- Migration: 2026-10-19_add_auto_mark_absent_to_events
--
-- Automatic Absent is opt-in per event. Existing and newly-created events
-- remain unchanged unless an authorized event manager enables this setting.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS auto_mark_absent BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.auto_mark_absent IS
  'When true, students without an attendance row may be marked absent after the event calendar day ends.';

-- Automatic Absent is idempotent only when the natural attendance key is
-- enforced by the database. Do not silently delete or choose between existing
-- duplicate rows: stop and report them so an administrator can reconcile the
-- data before deploying the RPC.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.attendance
    GROUP BY student_id, event_id, date
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create attendance_student_event_date_key: duplicate student/event/date rows exist.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_student_event_date_key'
      AND conrelid = 'public.attendance'::regclass
  ) AND to_regclass('public.attendance_student_event_date_key') IS NULL THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_student_event_date_key
      UNIQUE (student_id, event_id, date);
  END IF;
END $$;