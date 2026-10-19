-- =====================================================================
-- Digital Transparency Board - Exclude appointed LSC officers from
-- required contribution allocations
-- =====================================================================
-- An LSC officer appointment is authoritative while its row exists in
-- public.lsc_officers.  This migration deliberately does not add a status
-- column to students.
--
-- Historical safety rules:
--   * newly generated allocations exclude current officers;
--   * an officer's unpaid allocation may be removed during reconciliation;
--   * rows with amount_paid > 0 are never deleted or rewritten by this
--     migration's reconciliation paths;
--   * removing an appointment restores an unpaid allocation for that student.
--
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Officer/eligibility helpers
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_lsc_officer(p_student_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lsc_officers o
    JOIN public.students s
      ON s.id = p_student_id
    WHERE (
      o.student_db_id = s.id
      OR lower(btrim(o.student_id)) = lower(btrim(s.student_id))
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_contribution_eligible(
  p_student_id TEXT,
  p_event_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
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

GRANT EXECUTE ON FUNCTION public.is_lsc_officer(TEXT)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_contribution_eligible(TEXT, TEXT)
  TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Generation and event-recalculation functions
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_event_contributions()
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

DROP TRIGGER IF EXISTS trg_create_event_contributions ON public.events;
CREATE TRIGGER trg_create_event_contributions
AFTER INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.create_event_contributions();

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
    -- Reconcile only the unpaid portion. Paid and partial rows are historical
    -- financial records and must remain intact.
    DELETE FROM public.contributions c
    WHERE c.event_id = NEW.id
      AND c.amount_paid = 0
      AND (
        GREATEST(COALESCE(NEW.allocation_amount, 0), 0) = 0
        OR COALESCE(NEW.is_no_contribution, false)
      );

    DELETE FROM public.contributions c
    WHERE c.event_id = NEW.id
      AND c.amount_paid = 0
      AND public.is_lsc_officer(c.student_id);

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
        SELECT 1
        FROM public.contributions c
        WHERE c.student_id = s.id
          AND c.event_id = NEW.id
      )
    ON CONFLICT (student_id, event_id) DO NOTHING;

    -- Keep required amounts current only for retained unpaid rows. Paid and
    -- partial rows are historical financial records and must not be rewritten
    -- when an event allocation changes.
    UPDATE public.contributions
    SET
      event_name = NEW.name,
      required_amount = NEW.allocation_amount,
      remaining_balance = GREATEST(NEW.allocation_amount - amount_paid, 0)
    WHERE event_id = NEW.id
      AND amount_paid = 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_event_contributions ON public.events;
CREATE TRIGGER trg_sync_event_contributions
AFTER UPDATE OF name, allocation_amount, is_no_contribution
ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.sync_event_contributions();

-- ---------------------------------------------------------------------
-- 3. Reconcile appointment changes
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_lsc_officer_contributions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
BEGIN
  -- When the appointment is removed or moved, restore unpaid allocations for
  -- the old student. The insert is harmless if another path already restored it.
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.contributions (
      id, student_id, event_id, event_name,
      required_amount, amount_paid, remaining_balance
    )
    SELECT
      gen_random_uuid()::text,
      s.id,
      e.id,
      e.name,
      e.allocation_amount,
      0,
      e.allocation_amount
    FROM public.students s
    CROSS JOIN public.events e
    WHERE (
        (OLD.student_db_id IS NOT NULL AND s.id = OLD.student_db_id)
        OR lower(btrim(s.student_id)) = lower(btrim(OLD.student_id))
      )
      AND e.allocation_amount > 0
      AND COALESCE(e.is_no_contribution, false) = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.lsc_officers current_officer
        WHERE current_officer.student_db_id = s.id
           OR lower(btrim(current_officer.student_id)) = lower(btrim(s.student_id))
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.contributions c
        WHERE c.student_id = s.id
          AND c.event_id = e.id
      )
    ON CONFLICT (student_id, event_id) DO NOTHING;
  ELSIF OLD.student_db_id IS DISTINCT FROM NEW.student_db_id
     OR OLD.student_id IS DISTINCT FROM NEW.student_id THEN
    INSERT INTO public.contributions (
      id, student_id, event_id, event_name,
      required_amount, amount_paid, remaining_balance
    )
    SELECT
      gen_random_uuid()::text,
      s.id,
      e.id,
      e.name,
      e.allocation_amount,
      0,
      e.allocation_amount
    FROM public.students s
    CROSS JOIN public.events e
    WHERE (
        (OLD.student_db_id IS NOT NULL AND s.id = OLD.student_db_id)
        OR lower(btrim(s.student_id)) = lower(btrim(OLD.student_id))
      )
      AND e.allocation_amount > 0
      AND COALESCE(e.is_no_contribution, false) = false
      AND NOT EXISTS (
        SELECT 1
        FROM public.lsc_officers current_officer
        WHERE current_officer.id <> NEW.id
          AND (
            current_officer.student_db_id = s.id
            OR lower(btrim(current_officer.student_id)) = lower(btrim(s.student_id))
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.contributions c
        WHERE c.student_id = s.id
          AND c.event_id = e.id
      )
    ON CONFLICT (student_id, event_id) DO NOTHING;
  END IF;

  -- An appointment update can identify the same student through a changed
  -- student number. Remove only the newly-ineligible unpaid rows.
  IF TG_OP <> 'DELETE' THEN
    DELETE FROM public.contributions c
    WHERE c.amount_paid = 0
      AND public.is_lsc_officer(c.student_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lsc_officer_contributions ON public.lsc_officers;
CREATE TRIGGER trg_sync_lsc_officer_contributions
AFTER INSERT OR UPDATE OR DELETE ON public.lsc_officers
FOR EACH ROW
EXECUTE FUNCTION public.sync_lsc_officer_contributions();

-- ---------------------------------------------------------------------
-- 4. One-time reconciliation of existing rows
-- ---------------------------------------------------------------------

DELETE FROM public.contributions c
WHERE c.amount_paid = 0
  AND (
    public.is_lsc_officer(c.student_id)
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = c.event_id
        AND (
          GREATEST(COALESCE(e.allocation_amount, 0), 0) = 0
          OR COALESCE(e.is_no_contribution, false)
        )
    )
  );

INSERT INTO public.contributions (
  id, student_id, event_id, event_name,
  required_amount, amount_paid, remaining_balance
)
SELECT
  gen_random_uuid()::text,
  s.id,
  e.id,
  e.name,
  e.allocation_amount,
  0,
  e.allocation_amount
FROM public.students s
CROSS JOIN public.events e
WHERE e.allocation_amount > 0
  AND COALESCE(e.is_no_contribution, false) = false
  AND NOT public.is_lsc_officer(s.id)
  AND NOT EXISTS (
    SELECT 1
    FROM public.contributions c
    WHERE c.student_id = s.id
      AND c.event_id = e.id
  )
ON CONFLICT (student_id, event_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. Financial report: expected totals use eligible allocations
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_financial_report()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH contribution_totals AS (
  SELECT student_id, event_id,
         SUM(GREATEST(COALESCE(amount_paid, 0), 0)) AS contribution_amount
  FROM public.contributions
  GROUP BY student_id, event_id
),
payment_totals AS (
  SELECT student_id, event_id,
         SUM(GREATEST(COALESCE(amount, 0), 0)) AS payment_amount
  FROM public.payments
  WHERE event_id IS NOT NULL
  GROUP BY student_id, event_id
),
student_event_collections AS (
  SELECT COALESCE(c.student_id, p.student_id) AS student_id,
         COALESCE(c.event_id, p.event_id) AS event_id,
         GREATEST(COALESCE(c.contribution_amount, 0), COALESCE(p.payment_amount, 0)) AS collected
  FROM contribution_totals c
  FULL OUTER JOIN payment_totals p
    ON c.student_id = p.student_id AND c.event_id = p.event_id
),
collection_by_event AS (
  SELECT event_id, SUM(collected) AS total_collected
  FROM student_event_collections
  GROUP BY event_id
),
transaction_totals AS (
  SELECT
    COALESCE(SUM(CASE WHEN type = 'income' THEN GREATEST(COALESCE(amount, 0), 0) ELSE 0 END), 0) AS ledger_income,
    COALESCE(SUM(CASE WHEN type <> 'income' THEN GREATEST(COALESCE(amount, 0), 0) ELSE 0 END), 0) AS total_spent
  FROM public.transactions
),
income_by_event AS (
  SELECT event_id, SUM(GREATEST(COALESCE(amount, 0), 0)) AS total_income
  FROM public.transactions
  WHERE type = 'income' AND event_id IS NOT NULL
  GROUP BY event_id
),
spent_by_event AS (
  SELECT event_id, SUM(GREATEST(COALESCE(amount, 0), 0)) AS total_spent
  FROM public.transactions
  WHERE type <> 'income' AND event_id IS NOT NULL
  GROUP BY event_id
),
eligible_by_event AS (
  SELECT e.id AS event_id,
         COUNT(s.id)::BIGINT AS eligible_student_count,
         (COUNT(s.id) * GREATEST(COALESCE(e.allocation_amount, 0), 0))::BIGINT AS expected_amount
  FROM public.events e
  LEFT JOIN public.students s
    ON GREATEST(COALESCE(e.allocation_amount, 0), 0) > 0
   AND COALESCE(e.is_no_contribution, false) = false
   AND NOT public.is_lsc_officer(s.id)
  GROUP BY e.id, e.allocation_amount
),
event_data AS (
  SELECT e.id AS event_id,
         e.name AS event_name,
         GREATEST(COALESCE(e.allocation_amount, 0), 0) AS allocation_amount,
         COALESCE(eb.expected_amount, 0) AS expected_amount,
         COALESCE(c.total_collected, 0) + COALESCE(i.total_income, 0) AS total_collected,
         COALESCE(s.total_spent, 0) AS total_spent
  FROM public.events e
  LEFT JOIN eligible_by_event eb ON eb.event_id = e.id
  LEFT JOIN collection_by_event c ON c.event_id = e.id
  LEFT JOIN income_by_event i ON i.event_id = e.id
  LEFT JOIN spent_by_event s ON s.event_id = e.id
),
summary AS (
  SELECT COALESCE(SUM(allocation_amount), 0) AS total_budget,
         COALESCE(SUM(total_collected), 0) AS total_funds_collected,
         COALESCE(SUM(total_spent), 0) AS event_spent,
         (SELECT ledger_income FROM transaction_totals) AS ledger_income,
         (SELECT total_spent FROM transaction_totals) AS total_funds_spent,
         (SELECT COUNT(*) FROM public.students) AS student_count
  FROM event_data
),
expected AS (
  SELECT COALESCE(SUM(expected_amount), 0) AS total_expected
  FROM event_data
)
SELECT jsonb_build_object(
  'summary', jsonb_build_object(
    'totalBudget', summary.total_budget,
    'totalFundsCollected', summary.total_funds_collected,
    'totalFundsSpent', summary.total_funds_spent,
    'remainingBudget', summary.total_funds_collected - summary.total_funds_spent,
    'totalExpectedContributions', expected.total_expected
  ),
  'eventAllocations', COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
      'eventId', event_id,
      'eventName', event_name,
      'allocationAmount', allocation_amount,
      'expectedAmount', expected_amount,
      'totalCollected', total_collected,
      'totalSpent', total_spent,
      'remainingBalance', total_collected - total_spent
    ) ORDER BY event_name) FROM event_data),
    '[]'::jsonb
  )
)
FROM summary CROSS JOIN expected;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_report()
  TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Deployment-time assertions
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.is_lsc_officer(text)') IS NULL
     OR to_regprocedure('public.is_contribution_eligible(text,text)') IS NULL
     OR to_regprocedure('public.sync_lsc_officer_contributions()') IS NULL THEN
    RAISE EXCEPTION 'LSC officer contribution exclusion functions were not installed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_sync_lsc_officer_contributions'
      AND tgrelid = 'public.lsc_officers'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'LSC officer contribution reconciliation trigger was not installed';
  END IF;
END
$$;