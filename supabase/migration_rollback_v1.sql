-- ============================================================
-- DIGITAL TRANSPARENCY BOARD - EMERGENCY ROLLBACK v1
-- ============================================================
-- USE ONLY IF migration_schema_v1.sql / migration_rls_v1.sql FAILS
--
-- This only undoes what those two files actually introduce. It does NOT
-- touch anything that predates this migration -- has_role(), is_staff(),
-- get_next_or_number(), get_financial_report(), get_contribution_totals(),
-- board_members, or_sequence, and the payments OR-numbering trigger all
-- exist independently of this migration (several since before it, others
-- via 2026-09-01_offline_payment_or_sequence.sql) and are relied on by the
-- app today. Dropping them is NOT a "rollback" -- it's new damage.
--
-- The original version of this script attempted to drop board_members and
-- has_role()/is_staff()/get_next_or_number() as if they were introduced by
-- this migration. They were not -- they're in the baseline schema.sql and
-- dropping them would have deleted real board member accounts and broken
-- every RLS write policy and OR-numbering in the app. Fixed here.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. DROP TRIGGERS introduced by this migration
-- ============================================================
-- (payments_assign_or_number is NOT here -- it's from 2026-09-01 and
-- predates this migration.)

DROP TRIGGER IF EXISTS trg_create_student_contributions ON public.students;
DROP TRIGGER IF EXISTS trg_create_event_contributions ON public.events;
DROP TRIGGER IF EXISTS trg_sync_event_contributions ON public.events;

-- ============================================================
-- 2. DROP FUNCTIONS introduced by this migration
-- ============================================================
-- has_role(), is_staff(), get_next_or_number(), get_financial_report(),
-- get_contribution_totals(), get_student_requirement_files(), and
-- assign_payment_or_number() are deliberately NOT dropped -- all predate
-- this migration (or, for get_student_requirement_files, may already be
-- relied on in production -- see step 3 below) and this migration's own
-- schema/RLS files only CREATE OR REPLACE them, they don't introduce them.

DROP FUNCTION IF EXISTS public.create_student_contributions();
DROP FUNCTION IF EXISTS public.create_event_contributions();
DROP FUNCTION IF EXISTS public.sync_event_contributions();

-- Indexes added purely for financial-report query performance (new to
-- this migration; safe to drop).
DROP INDEX IF EXISTS idx_transactions_type_event;
DROP INDEX IF EXISTS idx_payments_event_student;

-- ============================================================
-- 3. STUDENT REQUIREMENT FILES FEATURE (table + policies + bucket)
-- ============================================================
-- This feature's live-production status wasn't confirmed at review time,
-- so this checks for real data before touching anything. If either table
-- already holds rows, nothing in this block is dropped -- it's left alone
-- and flagged for manual review instead of guessing.

DO $$
DECLARE
    file_count INTEGER := 0;
    access_count INTEGER := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'student_requirement_files') THEN
        SELECT COUNT(*) INTO file_count FROM public.student_requirement_files;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'student_requirement_file_access') THEN
        SELECT COUNT(*) INTO access_count FROM public.student_requirement_file_access;
    END IF;

    IF file_count > 0 OR access_count > 0 THEN
        RAISE NOTICE '⚠️  SKIPPED: student_requirement_files has % row(s), student_requirement_file_access has % row(s). Not dropping -- looks like this feature already has real data. Review manually before removing it.', file_count, access_count;
    ELSE
        -- CASCADE here also removes this table's own RLS policies and indexes.
        DROP TABLE IF EXISTS public.student_requirement_file_access CASCADE;
        DROP TABLE IF EXISTS public.student_requirement_files CASCADE;
        DELETE FROM storage.buckets WHERE id = 'student-requirements';
        RAISE NOTICE '✅ student_requirement_files / student_requirement_file_access were empty -- dropped.';
    END IF;
END $$;

-- ============================================================
-- 4. REMOVE COLUMNS/CONSTRAINTS/INDEXES introduced by this migration
-- ============================================================
-- NOTE: attendance.session / time_in / time_out are NOT touched here --
-- they're in the baseline schema.sql (schema.sql even documents that the
-- app's Time In/Out saves require `session` to exist), not introduced by
-- this migration. The original version of this script dropped them, which
-- would have broken attendance recording entirely.

DO $$
BEGIN
    -- Events: evening_time_in/out + schedules are new to this migration.
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'evening_time_in') THEN
        ALTER TABLE public.events DROP COLUMN IF EXISTS evening_time_in;
        ALTER TABLE public.events DROP COLUMN IF EXISTS evening_time_out;
        ALTER TABLE public.events DROP COLUMN IF EXISTS schedules;
    END IF;

    -- Contributions: non-negative guards are new to this migration.
    ALTER TABLE public.contributions DROP CONSTRAINT IF EXISTS contributions_required_amount_nonnegative;
    ALTER TABLE public.contributions DROP CONSTRAINT IF EXISTS contributions_amount_paid_nonnegative;
    ALTER TABLE public.contributions DROP CONSTRAINT IF EXISTS contributions_remaining_balance_nonnegative;
END $$;

-- WARNING: dropping this index re-opens the exact double-entry bug this
-- migration exists to fix -- a student could again end up with two
-- contribution rows for the same event. Only drop it if you're rolling
-- back the whole migration, not just troubleshooting something else.
DROP INDEX IF EXISTS idx_contributions_student_event_unique;

-- (idx_board_members_name / idx_board_members_account_user_id are
-- deliberately NOT dropped -- board_members and its indexes predate this
-- migration; see the header note.)

COMMIT;

-- ============================================================
-- 5. VALIDATION -- actually checks state instead of assuming success
-- ============================================================

DO $$
DECLARE
    remaining_triggers INTEGER;
    remaining_functions INTEGER;
    board_members_intact BOOLEAN;
    has_role_intact BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO remaining_triggers
    FROM pg_trigger
    WHERE tgname IN (
        'trg_create_student_contributions',
        'trg_create_event_contributions',
        'trg_sync_event_contributions'
    );

    SELECT COUNT(*) INTO remaining_functions
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('create_student_contributions', 'create_event_contributions', 'sync_event_contributions');

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'board_members'
    ) INTO board_members_intact;

    SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace AND proname = 'has_role'
    ) INTO has_role_intact;

    RAISE NOTICE '=== ROLLBACK SUMMARY ===';
    RAISE NOTICE 'Cross-join triggers remaining (expect 0): %', remaining_triggers;
    RAISE NOTICE 'Cross-join functions remaining (expect 0): %', remaining_functions;
    RAISE NOTICE 'board_members table still present (expect true): %', board_members_intact;
    RAISE NOTICE 'has_role() still present (expect true): %', has_role_intact;

    IF remaining_triggers = 0 AND remaining_functions = 0 AND board_members_intact AND has_role_intact THEN
        RAISE NOTICE '✅ Rollback completed as expected.';
    ELSE
        RAISE WARNING '⚠️  Rollback state does not match expectations -- check the values above before assuming this worked.';
    END IF;
END $$;
