-- =====================================================================
-- Fix Event Management Creation Error and Support Independent
-- Contribution Settings for Multi-Day Events
-- =====================================================================
--
-- ROOT CAUSE:
--   The guard_exempt_contribution_write() BEFORE INSERT trigger on
--   contributions fires for every INSERT — including those generated
--   internally by create_event_contributions() (an AFTER INSERT trigger
--   on events). When an event is created, create_event_contributions()
--   attempts to INSERT contribution rows for eligible students. Each of
--   those INSERTs fires guard_exempt_contribution_write(), which calls
--   is_contribution_eligible(). Because is_contribution_eligible() is
--   declared STABLE, its snapshot of the events table may not reliably
--   include the newly-inserted event row within the same transaction,
--   causing it to return false and raise the exception:
--
--     "This student is not eligible for a contribution allocation
--      for this event."
--
--   This blocks the entire event creation transaction.
--
-- FIXES APPLIED:
--   1. is_contribution_eligible() changed to VOLATILE so it always
--      reads the current transaction state.
--   2. guard_exempt_contribution_write() updated to skip eligibility
--      validation when pg_trigger_depth() > 1 (called from within
--      another trigger). Internal allocation functions already filter
--      ineligible students in their WHERE clauses.
--   3. create_event_contributions() re-affirmed with correct filtering.
--   4. create_student_contributions() re-affirmed with correct filtering.
--   5. sync_event_contributions() re-affirmed for independent per-event
--      contribution settings.
--   6. sync_lsc_officer_contributions() re-affirmed to preserve exemptions.
--   7. get_event_collection_performance() re-affirmed to exclude events
--      where is_no_contribution = true.
--
-- SAFETY:
--   * No historical payment or contribution records are deleted.
--   * Paid/partial rows are never altered.
--   * LSC officer exemptions remain fully enforced for client-side INSERTs.
--   * ON CONFLICT DO NOTHING prevents duplicate allocations on retry.
--   * Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Make is_contribution_eligible() VOLATILE so trigger-nested calls
--    always read the current transaction state (including the just-
--    inserted event row that create_event_contributions() responds to).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_contribution_eligible(
  p_student_id TEXT,
  p_event_id   TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.events e ON e.id = p_event_id
    WHERE s.id = p_student_id
      AND GREATEST(COALESCE(e.allocation_amount, 0), 0) > 0
      AND COALESCE(e.is_no_contribution, false) = false
      AND NOT public.is_lsc_officer(s.id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_contribution_eligible(TEXT, TEXT)
  TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Fix guard_exempt_contribution_write() to skip validation when
--    called from within another trigger (pg_trigger_depth() > 1).
--    Internal allocation triggers already enforce eligibility in their
--    WHERE clauses. The guard exists only to block direct client-side
--    writes for ineligible students.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_exempt_contribution_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip when called from inside another trigger (depth > 1).
  -- Internal functions (create_event_contributions, etc.) already
  -- filter ineligible students in their WHERE clauses.
  -- Raising here would abort the entire event-insert transaction.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- For direct client-side INSERTs, enforce eligibility:
  -- block exempt officers and events with no contribution requirement.
  IF TG_OP = 'INSERT'
     AND NOT public.is_contribution_eligible(NEW.student_id, NEW.event_id) THEN
    RAISE EXCEPTION
      'This student is not eligible for a contribution allocation for this event.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_exempt_contribution_write ON public.contributions;
CREATE TRIGGER trg_guard_exempt_contribution_write
BEFORE INSERT OR UPDATE OF student_id, event_id, required_amount, amount_paid, remaining_balance
ON public.contributions FOR EACH ROW
EXECUTE FUNCTION public.guard_exempt_contribution_write();

-- ---------------------------------------------------------------------
-- 3. Re-affirm create_event_contributions() with correct eligibility
--    filtering. Each event independently controls its own contribution
--    requirement via is_no_contribution and allocation_amount.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_event_contributions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create allocations when this event requires contributions:
  --   * allocation_amount must be > 0
  --   * is_no_contribution must be false (or NULL)
  -- Exclude active LSC officers. ON CONFLICT DO NOTHING on retry.
  INSERT INTO public.contributions (
    id, student_id, event_id, event_name,
    required_amount, amount_paid, remaining_balance
  )
  SELECT
    gen_random_uuid()::text,
    s.id,
    NEW.id,
    NEW.name,
    NEW.allocation_amount,
    0,
    NEW.allocation_amount
  FROM public.students s
  WHERE NEW.allocation_amount > 0
    AND COALESCE(NEW.is_no_contribution, false) = false
    AND NOT public.is_lsc_officer(s.id)
  ON CONFLICT (student_id, event_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_event_contributions ON public.events;
CREATE TRIGGER trg_create_event_contributions
AFTER INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.create_event_contributions();

-- ---------------------------------------------------------------------
-- 4. Re-affirm create_student_contributions() — only allocate for
--    events that have contribution requirements enabled.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_student_contributions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.contributions (
    id, student_id, event_id, event_name,
    required_amount, amount_paid, remaining_balance
  )
  SELECT
    gen_random_uuid()::text,
    NEW.id,
    e.id,
    e.name,
    e.allocation_amount,
    0,
    e.allocation_amount
  FROM public.events e
  WHERE e.allocation_amount > 0
    AND COALESCE(e.is_no_contribution, false) = false
    AND NOT public.is_lsc_officer(NEW.id)
  ON CONFLICT (student_id, event_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_student_contributions ON public.students;
CREATE TRIGGER trg_create_student_contributions
AFTER INSERT ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.create_student_contributions();

-- ---------------------------------------------------------------------
-- 5. Re-affirm sync_event_contributions() to correctly handle
--    is_no_contribution changes independently per event.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_event_contributions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.contributions
    SET event_name = NEW.name
    WHERE event_id = NEW.id;
  END IF;

  IF NEW.allocation_amount IS DISTINCT FROM OLD.allocation_amount
     OR NEW.is_no_contribution IS DISTINCT FROM OLD.is_no_contribution THEN

    -- Remove unpaid allocations when contributions are now disabled.
    DELETE FROM public.contributions c
    WHERE c.event_id = NEW.id
      AND c.amount_paid = 0
      AND (
        GREATEST(COALESCE(NEW.allocation_amount, 0), 0) = 0
        OR COALESCE(NEW.is_no_contribution, false) = true
      );

    -- Remove unpaid allocations for newly-exempt LSC officers.
    DELETE FROM public.contributions c
    WHERE c.event_id = NEW.id
      AND c.amount_paid = 0
      AND public.is_lsc_officer(c.student_id);

    -- Create missing allocations when contributions are now enabled.
    INSERT INTO public.contributions (
      id, student_id, event_id, event_name,
      required_amount, amount_paid, remaining_balance
    )
    SELECT
      gen_random_uuid()::text,
      s.id,
      NEW.id,
      NEW.name,
      NEW.allocation_amount,
      0,
      NEW.allocation_amount
    FROM public.students s
    WHERE NEW.allocation_amount > 0
      AND COALESCE(NEW.is_no_contribution, false) = false
      AND NOT public.is_lsc_officer(s.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.contributions c
        WHERE c.student_id = s.id AND c.event_id = NEW.id
      )
    ON CONFLICT (student_id, event_id) DO NOTHING;

    -- Update required amounts for unpaid rows that remain.
    UPDATE public.contributions
    SET
      required_amount   = GREATEST(COALESCE(NEW.allocation_amount, 0), 0),
      remaining_balance = GREATEST(COALESCE(NEW.allocation_amount, 0), 0)
    WHERE event_id    = NEW.id
      AND amount_paid = 0
      AND GREATEST(COALESCE(NEW.allocation_amount, 0), 0) > 0
      AND COALESCE(NEW.is_no_contribution, false) = false;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_event_contributions ON public.events;
CREATE TRIGGER trg_sync_event_contributions
AFTER UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.sync_event_contributions();

-- ---------------------------------------------------------------------
-- 6. Re-affirm sync_lsc_officer_contributions() — reconcile when an
--    officer appointment is added or removed. Preserves paid rows.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_lsc_officer_contributions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_student_id := OLD.student_db_id;
    IF v_student_id IS NULL THEN
      SELECT s.id INTO v_student_id FROM public.students s
      WHERE lower(btrim(s.student_id)) = lower(btrim(OLD.student_id)) LIMIT 1;
    END IF;
  ELSE
    v_student_id := NEW.student_db_id;
    IF v_student_id IS NULL THEN
      SELECT s.id INTO v_student_id FROM public.students s
      WHERE lower(btrim(s.student_id)) = lower(btrim(NEW.student_id)) LIMIT 1;
    END IF;
  END IF;

  IF v_student_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    DELETE FROM public.contributions c
    WHERE c.student_id = v_student_id AND c.amount_paid = 0;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.contributions (
      id, student_id, event_id, event_name,
      required_amount, amount_paid, remaining_balance
    )
    SELECT
      gen_random_uuid()::text, v_student_id, e.id, e.name,
      e.allocation_amount, 0, e.allocation_amount
    FROM public.events e
    WHERE e.allocation_amount > 0
      AND COALESCE(e.is_no_contribution, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.contributions c
        WHERE c.student_id = v_student_id AND c.event_id = e.id
      )
    ON CONFLICT (student_id, event_id) DO NOTHING;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lsc_officer_contributions ON public.lsc_officers;
CREATE TRIGGER trg_sync_lsc_officer_contributions
AFTER INSERT OR UPDATE OR DELETE ON public.lsc_officers
FOR EACH ROW
EXECUTE FUNCTION public.sync_lsc_officer_contributions();

-- ---------------------------------------------------------------------
-- 7. Re-affirm get_event_collection_performance() to correctly exclude
--    events where is_no_contribution = true from expected collection.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_event_collection_performance()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH eligible_counts AS (
  SELECT e.id AS event_id, COUNT(s.id)::BIGINT AS eligible_count
  FROM public.events e
  CROSS JOIN public.students s
  WHERE GREATEST(COALESCE(e.allocation_amount, 0), 0) > 0
    AND COALESCE(e.is_no_contribution, false) = false
    AND NOT public.is_lsc_officer(s.id)
  GROUP BY e.id
),
collected_per_event AS (
  SELECT c.event_id,
    SUM(GREATEST(COALESCE(c.amount_paid, 0), 0))::BIGINT AS total_collected
  FROM public.contributions c
  GROUP BY c.event_id
)
SELECT jsonb_agg(
  jsonb_build_object(
    'eventId',              e.id,
    'eventName',            e.name,
    'isNoContribution',     COALESCE(e.is_no_contribution, false),
    'allocationAmount',     GREATEST(COALESCE(e.allocation_amount, 0), 0),
    'eligibleCount',        COALESCE(ec.eligible_count, 0),
    'expectedCollection',
      COALESCE(ec.eligible_count, 0) *
      GREATEST(COALESCE(e.allocation_amount, 0), 0),
    'actualCollection',     COALESCE(cp.total_collected, 0),
    'outstandingBalance',
      GREATEST(
        COALESCE(ec.eligible_count, 0) *
        GREATEST(COALESCE(e.allocation_amount, 0), 0)
        - COALESCE(cp.total_collected, 0), 0),
    'collectionPerformance',
      CASE
        WHEN COALESCE(ec.eligible_count, 0) *
             GREATEST(COALESCE(e.allocation_amount, 0), 0) > 0
        THEN ROUND(
          (COALESCE(cp.total_collected, 0)::NUMERIC /
           (COALESCE(ec.eligible_count, 0) *
            GREATEST(COALESCE(e.allocation_amount, 0), 0))::NUMERIC) * 100, 2)
        ELSE 0
      END
  ) ORDER BY e.name
)
FROM public.events e
LEFT JOIN eligible_counts      ec ON ec.event_id = e.id
LEFT JOIN collected_per_event  cp ON cp.event_id = e.id
WHERE GREATEST(COALESCE(e.allocation_amount, 0), 0) > 0
  AND COALESCE(e.is_no_contribution, false) = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_collection_performance()
  TO anon, authenticated;

COMMENT ON FUNCTION public.get_event_collection_performance() IS
  'Returns per-event expected/actual collection excluding LSC officers and
   is_no_contribution events. Each event has an independent contribution setting.';

-- ---------------------------------------------------------------------
-- 8. Deployment-time assertions
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname  = 'trg_guard_exempt_contribution_write'
      AND tgrelid = 'public.contributions'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_guard_exempt_contribution_write not found on contributions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname  = 'trg_create_event_contributions'
      AND tgrelid = 'public.events'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_create_event_contributions not found on events';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname  = 'trg_sync_lsc_officer_contributions'
      AND tgrelid = 'public.lsc_officers'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_sync_lsc_officer_contributions not found on lsc_officers';
  END IF;

  RAISE NOTICE 'All contribution guard triggers verified successfully.';
END
$$;

NOTIFY pgrst, 'reload schema';

