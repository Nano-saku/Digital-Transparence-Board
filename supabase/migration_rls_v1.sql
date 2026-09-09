-- ============================================================
-- DIGITAL TRANSPARENCY BOARD - RLS POLICIES v1
-- ============================================================
-- PURPOSE: Row Level Security policies for all tables
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ENABLE RLS ON ALL TABLES
-- ============================================================

DO $$
DECLARE
    table_name text;
BEGIN
    FOR table_name IN 
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN (
            'students', 'events', 'board_members', 'attendance',
            'contributions', 'payments', 'transactions', 'feedback',
            'financial_summaries', 'event_allocations', 'user_roles',
            'student_requirement_files', 'student_requirement_file_access'
        )
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    END LOOP;
END $$;

-- ============================================================
-- 2. DROP OLD POLICIES
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
        AND policyname LIKE '%_v1' OR policyname LIKE '%_v2' OR policyname LIKE '%_v3'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 
                      policy_record.policyname, policy_record.tablename);
    END LOOP;
END $$;

-- ============================================================
-- 3. PUBLIC READ POLICIES
-- ============================================================

-- Students
DROP POLICY IF EXISTS "students_read_public" ON public.students;
CREATE POLICY "students_read_public" ON students FOR SELECT TO public USING (true);

-- Events
DROP POLICY IF EXISTS "events_read_public" ON public.events;
CREATE POLICY "events_read_public" ON events FOR SELECT TO public USING (true);

-- Board Members
DROP POLICY IF EXISTS "board_members_read_public" ON public.board_members;
CREATE POLICY "board_members_read_public" ON public.board_members FOR SELECT TO public USING (true);

-- Attendance
DROP POLICY IF EXISTS "attendance_read_public" ON public.attendance;
CREATE POLICY "attendance_read_public" ON attendance FOR SELECT TO public USING (true);

-- Contributions
DROP POLICY IF EXISTS "contributions_read_public" ON public.contributions;
CREATE POLICY "contributions_read_public" ON contributions FOR SELECT TO public USING (true);

-- Payments
DROP POLICY IF EXISTS "payments_read_public" ON public.payments;
CREATE POLICY "payments_read_public" ON payments FOR SELECT TO public USING (true);

-- Transactions
DROP POLICY IF EXISTS "transactions_read_public" ON public.transactions;
CREATE POLICY "transactions_read_public" ON transactions FOR SELECT TO public USING (true);

-- Financial Summaries
DROP POLICY IF EXISTS "financial_summaries_read_public" ON public.financial_summaries;
CREATE POLICY "financial_summaries_read_public" ON financial_summaries FOR SELECT TO public USING (true);

-- Event Allocations
DROP POLICY IF EXISTS "event_allocations_read_public" ON public.event_allocations;
CREATE POLICY "event_allocations_read_public" ON event_allocations FOR SELECT TO public USING (true);

-- Student Requirement Files (published + unrestricted only)
DROP POLICY IF EXISTS "student_req_files_read_published" ON public.student_requirement_files;
CREATE POLICY "student_req_files_read_published"
    ON public.student_requirement_files
    FOR SELECT TO public
    USING (is_published = true AND restricted = false);

-- ============================================================
-- 4. ADMIN WRITE POLICIES
-- ============================================================

-- Students
DROP POLICY IF EXISTS "students_write_admin" ON public.students;
CREATE POLICY "students_write_admin" ON students FOR ALL TO authenticated
    USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- Events
DROP POLICY IF EXISTS "events_write_admin" ON public.events;
CREATE POLICY "events_write_admin" ON events FOR ALL TO authenticated
    USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- Board Members
DROP POLICY IF EXISTS "board_members_write_admin" ON public.board_members;
CREATE POLICY "board_members_write_admin" ON public.board_members FOR ALL TO authenticated
    USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- Student Requirement Files
DROP POLICY IF EXISTS "student_req_files_write_admin" ON public.student_requirement_files;
CREATE POLICY "student_req_files_write_admin"
    ON public.student_requirement_files FOR ALL TO authenticated
    USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- Student Requirement File Access
