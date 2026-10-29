-- Student profile photos and expanded LSC officer positions.
-- Safe to run against an existing production database; no rows or accounts are deleted.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS account_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_account_user_id
  ON public.students (account_user_id)
  WHERE account_user_id IS NOT NULL;

-- The old appointment-only selector is no longer used. Profile photos belong
-- to the student record and are shared by student and officer interfaces.
ALTER TABLE public.lsc_officers
  DROP CONSTRAINT IF EXISTS lsc_officers_preview_file_reference_check;
ALTER TABLE public.lsc_officers
  DROP COLUMN IF EXISTS preview_file_reference;

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_photos_public_read ON storage.objects;
CREATE POLICY profile_photos_public_read
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS profile_photos_authenticated_upload ON storage.objects;
CREATE POLICY profile_photos_authenticated_upload
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND split_part(name, '/', 2) = 'profile'
    AND (
      public.has_role('admin')
      OR public.has_role('secretary')
      OR EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id = split_part(name, '/', 1)
          AND s.account_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS profile_photos_authenticated_update ON storage.objects;
CREATE POLICY profile_photos_authenticated_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND split_part(name, '/', 2) = 'profile'
    AND (
      public.has_role('admin')
      OR public.has_role('secretary')
      OR EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id = split_part(name, '/', 1)
          AND s.account_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND split_part(name, '/', 2) = 'profile'
  );

CREATE OR REPLACE FUNCTION public.set_student_profile_photo(
  target_student_id TEXT,
  next_profile_photo_url TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_url TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to update a profile photo';
  END IF;

  IF NOT (
    public.has_role('admin')
    OR public.has_role('secretary')
    OR EXISTS (
      SELECT 1 FROM public.students
      WHERE id = target_student_id
        AND account_user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'You are not authorized to update this student profile photo';
  END IF;

  IF next_profile_photo_url IS NULL
     OR next_profile_photo_url NOT LIKE '%/storage/v1/object/public/profile-photos/' || target_student_id || '/profile%'
  THEN
    RAISE EXCEPTION 'Invalid profile photo storage path';
  END IF;

  UPDATE public.students
     SET profile_photo_url = next_profile_photo_url
   WHERE id = target_student_id
   RETURNING profile_photo_url INTO saved_url;

  IF saved_url IS NULL THEN
    RAISE EXCEPTION 'Student record not found';
  END IF;
  RETURN saved_url;
END;
$$;

REVOKE ALL ON FUNCTION public.set_student_profile_photo(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_student_profile_photo(TEXT, TEXT) TO authenticated;

-- lsc_officers.positions is a text array, so Marshall roles require no table
-- migration. This check prevents future callers from saving unknown positions
-- while preserving every existing role.
ALTER TABLE public.lsc_officers
  DROP CONSTRAINT IF EXISTS lsc_officers_positions_check;
ALTER TABLE public.lsc_officers
  ADD CONSTRAINT lsc_officers_positions_check CHECK (
    positions <@ ARRAY[
      'Governor', 'Vice Governor', 'External Vice Governor',
      'General Secretary', 'Assistant Secretary', 'Treasurer', 'Auditor',
      'Assistant Auditor', 'Board Member', 'Creative Director',
      'Technical Director', 'Creative Head', 'Technical Head',
      'Creatives Committee', 'Technical Committee', 'Marshall Head',
      'Marshall Committee'
    ]::TEXT[]
  );