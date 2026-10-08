-- Migration: 2026-10-08_add_is_no_contribution_to_events
--
-- Adds the `is_no_contribution` boolean flag to the events table.
-- When true, the event has no student contribution requirement and
-- is excluded from the Event Collection Performance widget on the
-- Admin Dashboard.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_no_contribution BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.is_no_contribution IS
  'When true, this event requires no student contribution and is excluded from Event Collection Performance reporting.';
