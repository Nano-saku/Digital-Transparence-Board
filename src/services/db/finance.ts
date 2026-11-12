import { autoCreateReceipt } from "../../lib/receipts";
import { today } from "../../lib/format";
import { escapeLikePattern } from "../../lib/utils";
import type { ContributionRecord, FinancialReport, PaymentItem, PaymentRecord, Transaction } from "../../types";
import { auditLogsService } from "./auditLogs";
import {
  buildAudit,
  defineTable,
  field,
  findStudentRows,
  isUniqueViolation,
  newId,
  nullable,
  opt,
  orElse,
  readOnly,
  sb,
  subscribeToTables,
  unwrap,
  DESC,
} from "./core";

// ============================================
// CONTRIBUTIONS
// ============================================
const contributions = defineTable<ContributionRecord>({
  name: "contributions",
  entity: "contribution",
  columns: {
    studentId: "student_id",
    eventId: "event_id",
    eventName: "event_name",
    requiredAmount: "required_amount",
    amountPaid: "amount_paid",
    remainingBalance: "remaining_balance",
  },
  order: [["id", DESC]],
  // UNIQUE (student_id, event_id) is the authoritative double-entry guard;
  // callers catch this message to recover (re-fetch the existing record).
  errorMessage: (code, kind) =>
    kind === "create" && code === "23505"
      ? "This student already has a contribution record for this event."
      : undefined,
});

type Totals = { totalRequired: number; totalPaid: number; totalBalance: number };
type ReportSummary = { totalExpectedContributions?: number; totalFundsCollected?: number; totalEventCollections?: number };

export const contributionsService = {
  /** Every contribution (legacy/offline workflows). Paginated screens use getPage(). */
  getAll: (): Promise<ContributionRecord[]> => contributions.getAll(),

  /**
   * One zero-based page of contributions with a required amount, filtered
   * server-side. Search matches the event name, student name (every word, any
   * order) or student ID across all rows, not just the loaded page; status is
   * derived from amount_paid/remaining_balance; total counts every match.
   */
  async getPage(
    page: number,
    pageSize: number,
    searchTerm = "",
    eventId = "",
    status = "",
  ): Promise<{ data: ContributionRecord[]; total: number }> {
    const search = searchTerm.trim();
    let query = contributions.query({ count: "exact" }).gt("required_amount", 0);
    if (eventId) query = query.eq("event_id", eventId);

    if (search) {
      const studentIds = (await findStudentRows(search)).map((row) => row.id as string);
      const pattern = `%${escapeLikePattern(search).replace(/[,()]/g, "\\$&")}%`;
      query = studentIds.length
        ? query.or(`event_name.ilike.${pattern},student_id.in.(${studentIds.join(",")})`)
        : query.ilike("event_name", pattern);
    }

    if (status === "unpaid") query = query.eq("amount_paid", 0);
    else if (status === "partial") query = query.gt("amount_paid", 0).gt("remaining_balance", 0);
    // Matches contributionStatus(): fully paid needs an actual payment.
    else if (status === "paid") query = query.gt("amount_paid", 0).lte("remaining_balance", 0);

    return contributions.page(query, page, pageSize);
  },

  /** Summary-card totals computed in Postgres instead of downloading every row. */
  async getTotals(): Promise<Totals> {
    // Authoritative: get_financial_report excludes active LSC officers.
    try {
      const { data, error } = await sb().rpc("get_financial_report");
      const summary = (data as { summary?: ReportSummary } | null)?.summary;
      if (!error && summary) {
        const totalRequired = Number(summary.totalExpectedContributions ?? 0);
        const totalPaid = Number(summary.totalFundsCollected ?? summary.totalEventCollections ?? 0);
        return { totalRequired, totalPaid, totalBalance: Math.max(0, totalRequired - totalPaid) };
      }
      if (error) console.warn("get_financial_report returned error, trying fallback:", error);
    } catch (e) {
      console.warn("Could not retrieve totals via get_financial_report:", e);
    }

    try {
      const { data, error } = await sb().rpc("get_contribution_totals");
      if (!error && data) {
        const row = Array.isArray(data) ? data[0] : data;
        return {
          totalRequired: Number(row?.total_required ?? 0),
          totalPaid: Number(row?.total_paid ?? 0),
          totalBalance: Number(row?.total_balance ?? 0),
        };
      }
    } catch (e) {
      console.warn("Could not retrieve totals via get_contribution_totals:", e);
    }

    return { totalRequired: 0, totalPaid: 0, totalBalance: 0 };
  },

  /** eventId -> amount collected, computed in Postgres. */
  async getTotalsByEvent(): Promise<Record<string, number>> {
    const { data, error } = await sb().rpc("get_event_contribution_totals");
    let rows: unknown[] = [];
    if (!error && Array.isArray(data)) {
      rows = data;
    } else {
      const fallback = await sb().rpc("get_contribution_totals_by_event");
      if (!fallback.error && Array.isArray(fallback.data)) rows = fallback.data;
      else if (error) throw error;
    }

    const totals: Record<string, number> = {};
    for (const row of rows as { event_id?: string; total_paid?: number; collected?: number }[]) {
      if (row?.event_id) totals[row.event_id] = Number(row.collected ?? row.total_paid ?? 0);
    }
    return totals;
  },

  getByStudentId: (studentId: string): Promise<ContributionRecord[]> =>
    contributions.list(contributions.query().eq("student_id", studentId)),

  getByStudentAndEvent: (studentId: string, eventId: string): Promise<ContributionRecord | null> =>
    contributions.one(contributions.query().eq("student_id", studentId).eq("event_id", eventId).limit(1).maybeSingle()),

  create: (record: Omit<ContributionRecord, "id">): Promise<ContributionRecord> =>
    contributions.create(record, `Created contribution for student ${record.studentId} at ${record.eventName}.`, {
      studentId: record.studentId,
      eventId: record.eventId,
      amountPaid: record.amountPaid,
    }),

  update: (id: string, record: Partial<ContributionRecord>): Promise<ContributionRecord> =>
    contributions.update(id, record),

  delete: (id: string): Promise<void> => contributions.delete(id),
};

