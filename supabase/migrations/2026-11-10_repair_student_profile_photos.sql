-- Repair the student-profile-photo RPC and its Storage contract.
--
-- This migration is forward-only and non-destructive: it does not delete,
-- recreate, or modify existing student records, identifiers, or relationships.
-- Existing photos remain valid while replacement objects are uploaded to a new
-- immutable path and the student row is updated only after that upload succeeds.

BEGIN;

-- The public bucket is intentionally read-only to the public. Browser uploads
-- remain restricted by the policies below; Storage also rejects disallowed MIME
-- types and files larger than the client-side 5 MB limit.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'profile-photos',
  'profile-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- A replacement is a new object, never an in-place overwrite. This keeps the
-- currently referenced photo intact until the database update has committed.
DROP POLICY IF EXISTS profile_photos_authenticated_upload ON storage.objects;
CREATE POLICY profile_photos_authenticated_upload
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND name ~ '^[^/]+/profile/[0-9a-fA-F-]+\.(jpg|png|webp)$'
    AND (
      public.has_role('admin')
      OR public.has_role('secretary')
      OR EXISTS (
        SELECT 1
        FROM public.students AS s
        WHERE s.id = split_part(name, '/', 1)
          AND s.account_user_id = auth.uid()
      )
    )
  );

-- Retain support for an existing stable legacy object, but apply the same
-- ownership test. New clients only INSERT unique paths and do not overwrite.
DROP POLICY IF EXISTS profile_photos_authenticated_update ON storage.objects;
CREATE POLICY profile_photos_authenticated_update
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND name ~ '^[^/]+/profile(/[^/]+)?$'
    AND (
      public.has_role('admin')
      OR public.has_role('secretary')
      OR EXISTS (
        SELECT 1
        FROM public.students AS s
        WHERE s.id = split_part(name, '/', 1)
          AND s.account_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND name ~ '^[^/]+/profile(/[^/]+)?$'
  );

-- Keep the existing public API signature exactly. PostgREST resolves named RPC
-- arguments by these parameter names, not by their declaration order.
CREATE OR REPLACE FUNCTION public.set_student_profile_photo(
  target_student_id TEXT,
  next_profile_photo_url TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  saved_url TEXT;
  storage_path TEXT;
  public_url_marker CONSTANT TEXT := '/storage/v1/object/public/profile-photos/';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to update a profile photo';
  END IF;

  -- Verify the target exists before authorization/path work. This keeps a bad
  -- target ID from becoming an unintended successful no-op.
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = target_student_id) THEN
    RAISE EXCEPTION 'Student record not found';
  END IF;

  IF NOT (
    public.has_role('admin')
    OR public.has_role('secretary')
    OR EXISTS (
      SELECT 1
      FROM public.students
      WHERE id = target_student_id
        AND account_user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'You are not authorized to update this student profile photo';
  END IF;

  storage_path := split_part(
    split_part(COALESCE(next_profile_photo_url, ''), public_url_marker, 2),
    '?',
    1
  );

  IF position(public_url_marker IN COALESCE(next_profile_photo_url, '')) = 0
     OR storage_path NOT LIKE target_student_id || '/profile/%'
     OR storage_path !~ '^[^/]+/profile/[0-9a-fA-F-]+\.(jpg|png|webp)$'
     OR NOT EXISTS (
       SELECT 1
       FROM storage.objects
       WHERE bucket_id = 'profile-photos'
         AND name = storage_path
     )
  THEN
    RAISE EXCEPTION 'Invalid profile photo storage path';
  END IF;

  UPDATE public.students
     SET profile_photo_url = next_profile_photo_url
   WHERE id = target_student_id
   RETURNING profile_photo_url INTO saved_url;

  RETURN saved_url;
END;
$$;

REVOKE ALL ON FUNCTION public.set_student_profile_photo(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_student_profile_photo(TEXT, TEXT) TO authenticated;

-- Make the repaired signature visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;