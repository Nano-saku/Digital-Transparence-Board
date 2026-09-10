-- ============================================================
-- DIGITAL TRANSPARENCY BOARD - SCHEMA MIGRATION v1
-- ============================================================
-- PURPOSE: Core database schema with all tables, indexes,
--          functions, and triggers
--
-- RUN ORDER: this file creates tables and triggers but no RLS policies.
-- Always follow it immediately with migration_rls_v1.sql in the same
-- sitting -- between the two, new tables (student_requirement_files,
-- student_requirement_file_access) would otherwise be open to anon/
-- authenticated via the broad GRANT in section 10 with no policy
-- restricting them.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. CORE TABLES
-- ============================================================

-- Students
CREATE TABLE IF NOT EXISTS public.students (
    id         TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    name       TEXT NOT NULL,
    program    TEXT NOT NULL,
    year_level INTEGER NOT NULL DEFAULT 0,
    section    TEXT NOT NULL DEFAULT ''
);

-- Events
CREATE TABLE IF NOT EXISTS public.events (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    allocation_amount   INTEGER NOT NULL DEFAULT 0,
    date                TEXT,
    time_in             TEXT NOT NULL DEFAULT '',
    time_out            TEXT NOT NULL DEFAULT '',
    morning_time_in     TEXT NOT NULL DEFAULT '',
    morning_time_out    TEXT NOT NULL DEFAULT '',
    afternoon_time_in   TEXT NOT NULL DEFAULT '',
    afternoon_time_out  TEXT NOT NULL DEFAULT '',
    evening_time_in     TEXT NOT NULL DEFAULT '',
    evening_time_out    TEXT NOT NULL DEFAULT '',
    schedules           JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Board Members
CREATE TABLE IF NOT EXISTS public.board_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(trim(name)) > 0),
    account_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Attendance
CREATE TABLE IF NOT EXISTS public.attendance (
    id         TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    event_id   TEXT NOT NULL,
    event_name TEXT NOT NULL DEFAULT '',
    date       TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'present',
    session    TEXT NOT NULL DEFAULT 'morning',
    time_in    TEXT NOT NULL DEFAULT '',
    time_out   TEXT NOT NULL DEFAULT ''
);

-- Contributions
CREATE TABLE IF NOT EXISTS public.contributions (
    id                TEXT PRIMARY KEY,
    student_id        TEXT NOT NULL,
    event_id          TEXT NOT NULL,
    event_name        TEXT NOT NULL DEFAULT '',
    required_amount   INTEGER NOT NULL DEFAULT 0,
    amount_paid       INTEGER NOT NULL DEFAULT 0,
    remaining_balance INTEGER NOT NULL DEFAULT 0
);

-- Payments
CREATE TABLE IF NOT EXISTS public.payments (
    id           TEXT PRIMARY KEY,
    student_id   TEXT NOT NULL,
    student_name TEXT NOT NULL DEFAULT '',
    event_id     TEXT,
    event_name   TEXT,
    amount       INTEGER NOT NULL DEFAULT 0,
    date         TEXT NOT NULL DEFAULT '',
    receipt_url  TEXT,
    or_number    TEXT,
    recorded_by  TEXT NOT NULL DEFAULT ''
);

-- payments.contribution_id + the OR-number auto-assign trigger below both
-- come from 2026-09-01_offline_payment_or_sequence.sql, copied verbatim.
-- That migration is already applied to production, so these are no-ops
-- there; they're included here so this file is a complete, correct
-- baseline on its own (e.g. for a fresh environment) instead of silently
-- missing them.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS contribution_id TEXT;
CREATE INDEX IF NOT EXISTS idx_payments_contribution_id ON public.payments (contribution_id);

-- OR Sequence
CREATE TABLE IF NOT EXISTS public.or_sequence (
    year      INTEGER PRIMARY KEY CHECK (year >= 2000),
    last_used INTEGER NOT NULL DEFAULT 0 CHECK (last_used >= 0)
);

