-- =====================================================================
-- Digital Transparency Board - Remove obsolete dashboard snapshot tables
-- =====================================================================
-- Purpose:
--   The app stopped reading/writing `financial_summaries` and
--   `event_allocations` long ago: Admin Dashboard and the Transparency
--   Board now compute every figure on the fly via financialReportingService
--   directly from events / students / contributions / payments /
--   transactions. The old snapshot tables (and the dead services that
--   maintained them) were removed from the codebase, and these DDLs remove
--   the now-unused tables from existing databases.
--
--   Safe to re-run. The tables are fully derived caches -- their content is
--   recomputed from the live operational tables, so dropping them loses no
--   source data and cannot affect offline sync (they were never part of the
--   IndexedDB offline cache/mutation queue).
-- =====================================================================

-- Policies that reference the obsolete tables must go first.
DROP POLICY IF EXISTS "financial_summaries_read_public" ON public.financial_summaries;
DROP POLICY IF EXISTS "financial_summaries_write_staff" ON public.financial_summaries;
DROP POLICY IF EXISTS "event_allocations_read_public" ON public.event_allocations;
DROP POLICY IF EXISTS "event_allocations_write_staff" ON public.event_allocations;

DROP INDEX IF EXISTS public.idx_event_allocations_event_id;

DROP TABLE IF EXISTS public.event_allocations;
DROP TABLE IF EXISTS public.financial_summaries;