-- Migration: 2026-10-30_add_schedules_to_events
--
-- Adds the optional JSONB schedules column to public.events if it does not
-- already exist. Backward compatible with existing events.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'schedules'
  ) THEN
    ALTER TABLE public.events
      ADD COLUMN schedules JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN public.events.schedules IS
  'Array of event schedule periods and attendance time windows.';