-- Keep the sequence at least as high as OR numbers that already exist.
-- This matters when upgrading an existing production database.
INSERT INTO public.or_sequence (year, last_used)
SELECT
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
    COALESCE(MAX(SUBSTRING(or_number FROM '(\d{6})$')::INTEGER), 0)
FROM public.payments
WHERE or_number ~ ('^OR-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-\d{6}$')
ON CONFLICT (year) DO UPDATE
    SET last_used = GREATEST(public.or_sequence.last_used, EXCLUDED.last_used);

-- Transactions
CREATE TABLE IF NOT EXISTS public.transactions (
    id                  TEXT PRIMARY KEY,
    date                TEXT NOT NULL DEFAULT '',
    description         TEXT NOT NULL DEFAULT '',
    event_id            TEXT,
    event_name          TEXT,
    amount              INTEGER NOT NULL DEFAULT 0,
    type                TEXT NOT NULL DEFAULT 'income'
                        CHECK (type IN ('income', 'expense')),
    responsible_officer TEXT NOT NULL DEFAULT '',
    receipt_url         TEXT
);

-- Feedback
CREATE TABLE IF NOT EXISTS public.feedback (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL CHECK (type IN ('inquiry', 'complaint', 'suggestion')),
    title        TEXT,
    message      TEXT NOT NULL,
    student_name TEXT,
    student_id   TEXT,
    is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'in-progress', 'resolved'))
);

-- NOTE: financial_summaries and event_allocations are intentionally NOT
-- created here. They were dropped as dead/obsolete tables by
-- 2026-09-05_remove_obsolete_dashboard_tables.sql (the app now computes
-- every figure on the fly via get_financial_report() / get_contribution_totals()
-- instead of a cached snapshot table). Re-adding them here would silently
-- resurrect two tables with RLS disabled and no policies -- see the RLS file.

-- Student Requirement Files
CREATE TABLE IF NOT EXISTS public.student_requirement_files (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    description  TEXT DEFAULT '',
    file_url     TEXT NOT NULL,
    file_name    TEXT NOT NULL DEFAULT '',
    file_size    BIGINT NOT NULL DEFAULT 0,
    file_type    TEXT DEFAULT '',
    is_published BOOLEAN NOT NULL DEFAULT false,
    restricted   BOOLEAN NOT NULL DEFAULT false,
    created_by   TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT '',
    updated_at   TEXT NOT NULL DEFAULT ''
);

-- Student Requirement File Access
CREATE TABLE IF NOT EXISTS public.student_requirement_file_access (
    file_id    TEXT NOT NULL,
    student_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (file_id, student_id)
);

-- User Roles
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    role       text NOT NULL,
    name       text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_board_members_name ON public.board_members (lower(name));
