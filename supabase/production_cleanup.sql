-- =====================================================================
-- Digital Transparency Board - production cleanup
-- =====================================================================
-- Purpose: remove only strongly identifiable test/dummy records while
-- preserving the schema, relationships, functionality, auth.users, and every
-- public.user_roles row.
--
-- IMPORTANT:
--   1. Run the PREVIEW queries first and review every returned row.
--   2. This script intentionally performs no deletes unless v_confirm is
--      changed to TRUE.
--   3. If a legitimate record contains one of the marker words below, remove
--      that row from the candidate CTE before confirming the cleanup.
--   4. This script never deletes from auth.users, user_roles, or storage.
--   5. An authoritative officer/board-member roster is still required before
--      deleting any catalog row that is not explicitly test-like.
--
-- The cleanup uses application-level student_id/event_id relationships because
-- the current schema stores those IDs as text without foreign-key constraints.
-- Child operational rows are deleted before their candidate student/event rows.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PREVIEW: run this section by itself before enabling the deletion block.
-- ---------------------------------------------------------------------
WITH markers AS (
  SELECT '(test|dummy|sample|mock|placeholder|fake|fixture|demo|seed)'::text AS pattern
),
student_candidates AS (
  SELECT id, student_id, name, program, year_level, section
  FROM public.students, markers
  WHERE lower(concat_ws(' ', id, student_id, name, program, year_level, section)) ~ pattern
),
event_candidates AS (
  SELECT id, name, date, allocation_amount
  FROM public.events, markers
  WHERE lower(concat_ws(' ', id, name, date, allocation_amount)) ~ pattern
),
board_member_candidates AS (
  SELECT id, name, account_user_id
  FROM public.board_members, markers
  WHERE account_user_id IS NULL
    AND lower(concat_ws(' ', id, name)) ~ pattern
)
SELECT 'students' AS table_name, id::text AS record_id, name AS description
FROM student_candidates
UNION ALL
SELECT 'events', id::text, name
FROM event_candidates
UNION ALL
SELECT 'board_members (unlinked only)', id::text, name
FROM board_member_candidates
ORDER BY table_name, record_id;

-- Directly marked operational rows are also shown. Rows related to a marked
-- student/event will be removed by the confirmed cleanup even if their own ID
-- does not contain a marker.
WITH markers AS (
  SELECT '(test|dummy|sample|mock|placeholder|fake|fixture|demo|seed)'::text AS pattern
)
SELECT table_name, record_id, description
FROM (
  SELECT 'attendance' AS table_name, id AS record_id,
         concat_ws(' | ', id, student_id, event_id, event_name, date) AS description
  FROM public.attendance, markers
  WHERE lower(concat_ws(' ', id, student_id, event_id, event_name, date, status)) ~ pattern
  UNION ALL
  SELECT 'contributions', id,
         concat_ws(' | ', id, student_id, event_id, event_name)
  FROM public.contributions, markers
  WHERE lower(concat_ws(' ', id, student_id, event_id, event_name)) ~ pattern
  UNION ALL
  SELECT 'payments', id,
         concat_ws(' | ', id, student_id, event_id, event_name, student_name, recorded_by)
  FROM public.payments, markers
  WHERE lower(concat_ws(' ', id, student_id, event_id, event_name, student_name, recorded_by)) ~ pattern
  UNION ALL
  SELECT 'transactions', id,
         concat_ws(' | ', id, event_id, event_name, description, responsible_officer)
  FROM public.transactions, markers
  WHERE lower(concat_ws(' ', id, event_id, event_name, description, responsible_officer)) ~ pattern
  UNION ALL
  SELECT 'feedback', id,
         concat_ws(' | ', id, title, message, student_name, student_id)
  FROM public.feedback, markers
  WHERE lower(concat_ws(' ', id, title, message, student_name, student_id)) ~ pattern
) AS candidates
ORDER BY table_name, record_id;

-- ---------------------------------------------------------------------
-- CONFIRMED CLEANUP
-- ---------------------------------------------------------------------
DO $$
DECLARE
  -- Safety lock: change only after reviewing both preview result sets.
  v_confirm boolean := false;
  v_user_roles_before bigint;
  v_auth_users_before bigint;