// ============================================
// PAYMENTS
// ============================================
const payments = defineTable<PaymentRecord>({
  name: "payments",
  entity: "payment",
  columns: {
    studentId: "student_id",
    studentName: "student_name",
    eventId: "event_id",
    eventName: "event_name",
    contributionId: orElse("contribution_id", ""),
    amount: "amount",
    date: "date",
    recordedAt: readOnly(nullable("recorded_at")),
    receiptUrl: opt("receipt_url"),
    orNumber: opt("or_number"),
    recordedBy: "recorded_by",
    paymentItems: field("payment_items", (items) => (Array.isArray(items) ? items : [])),
  },
  order: [
    ["recorded_at", { ascending: false, nullsFirst: false }],
    ["id", DESC],
  ],
  createDefaults: { payment_items: [] },
});

const toCents = (amount: number): number => Math.round((amount + Number.EPSILON) * 100);
const hasCentPrecision = (amount: number): boolean => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-8;

function requiredPaymentAmountError(amount: number, requiredAmount: number): string | null {
  const valid =
    Number.isFinite(amount) &&
    Number.isFinite(requiredAmount) &&
    requiredAmount > 0 &&
    amount > 0 &&
    hasCentPrecision(amount) &&
    toCents(amount) === toCents(requiredAmount);
  if (valid) return null;
  const formatted = Number.isInteger(requiredAmount) ? requiredAmount.toString() : requiredAmount.toFixed(2);
  return `Invalid payment amount. The required payment for this event is ₱${formatted}. Please enter the exact amount.`;
}

/** Outcome of {@link paymentsService.importPaidEntryDirect}. */
export type DirectPaymentImportResult =
  | { status: "saved"; payment: PaymentRecord; receiptIssued: boolean }
  | { status: "skipped"; reason: string };

type ImportInput = {
  student: { id: string; name: string };
  event: { id: string; name: string };
  requiredAmount: number;
  amountPaid: number;
  recordedBy: string;
  issueReceipt: boolean;
};

const ALREADY_PAID: DirectPaymentImportResult = { status: "skipped", reason: "contribution already has a payment" };