CREATE INDEX IF NOT EXISTS idx_board_members_account_user_id ON public.board_members (account_user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_event_id ON public.attendance (event_id);
CREATE INDEX IF NOT EXISTS idx_contributions_student_id ON public.contributions (student_id);
CREATE INDEX IF NOT EXISTS idx_contributions_event_id ON public.contributions (event_id);
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON public.payments (student_id);
CREATE INDEX IF NOT EXISTS idx_payments_event_id ON public.payments (event_id);
CREATE INDEX IF NOT EXISTS idx_transactions_event_id ON public.transactions (event_id);
CREATE INDEX IF NOT EXISTS idx_student_requirement_files_published ON public.student_requirement_files (is_published);
CREATE INDEX IF NOT EXISTS idx_student_requirement_files_created_at ON public.student_requirement_files (created_at);
CREATE INDEX IF NOT EXISTS idx_student_req_file_access_student ON public.student_requirement_file_access (student_id);

-- Additional indexes for financial report performance
CREATE INDEX IF NOT EXISTS idx_transactions_type_event ON public.transactions (type, event_id);
CREATE INDEX IF NOT EXISTS idx_payments_event_student ON public.payments (event_id, student_id);

-- ============================================================
-- 3. CONSTRAINTS
-- ============================================================

-- User Roles constraint
DO $$
BEGIN
    ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
        CHECK (role IN ('admin', 'secretary', 'treasurer', 'auditor', 'board-member'));
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Could not add constraint user_roles_role_check: %', SQLERRM;
END $$;

-- Contributions constraints (non-negative)
ALTER TABLE public.contributions DROP CONSTRAINT IF EXISTS contributions_required_amount_nonnegative;
ALTER TABLE public.contributions ADD CONSTRAINT contributions_required_amount_nonnegative CHECK (required_amount >= 0);

ALTER TABLE public.contributions DROP CONSTRAINT IF EXISTS contributions_amount_paid_nonnegative;
ALTER TABLE public.contributions ADD CONSTRAINT contributions_amount_paid_nonnegative CHECK (amount_paid >= 0);

ALTER TABLE public.contributions DROP CONSTRAINT IF EXISTS contributions_remaining_balance_nonnegative;
ALTER TABLE public.contributions ADD CONSTRAINT contributions_remaining_balance_nonnegative CHECK (remaining_balance >= 0);

-- Unique constraint for student-event contributions
CREATE UNIQUE INDEX IF NOT EXISTS idx_contributions_student_event_unique 
    ON public.contributions (student_id, event_id);

-- Foreign key constraints for student_requirement_file_access
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_schema = 'public' AND table_name = 'student_requirement_files') 
       AND EXISTS (SELECT 1 FROM information_schema.tables 
                   WHERE table_schema = 'public' AND table_name = 'students') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                       WHERE constraint_name = 'student_requirement_file_access_file_id_fkey') THEN
            ALTER TABLE public.student_requirement_file_access 
            ADD CONSTRAINT student_requirement_file_access_file_id_fkey 
            FOREIGN KEY (file_id) REFERENCES public.student_requirement_files(id) ON DELETE CASCADE;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                       WHERE constraint_name = 'student_requirement_file_access_student_id_fkey') THEN
            ALTER TABLE public.student_requirement_file_access 
            ADD CONSTRAINT student_requirement_file_access_student_id_fkey 
            FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- ============================================================
-- 4. FUNCTIONS
-- ============================================================

-- Get next OR number
CREATE OR REPLACE FUNCTION public.get_next_or_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_yr  INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    next_seq    INTEGER;
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

-- Assigns a real OR number to every payment as it's inserted -- including
-- offline-recorded payments replaying later -- so OR numbers stay
-- authoritative and gap-free regardless of client-side state. Copied
-- verbatim from 2026-09-01_offline_payment_or_sequence.sql.
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
BEGIN
  IF NEW.or_number IS NULL OR btrim(NEW.or_number) = '' THEN
    NEW.or_number := public.get_next_or_number();
    RETURN NEW;
  END IF;

  IF NEW.or_number ~ '^OR-[0-9]{4}-[0-9]{6}$' THEN
    supplied_year := SUBSTRING(NEW.or_number FROM '^OR-(\d{4})-')::INTEGER;
    supplied_seq := SUBSTRING(NEW.or_number FROM '(\d{6})$')::INTEGER;
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

-- Prevent two payment rows from ever carrying the same official OR. NULL
-- remains allowed for old rows that predate OR numbering.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_or_number_unique
    ON public.payments (or_number)
    WHERE or_number IS NOT NULL AND btrim(or_number) <> '';

GRANT EXECUTE ON FUNCTION public.get_next_or_number() TO anon, authenticated;

-- Role helper functions
CREATE OR REPLACE FUNCTION public.has_role(required_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = $1
    );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
        AND role IN ('admin', 'secretary', 'treasurer', 'auditor', 'board-member')
    );
$$;

-- Get student requirement files
CREATE OR REPLACE FUNCTION public.get_student_requirement_files(p_student_id TEXT)
RETURNS SETOF public.student_requirement_files
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT f.*
    FROM public.student_requirement_files f
    WHERE f.is_published = true
    AND (
        f.restricted = false
        OR EXISTS (
            SELECT 1 FROM public.student_requirement_file_access a
            WHERE a.file_id = f.id AND a.student_id = p_student_id
        )
    )
    ORDER BY f.created_at DESC;
