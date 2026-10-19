-- =====================================================================
-- Digital Transparency Board - Realtime LSC appointment updates
-- =====================================================================
-- The client revalidates appointment access when an lsc_officers row is
-- created, updated, or deleted. Add the table to Supabase Realtime when the
-- publication is available. Safe to re-run and safe on local environments
-- where the Supabase publication has not been created yet.
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'lsc_officers'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'lsc_officers'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.lsc_officers;
  END IF;
END $$;