export const paymentsService = {
  /** Validate the exact amount required for a standard event payment. */
  assertRequiredPaymentAmount(amount: number, requiredAmount: number): void {
    const validationError = requiredPaymentAmountError(amount, requiredAmount);
    if (validationError) throw new Error(validationError);
  },

  getAll: (): Promise<PaymentRecord[]> => payments.getAll(),

  /** Contribution Logs page: a derived view of the payment rows themselves. */
  getPage: (page: number, pageSize: number): Promise<{ data: PaymentRecord[]; total: number }> =>
    payments.page(payments.query({ count: "exact" }), page, pageSize),

  subscribe: (onChange: () => void): (() => void) => subscribeToTables(["payments"], onChange, "payment-logs-live"),

  getByStudentId: (studentId: string): Promise<PaymentRecord[]> =>
    payments.list(payments.query().eq("student_id", studentId)),

  /** The newest row for the pair (older databases may hold several legacy rows). */
  getByStudentAndEvent: (studentId: string, eventId: string): Promise<PaymentRecord | null> =>
    payments.one(payments.query().eq("student_id", studentId).eq("event_id", eventId).limit(1).maybeSingle()),

  create: (record: Omit<PaymentRecord, "id">): Promise<PaymentRecord> =>
    payments.create(record, `Recorded payment for ${record.studentName} at ${record.eventName}.`, {
      studentId: record.studentId,
      eventId: record.eventId,
      amount: record.amount,
    }),

  /**
   * Keep one current payment row per student/event. The payments table has
   * no pairwise unique index, so callers must use this rather than inserting
   * a second row; the unique-violation recovery covers a database that adds
   * that constraint later.
   */
  async upsertForStudentAndEvent(record: Omit<PaymentRecord, "id">): Promise<PaymentRecord> {
    const existing = await paymentsService.getByStudentAndEvent(record.studentId, record.eventId);
    if (existing) return paymentsService.update(existing.id, record);
    try {
      return await paymentsService.create(record);
    } catch (error) {
      // Another browser/import inserted the pair after the lookup.
      if (!isUniqueViolation(error)) throw error;
      const concurrent = await paymentsService.getByStudentAndEvent(record.studentId, record.eventId);
      if (!concurrent) throw error;
      return paymentsService.update(concurrent.id, record);
    }
  },

  /** Standard required payment: only the event's exact required amount is accepted (not bypassable by callers). */
  async upsertRequiredPayment(record: Omit<PaymentRecord, "id">, requiredAmount: number): Promise<PaymentRecord> {
    paymentsService.assertRequiredPaymentAmount(record.amount, requiredAmount);
    return paymentsService.upsertForStudentAndEvent(record);
  },

  /**
   * Save one paid spreadsheet entry DIRECTLY to Supabase (never queued): the
   * import requires a live connection and reports every entry's real outcome.
   * - Skips a pair that already has a payment row or a paid contribution, so
   *   re-importing a file never duplicates.
   * - Inserts without an OR number so the `assign_payment_or_number` trigger
   *   allocates it; the receipt is generated from the returned OR.
   * - A receipt/audit failure keeps the payment; a contribution-totals
   *   failure rolls the inserted payment back.
   */
  async importPaidEntryDirect(input: ImportInput): Promise<DirectPaymentImportResult> {
    const { student, event, requiredAmount, amountPaid } = input;
    if (!Number.isFinite(amountPaid) || amountPaid <= 0 || !hasCentPrecision(amountPaid)) {
      throw new Error("Amount Paid must be a positive peso amount.");
    }
    if (!Number.isFinite(requiredAmount) || requiredAmount <= 0) {
      throw new Error("Required Amount must be greater than zero.");
    }
    if (toCents(amountPaid) > toCents(requiredAmount)) {
      throw new Error(
        `Amount Paid ₱${amountPaid.toFixed(2)} exceeds the required ₱${requiredAmount.toFixed(2)}.`,
      );
    }

    const existingPayment = await paymentsService.getByStudentAndEvent(student.id, event.id);
    if (existingPayment) {
      const or = existingPayment.orNumber ? ` (${existingPayment.orNumber})` : "";
      return { status: "skipped", reason: `already has a payment${or}` };
    }

    let contribution = await contributionsService.getByStudentAndEvent(student.id, event.id);
    if (contribution && contribution.amountPaid > 0) return ALREADY_PAID;

    // The contribution row is normally created by a trigger.
    if (!contribution) {
      const { data, error } = await sb()
        .from("contributions")
        .insert({
          id: newId(),
          student_id: student.id,
          event_id: event.id,
          event_name: event.name,
          required_amount: requiredAmount,
          amount_paid: 0,
          remaining_balance: requiredAmount,
        })
        .select()
        .single();
      if (!error) {
        contribution = contributions.fromRow(data);
      } else {
        if (!isUniqueViolation(error)) throw error;
        contribution = await contributionsService.getByStudentAndEvent(student.id, event.id);
        if (!contribution) throw error;
        if (contribution.amountPaid > 0) return ALREADY_PAID;
      }
    }

    return paymentsService.insertImportedPayment({ ...input, contributionId: contribution.id });
  },

  /** Steps after the duplicate guards of {@link importPaidEntryDirect}: insert, totals, receipt, audit. */
  async insertImportedPayment(input: ImportInput & { contributionId: string }): Promise<DirectPaymentImportResult> {
    const { student, event, requiredAmount, amountPaid, recordedBy } = input;
    const date = today();
    const remainingBalance = Math.max(0, toCents(requiredAmount) - toCents(amountPaid)) / 100;
    const status: PaymentItem["status"] = remainingBalance <= 0 ? "Fully Paid" : "Partial";
    const paymentItems: PaymentItem[] = [{ amount: amountPaid, date, status }];

    // or_number stays NULL so the DB trigger assigns the next number atomically.
    const { data: inserted, error: insertError } = await sb()
      .from("payments")
      .insert({
        id: newId(),
        student_id: student.id,
        student_name: student.name,
        event_id: event.id,
        event_name: event.name,
        contribution_id: input.contributionId,
        amount: amountPaid,
        date,
        receipt_url: null,
        or_number: null,
        recorded_by: recordedBy,
        payment_items: paymentItems,
      })
      .select()
      .single();
    if (insertError) {
      if (isUniqueViolation(insertError)) return { status: "skipped", reason: "payment already exists" };
      throw insertError;
    }
    let payment = payments.fromRow(inserted);

    // Roll the payment back if the totals fail so the two tables never disagree.
    const { error: contributionError } = await sb()
      .from("contributions")
      .update({
        event_name: event.name,
        required_amount: requiredAmount,
        amount_paid: amountPaid,
        remaining_balance: remainingBalance,
      })
      .eq("id", input.contributionId);
    if (contributionError) {
      const { error: rollbackError } = await sb().from("payments").delete().eq("id", payment.id);
      if (rollbackError) console.error("Failed to roll back imported payment:", rollbackError);
      throw contributionError;
    }

    let receiptIssued = false;
    if (input.issueReceipt && payment.orNumber) {
      try {
        const receiptUrl = await autoCreateReceipt({
          tag: "PAYMENT",
          receiptNumber: payment.orNumber,
          issuedTo: student.name,
          eventName: event.name,
          description: `Payment for ${event.name} (imported)`,
          amount: amountPaid,
          type: "income",
          date,
          recordedBy,
          requiredAmount,
          remainingBalance,
          statusLabel: status,
          paymentItems,
        });
        await unwrap(sb().from("payments").update({ receipt_url: receiptUrl }).eq("id", payment.id));
        payment = { ...payment, receiptUrl };
        receiptIssued = true;
      } catch (receiptError) {
        console.warn(`Receipt generation failed for ${payment.orNumber}:`, receiptError);
      }
    }

    try {
      await auditLogsService.create(
        await buildAudit("PAYMENT_IMPORTED", "payment", `Imported payment for ${student.name} at ${event.name}.`, payment.id, {
          studentId: student.id,
          eventId: event.id,
          amount: amountPaid,
          orNumber: payment.orNumber,
          source: "spreadsheet_import",
        }),
      );
    } catch (auditError) {
      console.warn("Failed to write import audit log:", auditError);
    }

    return { status: "saved", payment, receiptIssued };
  },

  update: (id: string, record: Partial<PaymentRecord>): Promise<PaymentRecord> => payments.update(id, record),

  /**
   * Deletes a CONTRIBUTION (by its id) and every payment for its
   * student/event. Online only: a read followed by a two-table delete can't
   * be represented as one queued offline mutation.
   */
  async delete(id: string): Promise<void> {
    const contribution = await unwrap<{ student_id: string; event_id: string }>(
      sb().from("contributions").select("student_id, event_id").eq("id", id).single(),
    );
    const audit = await buildAudit("PAYMENT_DELETED", "payment", `Deleted payments for contribution ${id}.`, id, {
      studentId: contribution.student_id,
      eventId: contribution.event_id,
    });
    await unwrap(
      sb().from("payments").delete().eq("student_id", contribution.student_id).eq("event_id", contribution.event_id),
    );
    await unwrap(sb().from("contributions").delete().eq("id", id));
    await auditLogsService.create(audit);
  },
};

