-- =====================================================================
-- Digital Transparency Board - Cumulative payment history per payment row
-- =====================================================================
-- Purpose:
--   Store the individual payment installment history inside the single
--   payments row that represents a student's contribution to one event.
--   This lets the official receipt show every partial payment that has
--   been made, from the first installment to the final settlement.
--
--   The column is JSONB so it is schema-flexible and queryable. Each
--   element has the shape:
--     { "amount": 500, "date": "2026-09-20", "status": "Partial" }
--
--   Existing rows default to an empty array and are backfilled lazily
--   when a new payment is recorded for that student/event pair.
--
-- Safe to re-run (ADD COLUMN IF NOT EXISTS is idempotent).
-- =====================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_items JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.payments.payment_items IS
  'Ordered list of individual payment installments recorded for this
   student/event pair. Each element: {"amount": number, "date": "YYYY-MM-DD",
   "status": "Partial"|"Fully Paid"}. The top-level `amount` column always
   holds the running cumulative total; payment_items holds the audit trail.';
