--
-- PostgreSQL database dump
--

\restrict zMXPfJ2yIKIWktj5GK18rcbi6ZEejqok4VEaI08kVOzovgv5xaGIQJ3CVX1E5SU

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: assign_payment_or_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.assign_payment_or_number() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  current_yr INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  supplied_year INTEGER;
  supplied_seq INTEGER;
  current_seq INTEGER;
  candidate TEXT;
BEGIN
  -- No OR supplied: always reserve one from the authoritative sequence.
  IF NEW.or_number IS NULL OR btrim(NEW.or_number) = '' THEN
    NEW.or_number := public.get_next_or_number();
    RETURN NEW;
  END IF;

  -- A legacy/client-generated OR is accepted only if it is a valid number for
  -- the current year and is ahead of the current sequence. Otherwise replace
  -- it with the next server-generated number. This handles offline clients
  -- that reconnect with an old local OR such as OR-2026-000001.
  IF NEW.or_number ~ '^OR-[0-9]{4}-[0-9]{6}$' THEN
    supplied_year := SUBSTRING(NEW.or_number FROM '^OR-(\\d{4})-')::INTEGER;
    supplied_seq := SUBSTRING(NEW.or_number FROM '(\\d{6})$')::INTEGER;
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

  -- If the supplied number is exactly the next number, reserve it by moving
  -- the sequence forward. If it is behind/already used, allocate a new one.
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

  -- Do not allow a client to jump the sequence arbitrarily. Reserve the next
  -- number instead, keeping numbering continuous.
  UPDATE public.or_sequence
     SET last_used = last_used + 1
   WHERE year = current_yr
   RETURNING last_used INTO current_seq;

  NEW.or_number := 'OR-' || current_yr::TEXT || '-' || LPAD(current_seq::TEXT, 6, '0');
  RETURN NEW;
END;
$_$;


ALTER FUNCTION public.assign_payment_or_number() OWNER TO postgres;