// ============================================
// TRANSACTIONS
// ============================================
const transactions = defineTable<Transaction>({
  name: "transactions",
  entity: "transaction",
  columns: {
    date: "date",
    description: "description",
    eventId: opt("event_id"),
    eventName: opt("event_name"),
    amount: "amount",
    type: "type",
    responsibleOfficer: "responsible_officer",
    receiptUrl: opt("receipt_url"),
  },
  order: [["date", DESC]],
});

export const transactionsService = {
  getAll: (): Promise<Transaction[]> => transactions.getAll(),

  create: (record: Omit<Transaction, "id">): Promise<Transaction> =>
    transactions.create(record, `Created ${record.type} transaction: ${record.description}.`, {
      amount: record.amount,
      type: record.type,
      eventId: record.eventId,
    }),

  update: (id: string, record: Partial<Transaction>): Promise<Transaction> => transactions.update(id, record),

  delete: (id: string): Promise<void> => transactions.delete(id),
};

// ============================================
// FINANCIAL REPORTING (derived in Postgres, no writes)
// ============================================
export interface EventCollectionPerformance {
  eventId: string;
  eventName: string;
  isNoContribution: boolean;
  allocationAmount: number;
  eligibleCount: number;
  /** Sum of required amounts for all eligible (non-officer) students. */
  expectedCollection: number;
  /** Sum of credited payments for this event. */
  actualCollection: number;
  /** expectedCollection minus actualCollection, floored at 0. */
  outstandingBalance: number;
  /** actualCollection / expectedCollection * 100, or 0 when expectedCollection = 0. */
  collectionPerformance: number;
}