$$;

-- ============================================================
-- 5. FINANCIAL REPORT FUNCTION (FIXED)
-- ============================================================
-- FIX: Properly separates general vs event-specific funds
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_financial_report()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH contribution_totals AS (
    SELECT
        student_id,
        event_id,
        SUM(GREATEST(COALESCE(amount_paid, 0), 0)) AS contribution_amount
    FROM public.contributions
    GROUP BY student_id, event_id
),

payment_totals AS (
    SELECT
        student_id,
        event_id,
        SUM(GREATEST(COALESCE(amount, 0), 0)) AS payment_amount
    FROM public.payments
    WHERE event_id IS NOT NULL
    GROUP BY student_id, event_id
),

student_event_collections AS (
    SELECT
        COALESCE(c.student_id, p.student_id) AS student_id,
        COALESCE(c.event_id, p.event_id) AS event_id,
        GREATEST(
            COALESCE(c.contribution_amount, 0),
            COALESCE(p.payment_amount, 0)
        ) AS collected
    FROM contribution_totals c
    FULL OUTER JOIN payment_totals p
        ON c.student_id = p.student_id
        AND c.event_id = p.event_id
),

collection_by_event AS (
    SELECT
        event_id,
        SUM(collected) AS total_collected
    FROM student_event_collections
    GROUP BY event_id
),

-- Separate general income from event-specific income
general_income AS (
    SELECT COALESCE(SUM(GREATEST(COALESCE(amount, 0), 0)), 0) AS total_general_income
    FROM public.transactions
    WHERE type = 'income'
      AND event_id IS NULL
),

general_expenses AS (
    SELECT COALESCE(SUM(GREATEST(COALESCE(amount, 0), 0)), 0) AS total_general_expenses
    FROM public.transactions
    WHERE type = 'expense'
      AND event_id IS NULL
),

event_income AS (
    SELECT
        event_id,
        SUM(GREATEST(COALESCE(amount, 0), 0)) AS total_income
    FROM public.transactions
    WHERE type = 'income'
      AND event_id IS NOT NULL
    GROUP BY event_id
),

event_expenses AS (
    SELECT
        event_id,
        SUM(GREATEST(COALESCE(amount, 0), 0)) AS total_expenses
    FROM public.transactions
    WHERE type = 'expense'
      AND event_id IS NOT NULL
    GROUP BY event_id
),

event_data AS (
    SELECT
        e.id AS event_id,
        e.name AS event_name,
        GREATEST(COALESCE(e.allocation_amount, 0), 0) AS allocation_amount,
        
        -- Event collections (contributions + payments)
        COALESCE(c.total_collected, 0) AS event_collections,
        
        -- Event income from transactions
        COALESCE(i.total_income, 0) AS event_income,
        
        -- Event expenses from transactions
        COALESCE(ex.total_expenses, 0) AS event_expenses,
        
        -- Total collected for this event = collections + event income
        COALESCE(c.total_collected, 0) + COALESCE(i.total_income, 0) AS total_collected,
        
        -- Total spent for this event = event expenses only
        COALESCE(ex.total_expenses, 0) AS total_spent

    FROM public.events e

    LEFT JOIN collection_by_event c
        ON c.event_id = e.id

    LEFT JOIN event_income i
        ON i.event_id = e.id

    LEFT JOIN event_expenses ex
        ON ex.event_id = e.id
),

summary AS (
    SELECT
        -- Total budget = sum of all event allocations
        COALESCE(SUM(allocation_amount), 0) AS total_budget,
        
        -- Total funds collected = event collections + general income
        COALESCE(SUM(total_collected), 0) + COALESCE((SELECT total_general_income FROM general_income), 0) AS total_funds_collected,
        
        -- Total funds spent = event expenses + general expenses
        COALESCE(SUM(total_spent), 0) + COALESCE((SELECT total_general_expenses FROM general_expenses), 0) AS total_funds_spent,
        
        -- Total event-specific collections
        COALESCE(SUM(total_collected), 0) AS total_event_collections,
        
        -- Total event-specific expenses
        COALESCE(SUM(total_spent), 0) AS total_event_expenses,
        
        -- General income
        COALESCE((SELECT total_general_income FROM general_income), 0) AS general_income,
        
        -- General expenses
        COALESCE((SELECT total_general_expenses FROM general_expenses), 0) AS general_expenses,
        
        -- Student count
        (SELECT COUNT(*) FROM public.students) AS student_count
    FROM event_data
),