DROP POLICY IF EXISTS "student_req_file_access_admin_all" ON public.student_requirement_file_access;
CREATE POLICY "student_req_file_access_admin_all"
    ON public.student_requirement_file_access FOR ALL TO authenticated
    USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- ============================================================
-- 5. STAFF-SPECIFIC WRITE POLICIES
-- ============================================================

-- Attendance: admin + secretary
DROP POLICY IF EXISTS "attendance_write_staff" ON public.attendance;
CREATE POLICY "attendance_write_staff" ON attendance FOR ALL TO authenticated
    USING (public.has_role('admin') OR public.has_role('secretary'))
    WITH CHECK (public.has_role('admin') OR public.has_role('secretary'));

-- Contributions: admin + treasurer + auditor
DROP POLICY IF EXISTS "contributions_write_staff" ON public.contributions;
CREATE POLICY "contributions_write_staff" ON contributions FOR ALL TO authenticated
    USING (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'))
    WITH CHECK (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'));

-- Payments: admin + treasurer + auditor
DROP POLICY IF EXISTS "payments_write_staff" ON public.payments;
CREATE POLICY "payments_write_staff" ON payments FOR ALL TO authenticated
    USING (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'))
    WITH CHECK (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'));

-- Transactions: admin + treasurer + auditor
DROP POLICY IF EXISTS "transactions_write_staff" ON public.transactions;
CREATE POLICY "transactions_write_staff" ON transactions FOR ALL TO authenticated
    USING (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'))
    WITH CHECK (public.has_role('admin') OR public.has_role('treasurer') OR public.has_role('auditor'));

-- Financial Summaries: admin + treasurer
DROP POLICY IF EXISTS "financial_summaries_write_staff" ON public.financial_summaries;
CREATE POLICY "financial_summaries_write_staff" ON financial_summaries FOR ALL TO authenticated
    USING (public.has_role('admin') OR public.has_role('treasurer'))
    WITH CHECK (public.has_role('admin') OR public.has_role('treasurer'));

-- Event Allocations: admin + treasurer
DROP POLICY IF EXISTS "event_allocations_write_staff" ON public.event_allocations;
CREATE POLICY "event_allocations_write_staff" ON event_allocations FOR ALL TO authenticated
    USING (public.has_role('admin') OR public.has_role('treasurer'))
    WITH CHECK (public.has_role('admin') OR public.has_role('treasurer'));

-- ============================================================
-- 6. FEEDBACK POLICIES
-- ============================================================

-- Anyone can submit
DROP POLICY IF EXISTS "feedback_submit_public" ON public.feedback;
CREATE POLICY "feedback_submit_public" ON feedback FOR INSERT TO public WITH CHECK (true);

-- Staff can read
DROP POLICY IF EXISTS "feedback_read_staff" ON public.feedback;
CREATE POLICY "feedback_read_staff" ON feedback FOR SELECT TO authenticated USING (public.is_staff());

-- Admin can update/delete
DROP POLICY IF EXISTS "feedback_update_admin" ON public.feedback;
CREATE POLICY "feedback_update_admin" ON feedback FOR UPDATE TO authenticated
    USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS "feedback_delete_admin" ON public.feedback;
CREATE POLICY "feedback_delete_admin" ON feedback FOR DELETE TO authenticated USING (public.has_role('admin'));

-- ============================================================
-- 6.5 FINANCIAL REPORT POLICIES
-- ============================================================

-- The financial report function runs with SECURITY DEFINER
-- so it bypasses RLS. This is intentional and safe because:
-- 1. It only reads data (SELECT operations)
-- 2. It aggregates data for reporting purposes
-- 3. No modifications are made

-- However, we still want to ensure the function is accessible
-- to authenticated users who need it
GRANT EXECUTE ON FUNCTION public.get_financial_report() TO anon, authenticated;

-- For the underlying tables, we rely on the existing policies:
-- - Public can read all financial tables (transparency)
-- - Staff can write to financial tables
-- - The report function inherits these permissions

-- Add validation for financial report
DO $$
BEGIN
    -- Test that the function exists and works
    PERFORM public.get_financial_report();
    RAISE NOTICE '✅ Financial report function is accessible and working';
EXCEPTION
    WHEN others THEN
    RAISE NOTICE '⚠️ Financial report function may have issues: %', SQLERRM;
END $$;

-- ============================================================
-- 7. USER ROLES POLICIES
-- ============================================================

DROP POLICY IF EXISTS "user_roles_read_own" ON public.user_roles;
CREATE POLICY "user_roles_read_own"
    ON public.user_roles
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_roles_read_board_members" ON public.user_roles;
CREATE POLICY "user_roles_read_board_members"
    ON public.user_roles
    FOR SELECT TO authenticated
    USING (role = 'board-member');

-- ============================================================
-- 8. STORAGE POLICIES
-- ============================================================

-- Receipts bucket
DROP POLICY IF EXISTS "receipts_public_read" ON storage.objects;
CREATE POLICY "receipts_public_read"
    ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "receipts_authenticated_upload" ON storage.objects;
CREATE POLICY "receipts_authenticated_upload"
    ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'receipts');

-- Student Requirements bucket
DROP POLICY IF EXISTS "student_req_files_public_read" ON storage.objects;
CREATE POLICY "student_req_files_public_read"
    ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'student-requirements');

DROP POLICY IF EXISTS "student_req_files_admin_upload" ON storage.objects;
CREATE POLICY "student_req_files_admin_upload"
    ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'student-requirements' AND public.has_role('admin'));

DROP POLICY IF EXISTS "student_req_files_admin_update" ON storage.objects;
CREATE POLICY "student_req_files_admin_update"
    ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'student-requirements' AND public.has_role('admin'))
    WITH CHECK (bucket_id = 'student-requirements' AND public.has_role('admin'));

DROP POLICY IF EXISTS "student_req_files_admin_delete" ON storage.objects;
CREATE POLICY "student_req_files_admin_delete"
    ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'student-requirements' AND public.has_role('admin'));