const PERFORMANCE_NUMBERS = [
  "allocationAmount",
  "eligibleCount",
  "expectedCollection",
  "actualCollection",
  "outstandingBalance",
  "collectionPerformance",
] as const;

const EMPTY_REPORT: FinancialReport = {
  summary: {
    totalBudget: 0,
    totalFundsCollected: 0,
    totalFundsSpent: 0,
    remainingBudget: 0,
    totalExpectedContributions: 0,
  },
  eventAllocations: [],
};

export const financialReportingService = {
  async getReport(): Promise<FinancialReport> {
    return (await unwrap<FinancialReport | null>(sb().rpc("get_financial_report"))) ?? EMPTY_REPORT;
  },

  /**
   * Per-event Expected/Actual Collection, Outstanding Balance and Collection
   * Performance %, computed entirely in Postgres with is_lsc_officer() so
   * exempt officers are excluded. Never re-derive this on the client.
   */
  async getEventCollectionPerformance(): Promise<EventCollectionPerformance[]> {
    const data = await unwrap(sb().rpc("get_event_collection_performance"));
    if (!Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((row) => ({
      eventId: row.eventId as string,
      eventName: row.eventName as string,
      isNoContribution: (row.isNoContribution as boolean) ?? false,
      ...(Object.fromEntries(PERFORMANCE_NUMBERS.map((key) => [key, Number(row[key]) || 0])) as Record<
        (typeof PERFORMANCE_NUMBERS)[number],
        number
      >),
    }));
  },

  subscribe: (onChange: () => void): (() => void) =>
    subscribeToTables(
      ["events", "students", "lsc_officers", "contributions", "payments", "transactions"],
      onChange,
      "financial-report",
    ),
};