expected AS (
    SELECT
        COALESCE(
            SUM(
                GREATEST(COALESCE(e.allocation_amount, 0), 0)
            ) * COUNT(s.id),
            0
        ) AS total_expected
    FROM public.events e
    CROSS JOIN public.students s
)

SELECT jsonb_build_object(
    'summary',
    jsonb_build_object(
        'totalBudget',
        summary.total_budget,

        'totalFundsCollected',
        summary.total_funds_collected,

        'totalFundsSpent',
        summary.total_funds_spent,

        'remainingBudget',
        summary.total_funds_collected - summary.total_funds_spent,

        'totalExpectedContributions',
        expected.total_expected,
        
        -- Additional useful fields
        'totalEventCollections',
        summary.total_event_collections,
        
        'totalEventExpenses',
        summary.total_event_expenses,
        
        'generalIncome',
        summary.general_income,
        
        'generalExpenses',
        summary.general_expenses,
        
        'studentCount',
        summary.student_count
    ),

    'eventAllocations',
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'eventId', event_id,
                    'eventName', event_name,
                    'allocationAmount', allocation_amount,
                    'eventCollections', event_collections,
                    'eventIncome', event_income,
                    'eventExpenses', event_expenses,
                    'totalCollected', total_collected,
                    'totalSpent', total_spent,
                    'remainingBalance',
                        total_collected - total_spent
                )
                ORDER BY event_name
            )
            FROM event_data
        ),
        '[]'::jsonb
    )
)

