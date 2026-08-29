-- =====================================================================
--  create_officer_accounts.sql
-- =====================================================================
-- This script does not create or repair authentication accounts. Create
-- accounts through Supabase Authentication, then run this file to synchronize
-- application roles for accounts that already exist.
-- Re-running is safe: it only upserts public.user_roles rows.
-- Existing authentication records and passwords are never changed.
-- =====================================================================

DO $$
DECLARE
  officer_email text;
  officer_role  text;
  officer_name  text;
  uid           uuid;
BEGIN
  FOR officer_email, officer_role, officer_name IN VALUES
    ('admin@studentboard.ph',       'admin',       'Student Council Admin'),
    ('secretary@studentboard.ph',   'secretary',   'Council Secretary'),
    ('treasurer@studentboard.ph',   'treasurer',   'Council Treasurer'),
    ('auditor@studentboard.ph',     'auditor',     'Council Auditor'),
    ('boardmember@studentboard.ph', 'board-member', 'Board Member')
  LOOP
    SELECT id INTO uid
    FROM auth.users
    WHERE lower(email) = lower(officer_email);

    IF uid IS NULL THEN
      RAISE NOTICE 'OFFICER ACCOUNT MISSING for % — create it through Supabase Authentication, then re-run this file.', officer_email;
      CONTINUE;
    END IF;

    INSERT INTO public.user_roles (user_id, role, name)
    VALUES (uid, officer_role, officer_name)
    ON CONFLICT (user_id) DO UPDATE
      SET role = EXCLUDED.role,
          name = EXCLUDED.name;

    RAISE NOTICE 'Role % synchronized for %', officer_role, officer_email;
  END LOOP;
END $$;