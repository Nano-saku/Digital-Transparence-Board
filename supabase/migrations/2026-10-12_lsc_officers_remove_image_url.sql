-- LSC Officer appointments may reference, but never modify, a fixed preview file.
-- The value is an immutable public path such as /7.jpg, not a storage object.
ALTER TABLE public.lsc_officers
  DROP COLUMN IF EXISTS image_url;

ALTER TABLE public.lsc_officers
  ADD COLUMN IF NOT EXISTS preview_file_reference TEXT;

-- Older deployments may have created this column without the foreign key. Keep
-- the relationship present, but do not fail the migration if a legacy
-- constraint with the same purpose already exists under another name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'lsc_officers'
      AND c.contype = 'f'
      AND (
        c.conname = 'lsc_officers_student_db_id_fkey'
        OR (
          pg_get_constraintdef(c.oid) LIKE '%(student_db_id)%'
          AND pg_get_constraintdef(c.oid) LIKE '%students(id)%'
        )
      )
  ) THEN
    ALTER TABLE public.lsc_officers
      ADD CONSTRAINT lsc_officers_student_db_id_fkey
      FOREIGN KEY (student_db_id) REFERENCES public.students(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.lsc_officers
  DROP CONSTRAINT IF EXISTS lsc_officers_preview_file_reference_check;

ALTER TABLE public.lsc_officers
  ADD CONSTRAINT lsc_officers_preview_file_reference_check
  CHECK (
    preview_file_reference IS NULL
    OR preview_file_reference IN (
      '/1.jpg', '/2.jpg', '/3.jpg', '/4.jpg', '/5.jpg', '/6.jpg',
      '/7.jpg', '/8.jpg', '/9.jpg', '/10.jpg', '/11.jpg', '/12.jpg',
      '/13.jpg', '/14.jpg', '/15.jpg', '/16.jpg', '/17.jpg', '/18.jpg'
    )
  );
