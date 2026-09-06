import type { ContributionRecord } from "@/types";

/** Label + Tailwind class pair for a contribution status badge. */
export interface ContributionStatus {
  label: string;
  className: string;
}

/**
 * Shared contribution status logic for contribution records. Both the public
 * Student Records table and the Contribution Management table use this so the
 * two surfaces can never drift apart:
 *   - `amountPaid <= 0`           -> Unpaid
 *   - `remainingBalance > 0`      -> Partial Payment
 *   - otherwise                   -> Fully Paid
 */
export function contributionStatus(
  record: Pick<ContributionRecord, "amountPaid" | "remainingBalance">
): ContributionStatus {
  if (record.amountPaid <= 0) return { label: "Unpaid", className: "text-red-500" };
  if (record.remainingBalance > 0)
    return { label: "Partial Payment", className: "text-amber-600" };
  return { label: "Fully Paid", className: "text-green-600" };
}