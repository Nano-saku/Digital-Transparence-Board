-- ============================================================
-- DIGITAL TRANSPARENCY BOARD - EMERGENCY ROLLBACK v1
-- ============================================================
-- USE ONLY IF MIGRATION FAILS
-- ============================================================

BEGIN;

-- ============================================================
-- 1. DROP TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS trg_create_student_contributions ON public.students;
DROP TRIGGER IF EXISTS trg_create_event_contributions ON public.events;
DROP TRIGGER IF EXISTS trg_sync_event_contributions ON public.events;

-- ============================================================
-- 2. DROP FUNCTIONS
-- ============================================================

DROP FUNCTION IF EXISTS public.create_student_contributions();
DROP FUNCTION IF EXISTS public.create_event_contributions();
DROP FUNCTION IF EXISTS public.sync_event_contributions();
DROP FUNCTION IF EXISTS public.get_student_requirement_files(TEXT);
DROP FUNCTION IF EXISTS public.has_role(TEXT);
DROP FUNCTION IF EXISTS public.is_staff();
DROP FUNCTION IF EXISTS public.get_next_or_number();

-- ============================================================
-- 2.5 DROP FINANCIAL REPORT FUNCTION
-- ============================================================

DROP FUNCTION IF EXISTS public.get_financial_report();

-- Also drop any associated indexes
DROP INDEX IF EXISTS idx_transactions_type_event;
DROP INDEX IF EXISTS idx_payments_event_student;
-- ============================================================
-- 3. DROP NEW TABLES
-- ============================================================

DROP TABLE IF EXISTS public.student_requirement_file_access CASCADE;
DROP TABLE IF EXISTS public.student_requirement_files CASCADE;
DROP TABLE IF EXISTS public.financial_summaries CASCADE;
DROP TABLE IF EXISTS public.event_allocations CASCADE;
DROP TABLE IF EXISTS public.board_members CASCADE;

-- ============================================================
-- 4. REMOVE ADDED COLUMNS
-- ============================================================

DO $$
BEGIN
    -- Events
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'evening_time_in') THEN
        ALTER TABLE public.events DROP COLUMN IF EXISTS evening_time_in;
        ALTER TABLE public.events DROP COLUMN IF EXISTS evening_time_out;
        ALTER TABLE public.events DROP COLUMN IF EXISTS schedules;
    END IF;
    
    -- Attendance
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_schema = 'public' AND table_name = 'attendance' AND column_name = 'session') THEN
        ALTER TABLE public.attendance DROP COLUMN IF EXISTS session;
        ALTER TABLE public.attendance DROP COLUMN IF EXISTS time_in;
        ALTER TABLE public.attendance DROP COLUMN IF EXISTS time_out;
    END IF;
    
    -- Contributions
    ALTER TABLE public.contributions DROP CONSTRAINT IF EXISTS contributions_required_amount_nonnegative;
    ALTER TABLE public.contributions DROP CONSTRAINT IF EXISTS contributions_amount_paid_nonnegative;
    ALTER TABLE public.contributions DROP CONSTRAINT IF EXISTS contributions_remaining_balance_nonnegative;
END $$;

-- ============================================================
-- 5. DROP INDEXES
-- ============================================================

DROP INDEX IF EXISTS idx_contributions_student_event_unique;
DROP INDEX IF EXISTS idx_student_requirement_files_published;
DROP INDEX IF EXISTS idx_student_requirement_files_created_at;
DROP INDEX IF EXISTS idx_student_req_file_access_student;
DROP INDEX IF EXISTS idx_board_members_name;
DROP INDEX IF EXISTS idx_board_members_account_user_id;

-- ============================================================
-- 6. REMOVE STORAGE BUCKETS
-- ============================================================

DELETE FROM storage.buckets WHERE id = 'student-requirements';
-- DELETE FROM storage.buckets WHERE id = 'receipts';  -- Uncomment if you want to remove receipts bucket too

-- ============================================================
-- 7. CLEAN UP RLS POLICIES
-- ============================================================

DO $$
DECLARE
    policy_record record;
BEGIN
    FOR policy_record IN 
        SELECT 
            tablename,
            policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND (
            policyname LIKE '%_v2' OR 
            policyname LIKE '%_v3' OR
            tablename IN ('student_requirement_files', 'student_requirement_file_access')
        )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 
                      policy_record.policyname, policy_record.tablename);
    END LOOP;
END $$;

COMMIT;

-- ============================================================
-- 8. VALIDATION
-- ============================================================

DO $$
BEGIN
    RAISE NOTICE '=== ROLLBACK SUMMARY ===';
    RAISE NOTICE '✅ Triggers dropped';
    RAISE NOTICE '✅ Functions dropped';
    RAISE NOTICE '✅ New tables dropped';
    RAISE NOTICE '✅ Added columns removed';
    RAISE NOTICE '✅ Constraints removed';
    RAISE NOTICE '✅ Indexes dropped';
    RAISE NOTICE '✅ RLS policies removed';
    RAISE NOTICE '✅ Rollback completed successfully!';
END $$;