-- Migration: 2026-10-19_add_auto_mark_absent_to_events
--
-- Automatic Absent is opt-in per event. Existing and newly-created events
-- remain unchanged unless an authorized event manager enables this setting.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS auto_mark_absent BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.auto_mark_absent IS
  'When true, students without an attendance row may be marked absent after the event calendar day ends.';