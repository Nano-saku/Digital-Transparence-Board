-- Migration: 2026-11-01_attendance_statuses
--
-- Attendance now accepts Present, Absent, and Excused only for new or updated
-- rows. Existing legacy `late` rows are preserved for historical integrity and
-- are normalized to Present by the application read model.

CREATE OR REPLACE FUNCTION public.validate_attendance_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status NOT IN ('present', 'absent', 'excuse') THEN
    RAISE EXCEPTION
      'Invalid attendance status: %. Use present, absent, or excuse.', NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_attendance_status ON public.attendance;
CREATE TRIGGER trg_validate_attendance_status
  BEFORE INSERT OR UPDATE OF status ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_attendance_status();

GRANT EXECUTE ON FUNCTION public.validate_attendance_status() TO authenticated;

NOTIFY pgrst, 'reload schema';