FROM summary
CROSS JOIN expected;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_report()
TO anon, authenticated;
-- ============================================================
-- 5.5 CONTRIBUTION TOTALS FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_contribution_totals()
RETURNS TABLE (
    total_required BIGINT,
    total_paid BIGINT,
    total_balance BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        COALESCE(SUM(GREATEST(COALESCE(required_amount, 0), 0)), 0)::BIGINT,
        COALESCE(SUM(GREATEST(COALESCE(amount_paid, 0), 0)), 0)::BIGINT,
        COALESCE(SUM(GREATEST(COALESCE(remaining_balance, 0), 0)), 0)::BIGINT
    FROM public.contributions;
$$;

GRANT EXECUTE ON FUNCTION public.get_contribution_totals()
TO anon, authenticated;
-- ============================================================
-- 6. CONTRIBUTION TRIGGERS
-- ============================================================

-- Auto-create contributions when student is created
CREATE OR REPLACE FUNCTION public.create_student_contributions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.contributions (
        id,
        student_id,
        event_id,
        event_name,
        required_amount,
        amount_paid,
        remaining_balance
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
    ON CONFLICT (student_id, event_id)
    DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_student_contributions ON public.students;
CREATE TRIGGER trg_create_student_contributions
    AFTER INSERT ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION public.create_student_contributions();

-- Auto-create contributions when event is created
CREATE OR REPLACE FUNCTION public.create_event_contributions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.contributions (
        id,
        student_id,
        event_id,
        event_name,
        required_amount,
        amount_paid,
        remaining_balance
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
    ON CONFLICT (student_id, event_id)
    DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_event_contributions ON public.events;
CREATE TRIGGER trg_create_event_contributions
    AFTER INSERT ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION public.create_event_contributions();

-- Sync event changes to contributions
CREATE OR REPLACE FUNCTION public.sync_event_contributions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Event name changed
    IF NEW.name IS DISTINCT FROM OLD.name THEN
        UPDATE public.contributions
        SET event_name = NEW.name
        WHERE event_id = NEW.id;
    END IF;

    -- Allocation amount changed
    IF NEW.allocation_amount IS DISTINCT FROM OLD.allocation_amount THEN
        UPDATE public.contributions
        SET
            required_amount = NEW.allocation_amount,
            remaining_balance = GREATEST(
                NEW.allocation_amount - amount_paid,
                0
            )
        WHERE event_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_event_contributions ON public.events;
CREATE TRIGGER trg_sync_event_contributions
    AFTER UPDATE OF name, allocation_amount
    ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_event_contributions();

-- ============================================================
-- 7. BACKFILL CONTRIBUTIONS
-- ============================================================

INSERT INTO public.contributions (
    id,
    student_id,
    event_id,
    event_name,
    required_amount,
    amount_paid,
    remaining_balance
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
ON CONFLICT (student_id, event_id)
DO NOTHING;

-- ============================================================
-- 8. STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('student-requirements', 'student-requirements', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 9. REALTIME PUBLICATION
-- ============================================================

DO $$
DECLARE
    source_table text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH source_table IN ARRAY ARRAY[
            'students', 'events', 'board_members', 'attendance',
            'contributions', 'payments', 'transactions', 'feedback',
            'financial_summaries', 'event_allocations',
            'student_requirement_files', 'student_requirement_file_access'
        ]
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM pg_publication_tables
                WHERE pubname = 'supabase_realtime'
                AND schemaname = 'public'
                AND tablename = source_table
            ) AND EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = source_table
            ) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', source_table);
            END IF;
        END LOOP;
    END IF;
END $$;

-- ============================================================
-- 10. GRANTS
-- ============================================================

GRANT SELECT ON public.user_roles TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_or_number() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_requirement_files(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_report() TO anon, authenticated;
GRANT INSERT ON TABLE public.feedback TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_contribution_totals() TO anon, authenticated;



DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'publishable') THEN
        GRANT SELECT ON public.user_roles TO publishable;
        GRANT EXECUTE ON FUNCTION public.get_next_or_number() TO publishable;
        GRANT EXECUTE ON FUNCTION public.get_student_requirement_files(TEXT) TO publishable;
        GRANT EXECUTE ON FUNCTION public.get_financial_report() TO publishable;
        GRANT EXECUTE ON FUNCTION public.get_contribution_totals() TO publishable;
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO publishable';
    END IF;
END $$;

COMMIT;

-- ============================================================
-- 11. VALIDATION
-- ============================================================

DO $$
DECLARE
    table_count INTEGER;
    function_count INTEGER;
    trigger_count INTEGER;
BEGIN
    -- Count tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN (
        'students', 'events', 'board_members', 'attendance',
        'contributions', 'payments', 'or_sequence', 'transactions',
        'feedback', 'user_roles',
        'student_requirement_files', 'student_requirement_file_access'
    );
    
    -- Count functions
    SELECT COUNT(*) INTO function_count
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
   AND proname IN ('has_role', 'is_staff', 'get_next_or_number',
                'assign_payment_or_number',
                'get_student_requirement_files', 'get_financial_report',
                'get_contribution_totals',
                'create_student_contributions', 'create_event_contributions',
                'sync_event_contributions');
    
    -- Count triggers
    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger
    WHERE tgrelid IN (
        'public.students'::regclass,
        'public.events'::regclass
    )
    AND tgname LIKE 'trg_%_contributions';
    
    RAISE NOTICE '=== MIGRATION SUMMARY ===';
    RAISE NOTICE 'Tables created: %', table_count;
    RAISE NOTICE 'Functions created: %', function_count;
    RAISE NOTICE 'Triggers created: %', trigger_count;
    
    -- Test financial report function
    RAISE NOTICE 'Testing financial report function...';
    PERFORM public.get_financial_report();
    RAISE NOTICE '✅ Financial report function works!';
    
    IF table_count >= 12 AND function_count >= 10 AND trigger_count >= 3 THEN
        RAISE NOTICE '✅ Schema migration completed successfully!';
    ELSE
        RAISE NOTICE '⚠️ Some objects may be missing. Check above counts.';
    END IF;
END $$;