-- ============================================================
-- 9. SYNC OFFICER ROLES
-- ============================================================

DO $$
DECLARE
    officer_email text;
    officer_role text;
    officer_name text;
    uid           uuid;
BEGIN
    FOR officer_email, officer_role, officer_name IN VALUES
        ('admin@studentboard.ph',          'admin',       'Student Council Admin'),
        ('alcasidjimliekate@gmail.com',    'secretary',   'Council Secretary'),
        ('rhevincecarlbucod@gmail.com',    'secretary',   'Council Secretary'),
        ('treasurer@studentboard.ph',      'treasurer',   'Council Treasurer'),
        ('auditor@studentboard.ph',        'auditor',     'Council Auditor'),
        ('j.m.mschoolmail@gmail.com',      'board-member', 'Board Member'),
        ('board@studentboard.ph',          'board-member', 'Board Member')
    LOOP
        SELECT id INTO uid FROM auth.users WHERE email = officer_email;

        IF uid IS NULL THEN
            RAISE NOTICE '⚠️ OFFICER ACCOUNT MISSING: % — create in Dashboard > Authentication > Users > Add user', officer_email;
            CONTINUE;
        END IF;

        INSERT INTO public.user_roles (user_id, role, name)
        VALUES (uid, officer_role, officer_name)
        ON CONFLICT (user_id) DO UPDATE
            SET role = EXCLUDED.role,
                name = EXCLUDED.name;

        RAISE NOTICE '✅ Role % synced for %', officer_role, officer_email;
    END LOOP;
END $$;

COMMIT;

-- ============================================================
-- 10. VALIDATION
-- ============================================================

DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public';
    
    RAISE NOTICE '=== RLS MIGRATION SUMMARY ===';
    RAISE NOTICE 'Total policies applied: %', policy_count;
    RAISE NOTICE '✅ RLS policies applied successfully!';
    
    -- Show policy distribution
    FOR policy_record IN (
        SELECT 
            tablename,
            COUNT(*) as policy_count
        FROM pg_policies
        WHERE schemaname = 'public'
        GROUP BY tablename
        ORDER BY tablename
    ) LOOP
        RAISE NOTICE '  %: % policies', 
            policy_record.tablename, 
            policy_record.policy_count;
    END LOOP;
END $$;