BEGIN
  IF NOT v_confirm THEN
    RAISE NOTICE
      'No cleanup performed. Review the preview rows, then change v_confirm to TRUE and run the complete script.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_user_roles_before FROM public.user_roles;
  SELECT count(*) INTO v_auth_users_before FROM auth.users;

  -- Temporary IDs make the relationship cleanup deterministic and keep this
  -- transaction independent of any changes made after the preview.
  CREATE TEMP TABLE cleanup_students ON COMMIT DROP AS
  SELECT id
  FROM public.students
  WHERE lower(concat_ws(' ', id, student_id, name, program, year_level, section))
    ~ '(test|dummy|sample|mock|placeholder|fake|fixture|demo|seed)';

  CREATE TEMP TABLE cleanup_events ON COMMIT DROP AS
  SELECT id
  FROM public.events
  WHERE lower(concat_ws(' ', id, name, date, allocation_amount))
    ~ '(test|dummy|sample|mock|placeholder|fake|fixture|demo|seed)';

  CREATE TEMP TABLE cleanup_attendance ON COMMIT DROP AS
  SELECT id
  FROM public.attendance
  WHERE lower(concat_ws(' ', id, student_id, event_id, event_name, date, status))
    ~ '(test|dummy|sample|mock|placeholder|fake|fixture|demo|seed)'
     OR student_id IN (SELECT id FROM cleanup_students)
     OR event_id IN (SELECT id FROM cleanup_events);

  CREATE TEMP TABLE cleanup_contributions ON COMMIT DROP AS
  SELECT id
  FROM public.contributions
  WHERE lower(concat_ws(' ', id, student_id, event_id, event_name))
    ~ '(test|dummy|sample|mock|placeholder|fake|fixture|demo|seed)'
     OR student_id IN (SELECT id FROM cleanup_students)
     OR event_id IN (SELECT id FROM cleanup_events);

  CREATE TEMP TABLE cleanup_payments ON COMMIT DROP AS
  SELECT id
  FROM public.payments
  WHERE lower(concat_ws(' ', id, student_id, event_id, event_name, student_name, recorded_by))
    ~ '(test|dummy|sample|mock|placeholder|fake|fixture|demo|seed)'
     OR student_id IN (SELECT id FROM cleanup_students)
     OR event_id IN (SELECT id FROM cleanup_events);

  CREATE TEMP TABLE cleanup_transactions ON COMMIT DROP AS
  SELECT id
  FROM public.transactions
  WHERE lower(concat_ws(' ', id, event_id, event_name, description, responsible_officer))
    ~ '(test|dummy|sample|mock|placeholder|fake|fixture|demo|seed)'
     OR event_id IN (SELECT id FROM cleanup_events);

  CREATE TEMP TABLE cleanup_feedback ON COMMIT DROP AS
  SELECT id
  FROM public.feedback
  WHERE lower(concat_ws(' ', id, title, message, student_name, student_id))
    ~ '(test|dummy|sample|mock|placeholder|fake|fixture|demo|seed)'
     OR student_id IN (SELECT id FROM cleanup_students);

  -- Delete dependents first. No table definitions, policies, functions,
  -- triggers, grants, auth records, or role records are changed.
  DELETE FROM public.attendance WHERE id IN (SELECT id FROM cleanup_attendance);
  DELETE FROM public.contributions WHERE id IN (SELECT id FROM cleanup_contributions);
  DELETE FROM public.payments WHERE id IN (SELECT id FROM cleanup_payments);
  DELETE FROM public.transactions WHERE id IN (SELECT id FROM cleanup_transactions);
  DELETE FROM public.feedback WHERE id IN (SELECT id FROM cleanup_feedback);
  DELETE FROM public.events WHERE id IN (SELECT id FROM cleanup_events);
  DELETE FROM public.students WHERE id IN (SELECT id FROM cleanup_students);

  -- Only an unlinked board-member catalog row with a strong test marker may
  -- be removed. Account-linked rows are always preserved.
  DELETE FROM public.board_members
  WHERE account_user_id IS NULL
    AND lower(concat_ws(' ', id, name))
      ~ '(test|dummy|sample|mock|placeholder|fake|fixture|demo|seed)';

  -- Hard safety assertions: this cleanup must never mutate auth or roles.
  IF (SELECT count(*) FROM public.user_roles) <> v_user_roles_before THEN
    RAISE EXCEPTION 'Safety check failed: user_roles changed; transaction rolled back.';
  END IF;
  IF (SELECT count(*) FROM auth.users) <> v_auth_users_before THEN
    RAISE EXCEPTION 'Safety check failed: auth.users changed; transaction rolled back.';
  END IF;

  RAISE NOTICE 'Production cleanup completed. user_roles and auth.users were preserved.';
END $$;

-- Verify the protected account/role surface after the transaction.
SELECT u.email, r.role, r.name
FROM auth.users AS u
JOIN public.user_roles AS r ON r.user_id = u.id
ORDER BY r.role, u.email;