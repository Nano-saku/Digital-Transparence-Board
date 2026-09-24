-- =====================================================================
-- Digital Transparency Board - Fix expected contribution aggregation
-- =====================================================================
-- The original function used events CROSS JOIN students and then also
-- multiplied by COUNT(students). That counted each allocation once per
-- student and applied the student count a second time.
--
-- This migration replaces only that faulty block in the installed function.
-- It is safe to re-run: an already-correct function is left unchanged.
-- =====================================================================

DO $$
DECLARE
    function_definition TEXT;
    corrected_definition TEXT;
    faulty_block TEXT := $faulty$
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
)$faulty$;
    corrected_block TEXT := $corrected$
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
)$corrected$;
BEGIN
    SELECT pg_get_functiondef(p.oid)
      INTO function_definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'get_financial_report'
       AND p.pronargs = 0;

    IF function_definition IS NULL THEN
        RAISE EXCEPTION
            'public.get_financial_report() does not exist; run the base schema first';
    END IF;

    IF position(faulty_block IN function_definition) > 0 THEN
        corrected_definition := replace(
            function_definition,
            faulty_block,
            corrected_block
        );
        EXECUTE corrected_definition;
    ELSIF position(corrected_block IN function_definition) = 0 THEN
        RAISE EXCEPTION
            'public.get_financial_report() has an unexpected expected-contribution definition';
    END IF;
END
$$;