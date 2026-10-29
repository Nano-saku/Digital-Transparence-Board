-- Migration: 2026-10-31_event_volunteers_expires_at
--
-- Ensures the expires_at column on public.event_volunteers has a sensible default
-- so that inserts without explicit expiration timestamps succeed cleanly.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_volunteers'
      AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.event_volunteers
      ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days');
  ELSE
    ALTER TABLE public.event_volunteers
      ALTER COLUMN expires_at SET DEFAULT (now() + interval '90 days');
  END IF;
END $$;

COMMENT ON COLUMN public.event_volunteers.expires_at IS
  'Timestamp when the volunteer assignment expires, typically after the event calendar day ends.';
