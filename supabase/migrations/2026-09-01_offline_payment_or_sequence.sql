-- =====================================================================
-- Digital Transparency Board - Offline payment / OR sequence hardening
-- =====================================================================
-- Purpose:
--   1. Keep Official Receipt (OR) numbering authoritative in PostgreSQL.
--   2. Make offline-created payments receive a real OR when they sync.
--   3. Never recycle an OR number after a payment is deleted.
--   4. Protect against stale/client-generated OR numbers and concurrent devices.
--   5. Add the contribution_id column expected by the React payment service.
--
-- Safe to re-run.
-- =====================================================================

-- The current React service already sends contribution_id, so upgrade existing
-- databases that were created from an older schema.sql.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS contribution_id TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_contribution_id
  ON public.payments (contribution_id);

-- ---------------------------------------------------------------------
-- Official Receipt sequence
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.or_sequence (
  year      INTEGER PRIMARY KEY CHECK (year >= 2000),
  last_used INTEGER NOT NULL DEFAULT 0 CHECK (last_used >= 0)
);

-- Keep the sequence at least as high as OR numbers that already exist.
-- This is important when upgrading an existing production database.
INSERT INTO public.or_sequence (year, last_used)
SELECT
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  COALESCE(MAX(SUBSTRING(or_number FROM '(\\d{6})$')::INTEGER), 0)
FROM public.payments
WHERE or_number ~ ('^OR-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-\\d{6}$')
ON CONFLICT (year) DO UPDATE
SET last_used = GREATEST(public.or_sequence.last_used, EXCLUDED.last_used);

CREATE OR REPLACE FUNCTION public.get_next_or_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_yr INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  next_seq INTEGER;
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

-- ---------------------------------------------------------------------
-- Authoritative OR assignment trigger
-- ---------------------------------------------------------------------
-- The app may still send an OR number for backwards compatibility. The
-- database accepts it only when it is the next unused number. If it is stale,
-- duplicated, or missing, PostgreSQL assigns the next number atomically.
-- This makes offline replay safe without requiring the browser to reserve an
-- official number while disconnected.
CREATE OR REPLACE FUNCTION public.assign_payment_or_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_yr INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  supplied_year INTEGER;
  supplied_seq INTEGER;
  current_seq INTEGER;
  candidate TEXT;
BEGIN
  -- No OR supplied: always reserve one from the authoritative sequence.
  IF NEW.or_number IS NULL OR btrim(NEW.or_number) = '' THEN
    NEW.or_number := public.get_next_or_number();
    RETURN NEW;
  END IF;

  -- A legacy/client-generated OR is accepted only if it is a valid number for
  -- the current year and is ahead of the current sequence. Otherwise replace
  -- it with the next server-generated number. This handles offline clients
  -- that reconnect with an old local OR such as OR-2026-000001.
  IF NEW.or_number ~ '^OR-[0-9]{4}-[0-9]{6}$' THEN
    supplied_year := SUBSTRING(NEW.or_number FROM '^OR-(\\d{4})-')::INTEGER;
    supplied_seq := SUBSTRING(NEW.or_number FROM '(\\d{6})$')::INTEGER;
  ELSE
    NEW.or_number := public.get_next_or_number();
    RETURN NEW;
  END IF;

  IF supplied_year <> current_yr THEN
    NEW.or_number := public.get_next_or_number();
    RETURN NEW;
  END IF;

  INSERT INTO public.or_sequence (year, last_used)
  VALUES (current_yr, 0)
  ON CONFLICT (year) DO NOTHING;

  SELECT last_used INTO current_seq
  FROM public.or_sequence
  WHERE year = current_yr
  FOR UPDATE;

  -- If the supplied number is exactly the next number, reserve it by moving
  -- the sequence forward. If it is behind/already used, allocate a new one.
  IF supplied_seq = current_seq + 1 THEN
    UPDATE public.or_sequence
       SET last_used = supplied_seq
     WHERE year = current_yr;
    RETURN NEW;
  END IF;

  IF supplied_seq <= current_seq THEN
    UPDATE public.or_sequence
       SET last_used = last_used + 1
     WHERE year = current_yr
     RETURNING last_used INTO supplied_seq;

    NEW.or_number := 'OR-' || current_yr::TEXT || '-' || LPAD(supplied_seq::TEXT, 6, '0');
    RETURN NEW;
  END IF;

  -- Do not allow a client to jump the sequence arbitrarily. Reserve the next
  -- number instead, keeping numbering continuous.
  UPDATE public.or_sequence
     SET last_used = last_used + 1
   WHERE year = current_yr
   RETURNING last_used INTO current_seq;

  NEW.or_number := 'OR-' || current_yr::TEXT || '-' || LPAD(current_seq::TEXT, 6, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_assign_or_number ON public.payments;
CREATE TRIGGER payments_assign_or_number
BEFORE INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.assign_payment_or_number();

-- Prevent two payment rows from ever carrying the same official OR.
-- NULL remains allowed for old rows that predate OR numbering.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_or_number_unique
  ON public.payments (or_number)
  WHERE or_number IS NOT NULL AND btrim(or_number) <> '';

-- ---------------------------------------------------------------------
-- Contribution/payment relationship
-- ---------------------------------------------------------------------
-- Existing rows can remain without a contribution_id. New app-created
-- payments should carry it, and contribution deletion should only remove the
-- payments actually belonging to that contribution.

-- Optional FK is intentionally omitted: the application supports historical
-- payment rows and legacy imports whose contribution may no longer exist.

-- ---------------------------------------------------------------------
-- IMPORTANT: OR sequence is intentionally NOT decremented on DELETE.
-- Deleting a payment removes the payment record, but its OR number remains
-- consumed forever. This prevents duplicate official receipt numbers.
-- =====================================================================
