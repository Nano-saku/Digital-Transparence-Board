-- =====================================================================
-- Digital Transparency Board - Complete Realtime Publication Setup
-- =====================================================================
-- Ensures all tables that drive real-time financial, attendance, and
-- officer-exemption calculations are added to the supabase_realtime
-- publication. Safe to re-run; uses DO blocks with existence checks.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Add all required tables to supabase_realtime publication
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables_to_add TEXT[] := ARRAY[
    'students', 'events', 'attendance', 'contributions',
    'payments', 'transactions', 'board_members', 'lsc_officers',
    'event_volunteers', 'user_roles'
  ];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE NOTICE 'supabase_realtime publication does not exist — skipping.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY tables_to_add LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Added public.% to supabase_realtime', t;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2. Per-event collection performance RPC
--    Authoritative backend calculation. Officers are excluded via
--    is_lsc_officer(). The client must NOT duplicate this logic locally.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_collection_performance()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
WITH eligible_counts AS (
  SELECT
    e.id AS event_id,
    COUNT(s.id)::BIGINT AS eligible_count
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
  'Returns per-event expected collection, actual collection, outstanding balance, and collection performance %, excluding current LSC officers.';

-- ---------------------------------------------------------------------
-- 3. Guard: restore lsc_officers sync trigger if accidentally dropped
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_sync_lsc_officer_contributions'
      AND tgrelid = 'public.lsc_officers'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_sync_lsc_officer_contributions
    AFTER INSERT OR UPDATE OR DELETE ON public.lsc_officers
    FOR EACH ROW EXECUTE FUNCTION public.sync_lsc_officer_contributions();
    RAISE NOTICE 'Restored trg_sync_lsc_officer_contributions on lsc_officers.';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. Performance indexes for realtime-triggered re-fetches
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_lsc_officers_student_db_id
  ON public.lsc_officers (student_db_id) WHERE student_db_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contributions_paid_nonzero
  ON public.contributions (event_id, student_id) WHERE amount_paid > 0;

CREATE INDEX IF NOT EXISTS idx_payments_event_student
  ON public.payments (event_id, student_id) WHERE event_id IS NOT NULL;

-- Reload PostgREST schema cache so the new RPC is immediately callable.
NOTIFY pgrst, 'reload schema';

