-- ============================================================
-- Activity timestamps
-- ============================================================
-- PostgreSQL stores timestamptz values as instants. The UI converts those
-- instants to Asia/Manila; it must not use the browser timezone.

BEGIN;

-- `payments.date` is a legacy business-date text field. Keep it unchanged for
-- receipts and existing integrations, and add a database-owned operation time
-- for Contribution Logs.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz;

-- Drop the old trigger/function first. This handles databases where an earlier
-- schema script created the function with a definition that CREATE OR REPLACE
-- cannot reconcile. The explicit zero-argument signature is required by DROP.
DROP TRIGGER IF EXISTS payments_set_recorded_at ON public.payments;
DROP FUNCTION IF EXISTS public.set_payment_recorded_at();

CREATE FUNCTION public.set_payment_recorded_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set this on both insert and update so an upsert displays the instant at
  -- which the successful payment operation committed to PostgreSQL.
  NEW.recorded_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER payments_set_recorded_at
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_payment_recorded_at();

CREATE INDEX IF NOT EXISTS idx_payments_recorded_at
  ON public.payments (recorded_at DESC);

-- Activity auditing is intentionally separate from payment-derived logs.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id             text PRIMARY KEY,
  actor_user_id  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_name     text NOT NULL,
  actor_role     text NOT NULL,
  action         text NOT NULL,
  entity_type    text NOT NULL,
  entity_id      text,
  description    text NOT NULL,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type
  ON public.audit_logs (entity_type);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_read_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_read_admin"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role('admin'));

DROP POLICY IF EXISTS "audit_logs_insert_staff" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_staff"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

COMMIT;