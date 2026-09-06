-- =====================================================================
-- Digital Transparency Board - Student Requirement Files
-- =====================================================================
-- Purpose:
--   1. Let the Admin upload, manage, and publish Student Requirement
--      documents (e.g. forms, guides, checklists) in a dedicated section.
--   2. Students can only view/download the published files through their
--      Student Records section — no upload or management options.
--   3. File permissions: public can read only published rows; only Admin
--      can create, edit, replace, publish, or delete files.
--
-- Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Create the student_requirement_files table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_requirement_files (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT DEFAULT '',
  -- Public URL of the uploaded file (PDF, DOCX, etc.).
  file_url     TEXT NOT NULL,
  file_name    TEXT NOT NULL DEFAULT '',
  file_size    BIGINT NOT NULL DEFAULT 0,
  file_type    TEXT DEFAULT '',
  -- Only published files are visible to students.
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_student_requirement_files_published
  ON public.student_requirement_files (is_published);

CREATE INDEX IF NOT EXISTS idx_student_requirement_files_created_at
  ON public.student_requirement_files (created_at);

-- ---------------------------------------------------------------------
-- 2. Row Level Security
-- ---------------------------------------------------------------------
ALTER TABLE public.student_requirement_files ENABLE ROW LEVEL SECURITY;

-- Public may read ONLY published files (so students see what the Admin
-- has published, nothing else).
DROP POLICY IF EXISTS "student_req_files_read_published" ON public.student_requirement_files;
CREATE POLICY "student_req_files_read_published"
  ON public.student_requirement_files
  FOR SELECT TO public
  USING (is_published = true);

-- Only Admin may create, update, or delete requirement files.
DROP POLICY IF EXISTS "student_req_files_write_admin" ON public.student_requirement_files;
CREATE POLICY "student_req_files_write_admin"
  ON public.student_requirement_files
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_requirement_files TO anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'publishable') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_requirement_files TO publishable';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Storage: public "student-requirements" bucket + policies
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-requirements', 'student-requirements', true)
ON CONFLICT (id) DO NOTHING;

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

-- ---------------------------------------------------------------------
-- 4. Supabase Realtime
-- ---------------------------------------------------------------------
DO $$
DECLARE
  source_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'student_requirement_files'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.student_requirement_files;
    END IF;
  END IF;
END $$;