--
-- Name: create_event_contributions(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION public.create_event_contributions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  WHERE NEW.allocation_amount > 0

  ON CONFLICT (student_id, event_id)
  DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.create_event_contributions() OWNER TO postgres;

--
-- Name: create_student_contributions(); Type: FUNCTION; Schema: public; Owner: postgres
--


CREATE OR REPLACE FUNCTION public.create_student_contributions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  WHERE e.allocation_amount > 0

  ON CONFLICT (student_id, event_id)
  DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.create_student_contributions() OWNER TO postgres;

--
-- Name: get_contribution_totals(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_contribution_totals() RETURNS TABLE(total_required bigint, total_paid bigint, total_balance bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT
        COALESCE(SUM(GREATEST(COALESCE(required_amount, 0), 0)), 0)::BIGINT,
        COALESCE(SUM(GREATEST(COALESCE(amount_paid, 0), 0)), 0)::BIGINT,
        COALESCE(SUM(GREATEST(COALESCE(remaining_balance, 0), 0)), 0)::BIGINT
    FROM public.contributions;
$$;


ALTER FUNCTION public.get_contribution_totals() OWNER TO postgres;

--
-- Name: get_event_contribution_totals(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_event_contribution_totals() RETURNS TABLE(event_id text, collected bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT
        contributions.event_id,
        COALESCE(SUM(GREATEST(COALESCE(amount_paid, 0), 0)), 0)::BIGINT
    FROM public.contributions
    GROUP BY contributions.event_id;
$$;


ALTER FUNCTION public.get_event_contribution_totals() OWNER TO postgres;

--
-- Name: get_financial_report(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_financial_report() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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

transaction_totals AS (
    SELECT
        COALESCE(SUM(
            CASE
                WHEN type = 'income'
                THEN GREATEST(COALESCE(amount, 0), 0)
                ELSE 0
            END
        ), 0) AS ledger_income,

        COALESCE(SUM(
            CASE
                WHEN type <> 'income'
                THEN GREATEST(COALESCE(amount, 0), 0)
                ELSE 0
            END
        ), 0) AS total_spent
    FROM public.transactions
),

income_by_event AS (
    SELECT
        event_id,
        SUM(GREATEST(COALESCE(amount, 0), 0)) AS total_income
    FROM public.transactions
    WHERE type = 'income'
      AND event_id IS NOT NULL
    GROUP BY event_id
),

spent_by_event AS (
    SELECT
        event_id,
        SUM(GREATEST(COALESCE(amount, 0), 0)) AS total_spent
    FROM public.transactions
    WHERE type <> 'income'
      AND event_id IS NOT NULL
    GROUP BY event_id
),

event_data AS (
    SELECT
        e.id AS event_id,
        e.name AS event_name,
        GREATEST(COALESCE(e.allocation_amount, 0), 0) AS allocation_amount,

        COALESCE(c.total_collected, 0)
            + COALESCE(i.total_income, 0) AS total_collected,

        COALESCE(s.total_spent, 0) AS total_spent

    FROM public.events e

    LEFT JOIN collection_by_event c
        ON c.event_id = e.id

    LEFT JOIN income_by_event i
        ON i.event_id = e.id

    LEFT JOIN spent_by_event s
        ON s.event_id = e.id
),

summary AS (
    SELECT
        COALESCE(SUM(allocation_amount), 0) AS total_budget,

        COALESCE(
            SUM(total_collected),
            0
        ) AS total_funds_collected,

        COALESCE(
            SUM(total_spent),
            0
        ) AS event_spent,

        (
            SELECT ledger_income
            FROM transaction_totals
        ) AS ledger_income,

        (
            SELECT total_spent
            FROM transaction_totals
        ) AS total_funds_spent,

        (
            SELECT COUNT(*)
            FROM public.students
        ) AS student_count
    FROM event_data
),

expected AS (
    SELECT
        COALESCE(
            SUM(
                GREATEST(COALESCE(e.allocation_amount, 0), 0)
            ),
            0
        ) * (
            SELECT COUNT(*)
            FROM public.students
        ) AS total_expected
    FROM public.events e
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
        expected.total_expected
    ),

    'eventAllocations',
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'eventId', event_id,
                    'eventName', event_name,
                    'allocationAmount', allocation_amount,
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


ALTER FUNCTION public.get_financial_report() OWNER TO postgres;

--
-- Name: get_next_or_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_next_or_number() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.get_next_or_number() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: student_requirement_files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_requirement_files (
    id text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text,
    file_url text NOT NULL,
    file_name text DEFAULT ''::text NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    file_type text DEFAULT ''::text,
    is_published boolean DEFAULT false NOT NULL,
    created_by text DEFAULT ''::text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL,
    updated_at text DEFAULT ''::text NOT NULL,
    restricted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.student_requirement_files OWNER TO postgres;

--
-- Name: get_student_requirement_files(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_student_requirement_files(p_student_id text) RETURNS SETOF public.student_requirement_files
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT f.*
  FROM public.student_requirement_files f
  WHERE f.is_published = true
    AND (
      f.restricted = false
      OR EXISTS (
        SELECT 1
        FROM public.student_requirement_file_access a
        WHERE a.file_id = f.id AND a.student_id = p_student_id
      )
    )
  ORDER BY f.created_at DESC;
$$;


ALTER FUNCTION public.get_student_requirement_files(p_student_id text) OWNER TO postgres;

--
-- Name: has_role(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.has_role(required_role text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = $1
  );
$_$;


ALTER FUNCTION public.has_role(required_role text) OWNER TO postgres;

--
-- Name: is_staff(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'secretary', 'treasurer', 'auditor', 'board-member')
  );
$$;


ALTER FUNCTION public.is_staff() OWNER TO postgres;

--
-- Name: set_payment_recorded_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_payment_recorded_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.recorded_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_payment_recorded_at() OWNER TO postgres;

--
-- Name: notify_on_deadline_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_on_deadline_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.contribution_deadline = '' THEN
    INSERT INTO public.notifications
      (id, recipient_kind, type, title, body, link, created_at)
    VALUES (
      gen_random_uuid()::text, 'all_students', 'deadline',
      'Deadline removed: ' || NEW.name,
      'The contribution deadline for ' || NEW.name || ' has been removed.',
      NULL,
      now()::text
    );
  ELSE
    INSERT INTO public.notifications
      (id, recipient_kind, type, title, body, link, created_at)
    VALUES (
      gen_random_uuid()::text, 'all_students', 'deadline',
      'Deadline updated: ' || NEW.name,
      'The contribution deadline for ' || NEW.name || ' is now ' || NEW.contribution_deadline || '.',
      NULL,
      now()::text
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.notify_on_deadline_change() OWNER TO postgres;

--
-- Name: notify_on_payment(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_on_payment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.notifications
    (id, recipient_kind, recipient_student_id, type, title, body, link, created_at)
  VALUES (
    gen_random_uuid()::text, 'student', NEW.student_id, 'payment',
    'Payment recorded',
    'A payment of ₱' || NEW.amount || ' for ' || COALESCE(NEW.event_name, 'your contribution')
      || ' was recorded' || CASE WHEN NEW.or_number IS NOT NULL THEN ' (OR ' || NEW.or_number || ').' ELSE '.' END,
    NULL,
    now()::text
  );

  INSERT INTO public.notifications
    (id, recipient_kind, type, title, body, link, created_at)
  VALUES (
    gen_random_uuid()::text, 'all_officers', 'payment',
    'New payment recorded',
    COALESCE(NEW.student_name, NEW.student_id) || ' paid ₱' || NEW.amount
      || ' for ' || COALESCE(NEW.event_name, 'an event') || '.',
    'payment-management',
    now()::text
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.notify_on_payment() OWNER TO postgres;

--
-- Name: notify_on_requirement_file_published(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_on_requirement_file_published() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  access_row RECORD;
BEGIN
  IF NEW.is_published = true AND (TG_OP = 'INSERT' OR OLD.is_published = false) THEN
    IF NEW.restricted THEN
      FOR access_row IN
        SELECT student_id FROM public.student_requirement_file_access WHERE file_id = NEW.id
      LOOP
        INSERT INTO public.notifications
          (id, recipient_kind, recipient_student_id, type, title, body, link, created_at)
        VALUES (
          gen_random_uuid()::text, 'student', access_row.student_id, 'file',
          'New file: ' || NEW.title,
          'A new requirement file has been published for you.',
          NULL,
          now()::text
        );
      END LOOP;
    ELSE
      INSERT INTO public.notifications
        (id, recipient_kind, type, title, body, link, created_at)
      VALUES (
        gen_random_uuid()::text, 'all_students', 'file',
        'New file: ' || NEW.title,
        'A new requirement file has been published.',
        NULL,
        now()::text
      );
    END IF;

    INSERT INTO public.notifications
      (id, recipient_kind, type, title, body, link, created_at)
    VALUES (
      gen_random_uuid()::text, 'all_officers', 'file',
      'File published: ' || NEW.title,
      'Requirement file "' || NEW.title || '" was published'
        || CASE WHEN NEW.restricted THEN ' (restricted to selected students).' ELSE ' (visible to all students).' END,
      'requirement-files-management',
      now()::text
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.notify_on_requirement_file_published() OWNER TO postgres;

--
-- Name: notify_upcoming_deadlines(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.notify_upcoming_deadlines() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  ev RECORD;
  has_unpaid BOOLEAN;
  due_today_body TEXT;
  week_out_body TEXT;
BEGIN
  -- Due today: one broadcast to all students, only if someone still owes.
  FOR ev IN
    SELECT id, name FROM public.events
    WHERE contribution_deadline <> '' AND contribution_deadline::date = current_date
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.contributions
      WHERE event_id = ev.id AND remaining_balance > 0
    ) INTO has_unpaid;

    IF has_unpaid THEN
      due_today_body := ev.name || ' contribution is due today.';

      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE type = 'deadline' AND recipient_kind = 'all_students'
          AND body = due_today_body AND created_at::date = current_date
      ) THEN
        INSERT INTO public.notifications
          (id, recipient_kind, type, title, body, link, created_at)
        VALUES (
          gen_random_uuid()::text, 'all_students', 'deadline',
          'Contribution deadline reached',
          due_today_body,
          NULL,
          now()::text
        );
      END IF;
    END IF;
  END LOOP;

  -- 1 week out: one broadcast to all students, regardless of payment status.
  FOR ev IN
    SELECT id, name FROM public.events
    WHERE contribution_deadline <> ''
      AND contribution_deadline::date = current_date + INTERVAL '7 days'
  LOOP
    week_out_body := ev.name || ' contribution is due in 1 week.';

    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE type = 'deadline' AND recipient_kind = 'all_students'
        AND body = week_out_body AND created_at::date = current_date
    ) THEN
      INSERT INTO public.notifications
        (id, recipient_kind, type, title, body, link, created_at)
      VALUES (
        gen_random_uuid()::text, 'all_students', 'deadline',
        'Contribution deadline in 1 week',
        week_out_body,
        NULL,
        now()::text
      );
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION public.notify_upcoming_deadlines() OWNER TO postgres;

--
-- Name: sync_event_contributions(); Type: FUNCTION; Schema: public; Owner: postgres
--


CREATE OR REPLACE FUNCTION public.sync_event_contributions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN

  -- ----------------------------------------------------------
  -- Event name changed
  -- ----------------------------------------------------------
  IF NEW.name IS DISTINCT FROM OLD.name THEN

    UPDATE public.contributions
    SET event_name = NEW.name
    WHERE event_id = NEW.id;

  END IF;


  -- ----------------------------------------------------------
  -- Allocation amount changed
  -- ----------------------------------------------------------
  IF NEW.allocation_amount IS DISTINCT FROM OLD.allocation_amount THEN

    -- If the event now has a positive allocation,
    -- make sure every student has a contribution record.
    IF NEW.allocation_amount > 0 THEN

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
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.contributions c
        WHERE c.student_id = s.id
          AND c.event_id = NEW.id
      )
      ON CONFLICT (student_id, event_id)
      DO NOTHING;

    END IF;


    -- Update existing contribution records.
    -- This preserves payment history while changing
    -- the amount currently required.
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


ALTER FUNCTION public.sync_event_contributions() OWNER TO postgres;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance (
    id text NOT NULL,
    student_id text NOT NULL,
    event_id text NOT NULL,
    event_name text DEFAULT ''::text NOT NULL,
    date text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'present'::text NOT NULL,
    session text DEFAULT 'morning'::text NOT NULL,
    time_in text DEFAULT ''::text NOT NULL,
    time_out text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.attendance OWNER TO postgres;

--
-- Name: board_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.board_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    account_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT board_members_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);


ALTER TABLE public.board_members OWNER TO postgres;

--
-- Name: contributions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contributions (
    id text NOT NULL,
    student_id text NOT NULL,
    event_id text NOT NULL,
    event_name text DEFAULT ''::text NOT NULL,
    required_amount integer DEFAULT 0 NOT NULL,
    amount_paid integer DEFAULT 0 NOT NULL,
    remaining_balance integer DEFAULT 0 NOT NULL,
    CONSTRAINT contributions_amount_paid_nonnegative CHECK ((amount_paid >= 0)),
    CONSTRAINT contributions_remaining_balance_nonnegative CHECK ((remaining_balance >= 0)),
    CONSTRAINT contributions_required_amount_nonnegative CHECK ((required_amount >= 0))
);


ALTER TABLE public.contributions OWNER TO postgres;

--
-- Name: event_allocations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_allocations (
    id text NOT NULL,
    event_id text NOT NULL,
    event_name text DEFAULT ''::text NOT NULL,
    allocation_amount integer DEFAULT 0 NOT NULL,
    total_collected integer DEFAULT 0 NOT NULL,
    total_spent integer DEFAULT 0 NOT NULL,
    remaining_balance integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.event_allocations OWNER TO postgres;

--
-- Name: event_evaluations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.event_evaluations (
    id text NOT NULL,
    event_id text NOT NULL,
    student_id text NOT NULL,
    student_name text DEFAULT ''::text NOT NULL,
    submitted_at text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.event_evaluations OWNER TO postgres;

--
-- Name: events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.events (
    id text NOT NULL,
    name text NOT NULL,
    allocation_amount integer DEFAULT 0 NOT NULL,
    date text,
    time_in text DEFAULT ''::text NOT NULL,
    time_out text DEFAULT ''::text NOT NULL,
    morning_time_in text DEFAULT ''::text NOT NULL,
    morning_time_out text DEFAULT ''::text NOT NULL,
    afternoon_time_in text DEFAULT ''::text NOT NULL,
    afternoon_time_out text DEFAULT ''::text NOT NULL,
    schedules jsonb DEFAULT '[]'::jsonb,
    evening_time_in text DEFAULT ''::text NOT NULL,
    evening_time_out text DEFAULT ''::text NOT NULL,
    assigned_member_ids text[] DEFAULT '{}'::text[] NOT NULL,
    assigned_member_names text[] DEFAULT '{}'::text[] NOT NULL,
    contribution_deadline text DEFAULT ''::text NOT NULL,
    evaluation_active boolean DEFAULT false NOT NULL,
    evaluation_form_url text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.events OWNER TO postgres;

--
-- Name: feedback; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feedback (
    id text NOT NULL,
    type text NOT NULL,
    title text,
    message text NOT NULL,
    student_name text,
    student_id text,
    is_anonymous boolean DEFAULT false NOT NULL,
    submitted_at text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT feedback_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in-progress'::text, 'resolved'::text]))),
    CONSTRAINT feedback_type_check CHECK ((type = ANY (ARRAY['inquiry'::text, 'complaint'::text, 'suggestion'::text])))
);


ALTER TABLE public.feedback OWNER TO postgres;

--
-- Name: financial_summaries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.financial_summaries (
    id text NOT NULL,
    total_budget integer DEFAULT 0 NOT NULL,
    total_funds_collected integer DEFAULT 0 NOT NULL,
    total_funds_spent integer DEFAULT 0 NOT NULL,
    remaining_budget integer DEFAULT 0 NOT NULL,
    total_expected_contributions integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.financial_summaries OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    recipient_kind text NOT NULL,
    recipient_user_id uuid,
    recipient_student_id text,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    link text,
    read_at text,
    created_at text DEFAULT ''::text NOT NULL,
    CONSTRAINT notifications_recipient_kind_check CHECK ((recipient_kind = ANY (ARRAY['officer'::text, 'all_officers'::text, 'student'::text, 'all_students'::text]))),
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['payment'::text, 'file'::text, 'deadline'::text, 'announcement'::text])))
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: or_sequence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.or_sequence (
    year integer NOT NULL,
    last_used integer DEFAULT 0 NOT NULL,
    CONSTRAINT or_sequence_last_used_check CHECK ((last_used >= 0)),
    CONSTRAINT or_sequence_year_check CHECK ((year >= 2000))
);


ALTER TABLE public.or_sequence OWNER TO postgres;

--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id text NOT NULL,
    student_id text NOT NULL,
    student_name text DEFAULT ''::text NOT NULL,
    event_id text,
    event_name text,
    amount integer DEFAULT 0 NOT NULL,
    date text DEFAULT ''::text NOT NULL,
    receipt_url text,
    or_number text,
    recorded_by text DEFAULT ''::text NOT NULL,
    contribution_id text,
    recorded_at timestamp with time zone
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    actor_user_id uuid,
    actor_name text NOT NULL,
    actor_role text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    description text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.push_subscriptions (
    id text NOT NULL,
    subscriber_kind text NOT NULL,
    officer_user_id uuid,
    student_id text,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth_key text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL,
    CONSTRAINT push_subscriptions_subscriber_kind_check CHECK ((subscriber_kind = ANY (ARRAY['officer'::text, 'student'::text, 'anonymous'::text])))
);


ALTER TABLE public.push_subscriptions OWNER TO postgres;

--
-- Name: student_requirement_file_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_requirement_file_access (
    file_id text NOT NULL,
    student_id text NOT NULL,
    created_at text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.student_requirement_file_access OWNER TO postgres;

--
-- Name: students; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.students (
    id text NOT NULL,
    student_id text NOT NULL,
    name text NOT NULL,
    program text NOT NULL,
    year_level integer DEFAULT 0 NOT NULL,
    section text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.students OWNER TO postgres;

--
-- Name: transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transactions (
    id text NOT NULL,
    date text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    event_id text,
    event_name text,
    amount integer DEFAULT 0 NOT NULL,
    type text DEFAULT 'income'::text NOT NULL,
    responsible_officer text DEFAULT ''::text NOT NULL,
    receipt_url text,
    CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])))
);


ALTER TABLE public.transactions OWNER TO postgres;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_roles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'secretary'::text, 'treasurer'::text, 'auditor'::text, 'board-member'::text])))
);


ALTER TABLE public.user_roles OWNER TO postgres;

--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: board_members board_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.board_members
    ADD CONSTRAINT board_members_pkey PRIMARY KEY (id);


--
-- Name: contributions contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contributions
    ADD CONSTRAINT contributions_pkey PRIMARY KEY (id);


--
-- Name: event_allocations event_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_allocations
    ADD CONSTRAINT event_allocations_pkey PRIMARY KEY (id);


--
-- Name: event_evaluations event_evaluations_event_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_evaluations
    ADD CONSTRAINT event_evaluations_event_id_student_id_key UNIQUE (event_id, student_id);


--
-- Name: event_evaluations event_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_evaluations
    ADD CONSTRAINT event_evaluations_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: financial_summaries financial_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.financial_summaries
    ADD CONSTRAINT financial_summaries_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: or_sequence or_sequence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.or_sequence
    ADD CONSTRAINT or_sequence_pkey PRIMARY KEY (year);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: student_requirement_file_access student_requirement_file_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_requirement_file_access
    ADD CONSTRAINT student_requirement_file_access_pkey PRIMARY KEY (file_id, student_id);


--
-- Name: student_requirement_files student_requirement_files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_requirement_files
    ADD CONSTRAINT student_requirement_files_pkey PRIMARY KEY (id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id);


--
-- Name: idx_attendance_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_event_id ON public.attendance USING btree (event_id);


--
-- Name: idx_attendance_student_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_student_id ON public.attendance USING btree (student_id);


--
-- Name: idx_board_members_account_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_board_members_account_user_id ON public.board_members USING btree (account_user_id);


--
-- Name: idx_board_members_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_board_members_name ON public.board_members USING btree (lower(name));


--
-- Name: idx_contributions_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contributions_event_id ON public.contributions USING btree (event_id);


--
-- Name: idx_contributions_student_event_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_contributions_student_event_unique ON public.contributions USING btree (student_id, event_id);


--
-- Name: idx_contributions_student_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contributions_student_id ON public.contributions USING btree (student_id);


--
-- Name: idx_event_allocations_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_allocations_event_id ON public.event_allocations USING btree (event_id);


--
-- Name: idx_event_evaluations_event_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_event_evaluations_event_student ON public.event_evaluations USING btree (event_id, student_id);


--
-- Name: idx_notifications_officer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_officer ON public.notifications USING btree (recipient_user_id, read_at) WHERE (recipient_kind = 'officer'::text);


--
-- Name: idx_notifications_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_student ON public.notifications USING btree (recipient_student_id) WHERE (recipient_kind = 'student'::text);


--
-- Name: idx_payments_contribution_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_contribution_id ON public.payments USING btree (contribution_id);


--
-- Name: idx_payments_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_event_id ON public.payments USING btree (event_id);


--
-- Name: idx_payments_or_number_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_payments_or_number_unique ON public.payments USING btree (or_number) WHERE ((or_number IS NOT NULL) AND (btrim(or_number) <> ''::text));


--
-- Name: idx_payments_recorded_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_recorded_at ON public.payments USING btree (recorded_at DESC);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_entity_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs USING btree (entity_type);


--
-- Name: idx_payments_student_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_student_id ON public.payments USING btree (student_id);


--
-- Name: idx_student_req_file_access_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_req_file_access_student ON public.student_requirement_file_access USING btree (student_id);


--
-- Name: idx_student_requirement_files_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_requirement_files_created_at ON public.student_requirement_files USING btree (created_at);


--
-- Name: idx_student_requirement_files_published; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_requirement_files_published ON public.student_requirement_files USING btree (is_published);


--
-- Name: idx_transactions_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transactions_event_id ON public.transactions USING btree (event_id);


--
-- Name: payments payments_assign_or_number; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER payments_assign_or_number BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.assign_payment_or_number();


--
-- Name: payments payments_set_recorded_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER payments_set_recorded_at BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_payment_recorded_at();


--
-- Name: notifications send-push; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "send-push" AFTER INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://coffdunxakbrmnnplyoc.supabase.co/functions/v1/send-push', 'POST', '{"Content-type":"application/json","Authorization":"Bearer <Secret Key>"}', '{}', '5000');


--
-- Name: events trg_create_event_contributions; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_create_event_contributions AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.create_event_contributions();


--
-- Name: students trg_create_student_contributions; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_create_student_contributions AFTER INSERT ON public.students FOR EACH ROW EXECUTE FUNCTION public.create_student_contributions();


--
-- Name: events trg_notify_on_deadline_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notify_on_deadline_change AFTER UPDATE ON public.events FOR EACH ROW WHEN ((new.contribution_deadline IS DISTINCT FROM old.contribution_deadline)) EXECUTE FUNCTION public.notify_on_deadline_change();


--
-- Name: payments trg_notify_on_payment; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notify_on_payment AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.notify_on_payment();


--
-- Name: student_requirement_files trg_notify_on_requirement_file_published; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_notify_on_requirement_file_published AFTER INSERT OR UPDATE ON public.student_requirement_files FOR EACH ROW EXECUTE FUNCTION public.notify_on_requirement_file_published();


--
-- Name: events trg_sync_event_contributions; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_event_contributions AFTER UPDATE OF name, allocation_amount ON public.events FOR EACH ROW EXECUTE FUNCTION public.sync_event_contributions();


--
-- Name: attendance attendance_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: board_members board_members_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.board_members
    ADD CONSTRAINT board_members_account_user_id_fkey FOREIGN KEY (account_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: contributions contributions_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contributions
    ADD CONSTRAINT contributions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: contributions contributions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contributions
    ADD CONSTRAINT contributions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: event_evaluations event_evaluations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.event_evaluations
    ADD CONSTRAINT event_evaluations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_student_id_fkey FOREIGN KEY (recipient_student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_contribution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_contribution_id_fkey FOREIGN KEY (contribution_id) REFERENCES public.contributions(id) ON DELETE CASCADE;


--
-- Name: payments payments_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: payments payments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: push_subscriptions push_subscriptions_officer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_officer_user_id_fkey FOREIGN KEY (officer_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: student_requirement_file_access student_requirement_file_access_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_requirement_file_access
    ADD CONSTRAINT student_requirement_file_access_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.student_requirement_files(id) ON DELETE CASCADE;


--
-- Name: student_requirement_file_access student_requirement_file_access_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_requirement_file_access
    ADD CONSTRAINT student_requirement_file_access_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance attendance_read_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY attendance_read_public ON public.attendance FOR SELECT USING (true);


--
-- Name: attendance attendance_write_staff; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY attendance_write_staff ON public.attendance TO authenticated USING ((public.has_role('admin'::text) OR public.has_role('secretary'::text))) WITH CHECK ((public.has_role('admin'::text) OR public.has_role('secretary'::text)));


--
-- Name: board_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;

--
-- Name: board_members board_members_read_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY board_members_read_public ON public.board_members FOR SELECT USING (true);


--
-- Name: board_members board_members_write_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY board_members_write_admin ON public.board_members TO authenticated USING (public.has_role('admin'::text)) WITH CHECK (public.has_role('admin'::text));


--
-- Name: contributions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;

--
-- Name: contributions contributions_read_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contributions_read_public ON public.contributions FOR SELECT USING (true);


--
-- Name: contributions contributions_write_staff; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY contributions_write_staff ON public.contributions TO authenticated USING ((public.has_role('admin'::text) OR public.has_role('treasurer'::text) OR public.has_role('auditor'::text))) WITH CHECK ((public.has_role('admin'::text) OR public.has_role('treasurer'::text) OR public.has_role('auditor'::text)));


--
-- Name: event_allocations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.event_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: event_allocations event_allocations_read_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY event_allocations_read_public ON public.event_allocations FOR SELECT USING (true);


--
-- Name: event_allocations event_allocations_write_staff; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY event_allocations_write_staff ON public.event_allocations TO authenticated USING ((public.has_role('admin'::text) OR public.has_role('treasurer'::text))) WITH CHECK ((public.has_role('admin'::text) OR public.has_role('treasurer'::text)));


--
-- Name: event_evaluations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.event_evaluations ENABLE ROW LEVEL SECURITY;

--
-- Name: event_evaluations event_evaluations_read_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY event_evaluations_read_public ON public.event_evaluations FOR SELECT USING (true);


--
-- Name: event_evaluations event_evaluations_write_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY event_evaluations_write_admin ON public.event_evaluations TO authenticated USING (public.has_role('admin'::text)) WITH CHECK (public.has_role('admin'::text));


--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: events events_read_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY events_read_public ON public.events FOR SELECT USING (true);


--
-- Name: events events_write__board; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY events_write__board ON public.events TO authenticated USING ((public.has_role('admin'::text) OR public.has_role('board-member'::text))) WITH CHECK ((public.has_role('admin'::text) OR public.has_role('board-member'::text)));


--
-- Name: students events_write__board; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY events_write__board ON public.students TO authenticated USING ((public.has_role('admin'::text) OR public.has_role('board-member'::text))) WITH CHECK ((public.has_role('admin'::text) OR public.has_role('board-member'::text)));


--
-- Name: events events_write_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY events_write_admin ON public.events TO authenticated USING (public.has_role('admin'::text)) WITH CHECK (public.has_role('admin'::text));


--
-- Name: feedback; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback feedback_delete_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feedback_delete_admin ON public.feedback FOR DELETE TO authenticated USING (public.has_role('admin'::text));


--
-- Name: feedback feedback_read_staff; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feedback_read_staff ON public.feedback FOR SELECT TO authenticated USING (public.is_staff());


--
-- Name: feedback feedback_submit_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feedback_submit_public ON public.feedback FOR INSERT WITH CHECK (true);


--
-- Name: feedback feedback_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY feedback_update_admin ON public.feedback FOR UPDATE TO authenticated USING (public.has_role('admin'::text)) WITH CHECK (public.has_role('admin'::text));


--
-- Name: financial_summaries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.financial_summaries ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_summaries financial_summaries_read_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY financial_summaries_read_public ON public.financial_summaries FOR SELECT USING (true);


--
-- Name: financial_summaries financial_summaries_write_staff; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY financial_summaries_write_staff ON public.financial_summaries TO authenticated USING ((public.has_role('admin'::text) OR public.has_role('treasurer'::text))) WITH CHECK ((public.has_role('admin'::text) OR public.has_role('treasurer'::text)));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete_staff; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_delete_staff ON public.notifications FOR DELETE TO authenticated USING (public.is_staff());


--
-- Name: notifications notifications_insert_staff; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_insert_staff ON public.notifications FOR INSERT TO authenticated WITH CHECK (public.is_staff());


--
-- Name: notifications notifications_read_broadcast_officer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_read_broadcast_officer ON public.notifications FOR SELECT TO authenticated USING (((recipient_kind = 'all_officers'::text) AND public.is_staff()));


--
-- Name: notifications notifications_read_own_officer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_read_own_officer ON public.notifications FOR SELECT TO authenticated USING (((recipient_kind = 'officer'::text) AND (recipient_user_id = auth.uid())));


--
-- Name: notifications notifications_read_public_student; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_read_public_student ON public.notifications FOR SELECT USING ((recipient_kind = ANY (ARRAY['student'::text, 'all_students'::text])));


--
-- Name: notifications notifications_update_own_officer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_update_own_officer ON public.notifications FOR UPDATE TO authenticated USING ((recipient_user_id = auth.uid())) WITH CHECK ((recipient_user_id = auth.uid()));


--
-- Name: or_sequence; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.or_sequence ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_read_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY audit_logs_read_admin ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role('admin'::text));


--
-- Name: audit_logs audit_logs_insert_staff; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY audit_logs_insert_staff ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_staff());

--
-- Name: payments payments_read_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY payments_read_public ON public.payments FOR SELECT USING (true);


--
-- Name: payments payments_write_staff; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY payments_write_staff ON public.payments TO authenticated USING ((public.has_role('admin'::text) OR public.has_role('treasurer'::text) OR public.has_role('auditor'::text))) WITH CHECK ((public.has_role('admin'::text) OR public.has_role('treasurer'::text) OR public.has_role('auditor'::text)));


--
-- Name: push_subscriptions push_subs_delete_by_endpoint; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY push_subs_delete_by_endpoint ON public.push_subscriptions FOR DELETE USING (true);


--
-- Name: push_subscriptions push_subs_insert_anonymous; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY push_subs_insert_anonymous ON public.push_subscriptions FOR INSERT WITH CHECK (((subscriber_kind = 'anonymous'::text) AND (student_id IS NULL) AND (officer_user_id IS NULL)));


--
-- Name: push_subscriptions push_subs_insert_officer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY push_subs_insert_officer ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (((subscriber_kind = 'officer'::text) AND (officer_user_id = auth.uid())));


--
-- Name: push_subscriptions push_subs_insert_student; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY push_subs_insert_student ON public.push_subscriptions FOR INSERT WITH CHECK (((subscriber_kind = 'student'::text) AND (student_id IS NOT NULL)));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: student_requirement_file_access student_req_file_access_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY student_req_file_access_admin_all ON public.student_requirement_file_access TO authenticated USING (public.has_role('admin'::text)) WITH CHECK (public.has_role('admin'::text));


--
-- Name: student_requirement_files student_req_files_read_published; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY student_req_files_read_published ON public.student_requirement_files FOR SELECT USING (((is_published = true) AND (restricted = false)));


--
-- Name: student_requirement_files student_req_files_write_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY student_req_files_write_admin ON public.student_requirement_files TO authenticated USING (public.has_role('admin'::text)) WITH CHECK (public.has_role('admin'::text));


--
-- Name: student_requirement_file_access; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.student_requirement_file_access ENABLE ROW LEVEL SECURITY;

--
-- Name: student_requirement_files; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.student_requirement_files ENABLE ROW LEVEL SECURITY;

--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: students students_read_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_read_public ON public.students FOR SELECT USING (true);


--
-- Name: students students_write_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_write_admin ON public.students TO authenticated USING (public.has_role('admin'::text)) WITH CHECK (public.has_role('admin'::text));


--
-- Name: students students_write_secretary; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_write_secretary ON public.students TO authenticated USING ((public.has_role('admin'::text) OR public.has_role('secretary'::text))) WITH CHECK ((public.has_role('admin'::text) OR public.has_role('secretary'::text)));


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions transactions_read_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY transactions_read_public ON public.transactions FOR SELECT USING (true);


--
-- Name: transactions transactions_write_staff; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY transactions_write_staff ON public.transactions TO authenticated USING ((public.has_role('admin'::text) OR public.has_role('treasurer'::text) OR public.has_role('auditor'::text))) WITH CHECK ((public.has_role('admin'::text) OR public.has_role('treasurer'::text) OR public.has_role('auditor'::text)));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_read_board_members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY user_roles_read_board_members ON public.user_roles FOR SELECT TO authenticated USING ((role = 'board-member'::text));


--
-- Name: user_roles user_roles_read_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY user_roles_read_own ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION assign_payment_or_number(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.assign_payment_or_number() TO anon;
GRANT ALL ON FUNCTION public.assign_payment_or_number() TO authenticated;
GRANT ALL ON FUNCTION public.assign_payment_or_number() TO service_role;


--
-- Name: FUNCTION create_event_contributions(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_event_contributions() TO anon;
GRANT ALL ON FUNCTION public.create_event_contributions() TO authenticated;
GRANT ALL ON FUNCTION public.create_event_contributions() TO service_role;


--
-- Name: FUNCTION create_student_contributions(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_student_contributions() TO anon;
GRANT ALL ON FUNCTION public.create_student_contributions() TO authenticated;
GRANT ALL ON FUNCTION public.create_student_contributions() TO service_role;


--
-- Name: FUNCTION get_contribution_totals(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_contribution_totals() TO anon;
GRANT ALL ON FUNCTION public.get_contribution_totals() TO authenticated;
GRANT ALL ON FUNCTION public.get_contribution_totals() TO service_role;


--
-- Name: FUNCTION get_event_contribution_totals(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_event_contribution_totals() TO anon;
GRANT ALL ON FUNCTION public.get_event_contribution_totals() TO authenticated;
GRANT ALL ON FUNCTION public.get_event_contribution_totals() TO service_role;


--
-- Name: FUNCTION get_financial_report(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_financial_report() TO anon;
GRANT ALL ON FUNCTION public.get_financial_report() TO authenticated;
GRANT ALL ON FUNCTION public.get_financial_report() TO service_role;


--
-- Name: FUNCTION get_next_or_number(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_next_or_number() TO anon;
GRANT ALL ON FUNCTION public.get_next_or_number() TO authenticated;
GRANT ALL ON FUNCTION public.get_next_or_number() TO service_role;


--
-- Name: TABLE student_requirement_files; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.student_requirement_files TO anon;
GRANT ALL ON TABLE public.student_requirement_files TO authenticated;
GRANT ALL ON TABLE public.student_requirement_files TO service_role;


--
-- Name: FUNCTION get_student_requirement_files(p_student_id text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_student_requirement_files(p_student_id text) TO anon;
GRANT ALL ON FUNCTION public.get_student_requirement_files(p_student_id text) TO authenticated;
GRANT ALL ON FUNCTION public.get_student_requirement_files(p_student_id text) TO service_role;


--
-- Name: FUNCTION has_role(required_role text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.has_role(required_role text) TO anon;
GRANT ALL ON FUNCTION public.has_role(required_role text) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(required_role text) TO service_role;


--
-- Name: FUNCTION is_staff(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_staff() TO anon;
GRANT ALL ON FUNCTION public.is_staff() TO authenticated;
GRANT ALL ON FUNCTION public.is_staff() TO service_role;


--
-- Name: FUNCTION notify_on_deadline_change(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.notify_on_deadline_change() TO anon;
GRANT ALL ON FUNCTION public.notify_on_deadline_change() TO authenticated;
GRANT ALL ON FUNCTION public.notify_on_deadline_change() TO service_role;


--
-- Name: FUNCTION notify_on_payment(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.notify_on_payment() TO anon;
GRANT ALL ON FUNCTION public.notify_on_payment() TO authenticated;
GRANT ALL ON FUNCTION public.notify_on_payment() TO service_role;


--
-- Name: FUNCTION notify_on_requirement_file_published(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.notify_on_requirement_file_published() TO anon;
GRANT ALL ON FUNCTION public.notify_on_requirement_file_published() TO authenticated;
GRANT ALL ON FUNCTION public.notify_on_requirement_file_published() TO service_role;


--
-- Name: FUNCTION notify_upcoming_deadlines(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.notify_upcoming_deadlines() TO anon;
GRANT ALL ON FUNCTION public.notify_upcoming_deadlines() TO authenticated;
GRANT ALL ON FUNCTION public.notify_upcoming_deadlines() TO service_role;


--
-- Name: FUNCTION sync_event_contributions(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_event_contributions() TO anon;
GRANT ALL ON FUNCTION public.sync_event_contributions() TO authenticated;
GRANT ALL ON FUNCTION public.sync_event_contributions() TO service_role;


--
-- Name: TABLE attendance; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.attendance TO anon;
GRANT ALL ON TABLE public.attendance TO authenticated;
GRANT ALL ON TABLE public.attendance TO service_role;


--
-- Name: TABLE board_members; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.board_members TO anon;
GRANT ALL ON TABLE public.board_members TO authenticated;
GRANT ALL ON TABLE public.board_members TO service_role;


--
-- Name: TABLE contributions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.contributions TO anon;
GRANT ALL ON TABLE public.contributions TO authenticated;
GRANT ALL ON TABLE public.contributions TO service_role;


--
-- Name: TABLE event_allocations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_allocations TO anon;
GRANT ALL ON TABLE public.event_allocations TO authenticated;
GRANT ALL ON TABLE public.event_allocations TO service_role;


--
-- Name: TABLE event_evaluations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.event_evaluations TO anon;
GRANT ALL ON TABLE public.event_evaluations TO authenticated;
GRANT ALL ON TABLE public.event_evaluations TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;


--
-- Name: TABLE feedback; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.feedback TO anon;
GRANT ALL ON TABLE public.feedback TO authenticated;
GRANT ALL ON TABLE public.feedback TO service_role;


--
-- Name: TABLE financial_summaries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.financial_summaries TO anon;
GRANT ALL ON TABLE public.financial_summaries TO authenticated;
GRANT ALL ON TABLE public.financial_summaries TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE or_sequence; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.or_sequence TO anon;
GRANT ALL ON TABLE public.or_sequence TO authenticated;
GRANT ALL ON TABLE public.or_sequence TO service_role;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payments TO anon;
GRANT ALL ON TABLE public.payments TO authenticated;
GRANT ALL ON TABLE public.payments TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.push_subscriptions TO anon;
GRANT ALL ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE student_requirement_file_access; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.student_requirement_file_access TO anon;
GRANT ALL ON TABLE public.student_requirement_file_access TO authenticated;
GRANT ALL ON TABLE public.student_requirement_file_access TO service_role;


--
-- Name: TABLE students; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.students TO anon;
GRANT ALL ON TABLE public.students TO authenticated;
GRANT ALL ON TABLE public.students TO service_role;


--
-- Name: TABLE transactions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.transactions TO anon;
GRANT ALL ON TABLE public.transactions TO authenticated;
GRANT ALL ON TABLE public.transactions TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict zMXPfJ2yIKIWktj5GK18rcbi6ZEejqok4VEaI08kVOzovgv5xaGIQJ3CVX1E5SU

