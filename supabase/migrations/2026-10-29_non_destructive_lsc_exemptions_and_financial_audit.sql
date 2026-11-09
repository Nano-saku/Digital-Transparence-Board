-- =====================================================================
-- Non-destructive LSC exemptions and financial audit helpers
-- =====================================================================
-- lsc_officers has no status/end-date column: a row is current until removed.
-- student_db_id is authoritative; legacy student_id is used only when it
-- resolves to exactly one student. No historical row is deleted or rewritten.

CREATE OR REPLACE FUNCTION public.is_lsc_officer(p_student_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lsc_officers o
    JOIN public.students s ON s.id = p_student_id
    WHERE o.student_db_id = s.id
       OR (
         o.student_db_id IS NULL
         AND lower(btrim(o.student_id)) = lower(btrim(s.student_id))
         AND (
           SELECT count(*) FROM public.students same_number
           WHERE lower(btrim(same_number.student_id)) = lower(btrim(s.student_id))
         ) = 1
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_contribution_eligible(
  p_student_id TEXT, p_event_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.events e ON e.id = p_event_id
    WHERE s.id = p_student_id
      AND GREATEST(COALESCE(e.allocation_amount, 0), 0) > 0
      AND COALESCE(e.is_no_contribution, false) = false
      AND NOT public.is_lsc_officer(s.id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_lsc_officer(TEXT) TO anon, authenticated;

-- Read model for contribution screens. Current unpaid officer allocations are
-- hidden from requirement/outstanding views. Paid/partial rows remain visible
-- as historical transactions; client summaries use the eligibility-aware RPCs
-- for required and outstanding totals.
CREATE OR REPLACE VIEW public.contribution_requirements AS
SELECT c.*
FROM public.contributions c
WHERE public.is_contribution_eligible(c.student_id, c.event_id)
   OR COALESCE(c.amount_paid, 0) > 0;

GRANT SELECT ON public.contribution_requirements TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_contribution_eligible(TEXT, TEXT) TO anon, authenticated;

-- Protect generic inserts, manual writes, and offline replay at the database
-- boundary. A zero-paid exempt allocation is never allowed. Existing paid or
-- partial rows remain untouched and can retain their historical receipts.
CREATE OR REPLACE FUNCTION public.guard_exempt_contribution_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION public.guard_exempt_payment_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Preserve an existing historical payment row when only its amount or
  -- receipt metadata is corrected. A reassignment to a new student/event is
  -- still blocked by the eligibility check below.
  IF TG_OP = 'UPDATE'
     AND OLD.student_id = NEW.student_id
     AND OLD.event_id IS NOT DISTINCT FROM NEW.event_id THEN
    RETURN NEW;
  END IF;
  IF NEW.event_id IS NOT NULL
     AND NOT public.is_contribution_eligible(NEW.student_id, NEW.event_id) THEN
    RAISE EXCEPTION 'This student is exempt from contributions for this event.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_exempt_payment_write ON public.payments;
CREATE TRIGGER trg_guard_exempt_payment_write
BEFORE INSERT OR UPDATE OF student_id, event_id, amount
ON public.payments FOR EACH ROW
EXECUTE FUNCTION public.guard_exempt_payment_write();

CREATE OR REPLACE FUNCTION public.get_contribution_totals()
RETURNS TABLE(total_required BIGINT, total_paid BIGINT, total_balance BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN public.is_contribution_eligible(c.student_id, c.event_id)
      THEN GREATEST(COALESCE(c.required_amount, 0), 0) ELSE 0 END), 0)::BIGINT,
    COALESCE(SUM(GREATEST(COALESCE(c.amount_paid, 0), 0)), 0)::BIGINT,
    COALESCE(SUM(CASE WHEN public.is_contribution_eligible(c.student_id, c.event_id)
      THEN GREATEST(COALESCE(c.remaining_balance, 0), 0) ELSE 0 END), 0)::BIGINT
  FROM public.contributions c;
$$;

CREATE OR REPLACE FUNCTION public.get_event_contribution_totals()
RETURNS TABLE(event_id TEXT, collected BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH c AS (
    SELECT student_id, event_id, SUM(GREATEST(COALESCE(amount_paid, 0), 0)) amount
    FROM public.contributions WHERE event_id IS NOT NULL GROUP BY student_id, event_id
  ), p AS (
    SELECT student_id, event_id, SUM(GREATEST(COALESCE(amount, 0), 0)) amount
    FROM public.payments WHERE event_id IS NOT NULL GROUP BY student_id, event_id
  )
  SELECT pairs.event_id,
         COALESCE(SUM(GREATEST(pairs.contribution_amount, pairs.payment_amount)), 0)::BIGINT
  FROM (
    SELECT COALESCE(c.student_id, p.student_id) student_id,
           COALESCE(c.event_id, p.event_id) event_id,
           COALESCE(c.amount, 0) contribution_amount,
           COALESCE(p.amount, 0) payment_amount
    FROM c FULL OUTER JOIN p ON c.student_id = p.student_id AND c.event_id = p.event_id
  ) pairs
  GROUP BY pairs.event_id;
$$;

-- Recreate Automatic Absent with the officer exclusion. Existing attendance
-- rows are preserved; only missing, non-officer rows can be inserted.
DROP FUNCTION IF EXISTS public.mark_absent_if_missing(text, text);
CREATE FUNCTION public.mark_absent_if_missing(
  p_event_id text, p_session text DEFAULT 'morning'
)
RETURNS SETOF public.attendance
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_event public.events%ROWTYPE;
        v_inserted integer := 0;
        v_actor public.user_roles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role('admin') OR public.has_role('secretary')) THEN
    RAISE EXCEPTION 'Only admin or secretary accounts can record attendance.' USING ERRCODE = '42501';
  END IF;
  IF p_session IS NULL OR p_session NOT IN ('morning', 'afternoon', 'evening') THEN
    RAISE EXCEPTION 'Invalid attendance session: %', p_session USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event % does not exist.', p_event_id USING ERRCODE = 'P0002'; END IF;
  IF COALESCE((to_jsonb(v_event)->>'auto_mark_absent')::boolean, false)
     = false OR COALESCE((to_jsonb(v_event)->>'is_non_conducting')::boolean, false) THEN RETURN; END IF;
  IF v_event.date IS NULL OR v_event.date !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN; END IF;
  IF (now() AT TIME ZONE 'Asia/Manila')::date <= v_event.date::date THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('attendance-auto-absent:' || p_event_id));
  RETURN QUERY
    INSERT INTO public.attendance
      (id, student_id, event_id, event_name, date, status, session, time_in, time_out)
    SELECT gen_random_uuid()::text, s.id, v_event.id, v_event.name, v_event.date,
           'absent', p_session, '', ''
    FROM public.students s
    WHERE NOT public.is_lsc_officer(s.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance x
        WHERE x.student_id = s.id AND x.event_id = v_event.id AND x.date = v_event.date
      )
    ON CONFLICT DO NOTHING
    RETURNING *;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 AND to_regclass('public.audit_logs') IS NOT NULL THEN
    SELECT * INTO v_actor FROM public.user_roles WHERE user_id = auth.uid();
    INSERT INTO public.audit_logs
      (id, actor_user_id, actor_name, actor_role, action, entity_type,
       entity_id, description, metadata)
    VALUES
      (gen_random_uuid()::text, auth.uid(), COALESCE(NULLIF(v_actor.name, ''), 'Officer'),
       COALESCE(v_actor.role, 'unknown'), 'ATTENDANCE_AUTO_ABSENT', 'attendance',
       v_event.id,
       format('Automatically marked %s student(s) absent for %s.', v_inserted, v_event.name),
       jsonb_build_object('eventId', v_event.id, 'date', v_event.date, 'count', v_inserted));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_absent_if_missing(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_absent_if_missing(text, text) TO authenticated;

-- Read-only discrepancy report. It identifies issues without deciding whether
-- duplicate-looking rows are legitimate transactions and without mutating data.
CREATE OR REPLACE FUNCTION public.get_financial_discrepancy_report()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
WITH cd AS (
  SELECT student_id, event_id, count(*) row_count FROM public.contributions
  GROUP BY student_id, event_id HAVING count(*) > 1
), pt AS (
  SELECT student_id, event_id, SUM(GREATEST(COALESCE(amount, 0), 0)) amount
  FROM public.payments WHERE event_id IS NOT NULL GROUP BY student_id, event_id
), ct AS (
  SELECT student_id, event_id, SUM(GREATEST(COALESCE(amount_paid, 0), 0)) amount
  FROM public.contributions WHERE event_id IS NOT NULL GROUP BY student_id, event_id
), pm AS (
  SELECT COALESCE(ct.student_id, pt.student_id) student_id,
         COALESCE(ct.event_id, pt.event_id) event_id,
         COALESCE(ct.amount, 0) contribution_amount, COALESCE(pt.amount, 0) payment_amount
  FROM ct FULL OUTER JOIN pt ON ct.student_id = pt.student_id AND ct.event_id = pt.event_id
  WHERE COALESCE(ct.amount, 0) <> COALESCE(pt.amount, 0)
), bm AS (
  SELECT c.id, c.student_id, c.event_id, c.required_amount, c.amount_paid, c.remaining_balance,
         GREATEST(COALESCE(c.required_amount, 0) - COALESCE(c.amount_paid, 0), 0) calculated_balance
  FROM public.contributions c
  WHERE GREATEST(COALESCE(c.required_amount, 0) - COALESCE(c.amount_paid, 0), 0)
        <> GREATEST(COALESCE(c.remaining_balance, 0), 0)
), iu AS (
  SELECT c.id, c.student_id, c.event_id, c.required_amount, c.amount_paid, c.remaining_balance
  FROM public.contributions c
  WHERE NOT public.is_contribution_eligible(c.student_id, c.event_id)
    AND COALESCE(c.amount_paid, 0) <= 0
), op AS (
  SELECT p.id, p.student_id, p.event_id, p.amount FROM public.payments p
  LEFT JOIN public.students s ON s.id = p.student_id
  LEFT JOIN public.events e ON e.id = p.event_id
  WHERE s.id IS NULL OR (p.event_id IS NOT NULL AND e.id IS NULL)
)
SELECT jsonb_build_object('generatedAt', now(), 'discrepancies', jsonb_build_object(
  'duplicateContributionPairs', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM cd x), '[]'::jsonb),
  'paymentContributionMismatches', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM pm x), '[]'::jsonb),
  'balanceMismatches', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM bm x), '[]'::jsonb),
  'ineligibleUnpaidAllocations', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM iu x), '[]'::jsonb),
  'orphanPayments', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM op x), '[]'::jsonb)
));
$$;
GRANT EXECUTE ON FUNCTION public.get_financial_discrepancy_report() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';