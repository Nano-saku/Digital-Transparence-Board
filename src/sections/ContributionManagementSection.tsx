import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Coins, CreditCard, FileUp, ListChecks, Pencil, Receipt, RefreshCw, Scale, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import Page from "@/components/ui/Page";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import Field from "@/components/ui/Field";
import SearchInput from "@/components/ui/SearchInput";
import Pagination from "@/components/ui/Pagination";
import { LoadingCard } from "@/components/ui/Skeleton";
import { Menu, MenuContent, MenuItem, MenuSeparator, RowActionsTrigger } from "@/components/ui/Menu";
import ReceiptViewer from "@/components/ReceiptViewer";
import { contributionsService, studentsService, eventsService, paymentsService, lscOfficersService, checkSupabaseConnection } from "@/services/db";
import { useLiveData } from "@/hooks/useLiveData";
import { useSpreadsheetImport } from "@/hooks/useSpreadsheetImport";
import type { ContributionRecord, PaymentItem, Student, Event, UserRole } from "@/types";
import { cn } from "@/lib/utils";
import { canAccess } from "@/lib/roles";
import { formatPeso, formatPhilippineDateTime, today } from "@/lib/format";
import { contributionStatus } from "@/lib/contributions";
import { activeLscOfficerStudentIds } from "@/lib/lscEligibility";
import { autoCreateReceipt, officialReceiptNumber } from "@/lib/receipts";
import { pickField, parseAmount, parsePositiveAmount, normalizeStudentId, expandEventGroups, exactNameKey, looseNameKey } from "@/lib/spreadsheet";

interface ContributionManagementSectionProps {
  onBack: () => void;
  role: UserRole;
  staffName: string;
}

interface ContributionRow extends ContributionRecord {
  studentName: string;
  studentDisplayId: string;
}

type EditForm = Pick<ContributionRecord, "studentId" | "eventId" | "requiredAmount" | "amountPaid">;

/** One parsed & matched (student, event) import entry waiting to be saved. */
interface ParsedEntry {
  student: Student;
  event: Event;
  requiredAmount: number;
  amountPaid: number;
}

const PAGE_SIZE = 20;
const REALTIME_TABLES = ["contributions", "students", "events", "payments", "lsc_officers"] as const;
const EMPTY_TOTALS = { totalRequired: 0, totalPaid: 0, totalBalance: 0 };
// Values understood by contributionsService.getPage().
const STATUS_OPTIONS = [
  ["unpaid", "Unpaid"],
  ["partial", "Partial Payment"],
  ["paid", "Fully Paid"],
] as const;
const IMPORT_HINT =
  "Expected columns: Student ID / Name, then Event, Required Amount, Amount Paid (repeat that trio for each additional event, as in the official Student Body tracking sheet).";

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
/** Events that collect a contribution (zero-allocation and no-contribution events are hidden). */
const collectsContribution = (event: Event) => event.allocationAmount > 0 && !event.isNoContribution;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : ((error as { message?: string } | null)?.message ?? String(error)));

/** Rejects non-positive payments and payments above the remaining balance. */
function paymentAmountError(amount: number, record: Pick<ContributionRecord, "requiredAmount" | "amountPaid">) {
  if (!Number.isFinite(amount) || amount <= 0) return "Payment amount must be greater than zero.";
  const balance = record.requiredAmount - record.amountPaid;
  return amount > balance ? `Payment exceeds the remaining balance of ${formatPeso(balance)}.` : null;
}

/**
 * Matches every spreadsheet row to a student (ID, then exact name, then a loose
 * name match that ignores middle initials / word order — only when unambiguous)
 * and every Event / Required Amount / Amount Paid group on it to an event.
 */
function parseImport(fileRows: Record<string, string>[], students: Student[], events: Event[], officerIds: ReadonlySet<string>) {
  // A key shared by several records maps to null (ambiguous) and never matches.
  const index = <T,>(items: T[], key: (item: T) => string) => {
    const map = new Map<string, T | null>();
    for (const item of items) {
      const k = key(item);
      if (k) map.set(k, map.has(k) ? null : item);
    }
    return map;
  };
  const studentId = (id: string) => normalizeStudentId(id).toLowerCase();
  const eventName = (name: string) => name.trim().toLowerCase();
  const byId = index(students, (s) => studentId(s.studentId));
  const byExactName = index(students, (s) => exactNameKey(s.name));
  const byLooseName = index(students, (s) => looseNameKey(s.name));
  const byEvent = index(events, (e) => eventName(e.name));

  const parsed: ParsedEntry[] = [];
  const problems: string[] = [];
  let matchedStudents = 0;
  let groupsRead = 0;

  for (const row of fileRows) {
    const fileId = pickField(row, "studentid", "studentno", "studentnumber", "studid", "idnumber", "lrn", "id");
    const fileName = pickField(row, "student", "name", "fullname", "studentname");
    const student =
      (fileId && byId.get(studentId(fileId))) || (fileName && (byExactName.get(exactNameKey(fileName)) || byLooseName.get(looseNameKey(fileName)))) || null;
    if (!student) {
      problems.push(`${[fileId, fileName].filter(Boolean).join(" ") || "(blank student)"}: student not found`);
      continue;
    }
    if (officerIds.has(student.id)) {
      problems.push(`${student.name}: active LSC officer (exempt from contributions)`);
      continue;
    }
    matchedStudents++;

    const groups = expandEventGroups(row);
    groupsRead += groups.length;
    for (const group of groups) {
      // Blank, zero or non-numeric Amount Paid = not paid; it never overwrites a recorded payment.
      const amountPaid = parsePositiveAmount(group.amountPaid);
      if (amountPaid === null) continue;
      const event = byEvent.get(eventName(group.eventName));
      if (!event) {
        problems.push(`${student.name}: event "${group.eventName}" not found`);
        continue;
      }
      const requiredAmount = group.requiredAmount.trim() ? parseAmount(group.requiredAmount) : event.allocationAmount;
      if (requiredAmount === null || requiredAmount <= 0) problems.push(`${student.name} – ${event.name}: invalid Required Amount "${group.requiredAmount}"`);
      else if (amountPaid > requiredAmount) problems.push(`${student.name} – ${event.name}: paid ₱${amountPaid} exceeds required ₱${requiredAmount}`);
      else parsed.push({ student, event, requiredAmount, amountPaid });
    }
  }

  const summary =
    `${matchedStudents} of ${fileRows.length} student row(s) matched · ${groupsRead} event group(s) read · ` +
    `${parsed.length} paid entr${parsed.length === 1 ? "y" : "ies"} found`;
  return { parsed, problems, summary };
}

/** First five lines plus an "…and N more" line. */
const firstLines = (lines: string[], more: string) => [...lines.slice(0, 5), lines.length > 5 ? `…and ${lines.length - 5} more${more}` : ""];

const StatusChip = ({ record }: { record: Pick<ContributionRecord, "amountPaid" | "remainingBalance"> }) => {
  const status = contributionStatus(record);
  return <span className={cn(status.className, "whitespace-nowrap")}>{status.label}</span>;
};

export default function ContributionManagementSection({ onBack, role, staffName }: ContributionManagementSectionProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // The opened record and its draft.
  const [editing, setEditing] = useState<{ record: ContributionRow; form: EditForm } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ContributionRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const recordedBy = staffName || "Council Officer";
  // Receipts are issued by the finance roles, i.e. everyone who may open this view.
  const canIssueReceipts = canAccess(role, "contribution-management") === true;
  // Skips realtime reloads while a bulk import runs; the import reloads once at the end.
  const importingRef = useRef(false);

  // Only the records page is critical; the rest degrade to their last good (or empty) data.
  const { data, loading, error: loadError, reload } = useLiveData({
    sources: { page: () => contributionsService.getPage(page - 1, PAGE_SIZE, query, eventFilter, statusFilter) },
    optional: {
      totals: () => contributionsService.getTotals(),
      students: () => studentsService.getAll(),
      events: () => eventsService.getAll(),
      payments: () => paymentsService.getAll(),
      officers: () => lscOfficersService.getAll(),
    },
    deps: [page, query, eventFilter, statusFilter],
    tables: REALTIME_TABLES,
    channel: "contribution-management",
    paused: () => importingRef.current,
    onError: () => toast.error("Failed to load contribution records"),
  });

  const total = data?.page.total ?? 0;
  const totals = data?.totals ?? EMPTY_TOTALS;
  const payments = data?.payments ?? [];
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Deletes/realtime updates can shrink the result set past the current page.
  if (data && page > lastPage) setPage(lastPage);

  // Active LSC officers are exempt from event contributions.
  const { students, events, officerIds, rows } = useMemo(() => {
    const allStudents = data?.students ?? [];
    const officers = activeLscOfficerStudentIds(allStudents, data?.officers ?? []);
    const studentById = new Map(allStudents.map((s) => [s.id, s]));
    return {
      students: [...allStudents].sort(byName),
      events: [...(data?.events ?? [])].sort(byName),
      officerIds: officers,
      rows: (data?.page.data ?? [])
        // An exempt officer with nothing paid is not an unpaid contributor.
        .filter((record) => !(officers.has(record.studentId) && record.amountPaid <= 0))
        .map((record): ContributionRow => ({
          ...record,
          studentName: studentById.get(record.studentId)?.name ?? "Unknown Student",
          studentDisplayId: studentById.get(record.studentId)?.studentId ?? "—",
        })),
    };
  }, [data]);
  const eligibleStudents = useMemo(() => students.filter((s) => !officerIds.has(s.id)), [students, officerIds]);
  const contributionEvents = useMemo(() => events.filter(collectsContribution), [events]);

  // Debounce server-side search.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [search]);

  /** Runs a write with the shared saving flag; `false` when it threw (already toasted). */
  const save = async (action: () => Promise<void>, failure: (error: unknown) => string) => {
    setSaving(true);
    try {
      await action();
      return true;
    } catch (error) {
      console.error(failure(error), error);
      toast.error(failure(error));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ---- Record payment (creates the contribution on first payment) ----------
  // Each installment adds to the running total. A student+event pair keeps one
  // payment row holding the cumulative amount, the installment history and a
  // single OR number that is reused for every later installment.
  const recordPayment = (student: Student, event: Event, amount: number) => {
    if (officerIds.has(student.id)) {
      toast.error(`${student.name} is an active LSC officer and is exempt from event contributions.`);
      return Promise.resolve(false);
    }
    return save(
      async () => {
        const existing = await contributionsService.getByStudentAndEvent(student.id, event.id);
        // Validate before creating anything so a rejected payment leaves no stray record.
        const precheck = paymentAmountError(amount, existing ?? { requiredAmount: event.allocationAmount, amountPaid: 0 });
        if (precheck) throw new Error(precheck);

        let contribution = existing;
        if (!contribution) {
          try {
            contribution = await contributionsService.create({
              studentId: student.id,
              eventId: event.id,
              eventName: event.name,
              requiredAmount: event.allocationAmount,
              amountPaid: 0,
              remainingBalance: event.allocationAmount,
            });
          } catch (createError) {
            // Someone else created it concurrently (unique student+event index) — use theirs.
            contribution = await contributionsService.getByStudentAndEvent(student.id, event.id);
            if (!contribution) throw createError;
            const raced = paymentAmountError(amount, contribution);
            if (raced) throw new Error(raced);
          }
        }

        const { requiredAmount } = contribution;
        const amountPaid = contribution.amountPaid + amount;
        const remainingBalance = Math.max(0, requiredAmount - amountPaid);
        const status: PaymentItem["status"] = remainingBalance <= 0 ? "Fully Paid" : "Partial";
        const date = today();
        const existingPayment = await paymentsService.getByStudentAndEvent(student.id, event.id);
        const paymentItems: PaymentItem[] = [...(existingPayment?.paymentItems ?? []), { amount, date, status }];

        let receipt: string | undefined;
        let orNumber = existingPayment?.orNumber;
        if (canIssueReceipts) {
          try {
            // Reuse the existing OR number — only the first installment mints one.
            orNumber ??= await officialReceiptNumber();
            receipt = await autoCreateReceipt({
              tag: "PAYMENT",
              receiptNumber: orNumber,
              issuedTo: student.name,
              eventName: event.name,
              description: `Payment for ${event.name}`,
              amount: amountPaid,
              type: "income",
              date,
              recordedBy,
              requiredAmount,
              remainingBalance,
              statusLabel: status,
              paymentItems,
            });
          } catch (receiptError) {
            console.warn("Auto receipt generation failed:", receiptError);
          }
        }

        await paymentsService.upsertForStudentAndEvent({
          studentId: student.id,
          studentName: student.name,
          eventId: event.id,
          eventName: event.name,
          contributionId: contribution.id,
          amount: amountPaid,
          date,
          recordedBy,
          receiptUrl: receipt ?? existingPayment?.receiptUrl,
          orNumber,
          paymentItems,
        });
        await contributionsService.update(contribution.id, { eventName: event.name, requiredAmount, amountPaid, remainingBalance });
        if (receipt) toast.success("An official receipt was generated and attached automatically.");
        toast.success("Payment recorded successfully!");
        await reload();
      },
      (error) => (error instanceof Error ? error.message : "Failed to record payment"),
    );
  };

  // ---- Edit -----------------------------------------------------------------
  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const { studentId, eventId, requiredAmount, amountPaid } = editing.form;
    if (!studentId || !eventId) return toast.error("Please select both a student and an event");
    if (requiredAmount <= 0) return toast.error("Required amount must be greater than zero");
    if (amountPaid < 0) return toast.error("Amount paid cannot be negative");
    const student = students.find((s) => s.id === studentId);
    const event = events.find((ev) => ev.id === eventId);
    if (!student || !event) return toast.error("Selected student or event no longer exists");

    await save(
      async () => {
        // One record per student + event; the table only holds one page, so ask the database.
        const existing = await contributionsService.getByStudentAndEvent(studentId, eventId);
        if (existing && existing.id !== editing.record.id) {
          toast.error(`${student.name} already has a contribution record for ${event.name}.`);
          return;
        }
        await contributionsService.update(editing.record.id, {
          studentId,
          eventId,
          eventName: event.name,
          requiredAmount,
          amountPaid,
          remainingBalance: Math.max(0, requiredAmount - amountPaid),
        });
        toast.success("Contribution updated successfully");
        setEditing(null);
        await reload();
      },
      () => "Failed to save contribution record",
    );
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    await save(
      async () => {
        await contributionsService.delete(toDelete.id);
        toast.success(`${toDelete.studentName}'s contribution record has been deleted.`);
        setToDelete(null);
        await reload();
      },
      () => `Failed to delete ${toDelete.studentName}'s contribution record.`,
    );
  };

  // ---- CSV / Excel import ---------------------------------------------------
  const importRows = async (fileRows: Record<string, string>[]) => {
    if (fileRows.length === 0) return void toast.error("File is empty or invalid");
    // Imported payments are written straight to Supabase and never queued offline.
    if (!(await checkSupabaseConnection())) {
      return void toast.error(
        "You are offline or the database cannot be reached. Connect to the internet and import again — imported payments are not queued offline.",
      );
    }

    const { parsed, problems, summary } = parseImport(fileRows, students, events, officerIds);
    if (problems.length > 0) console.warn("Contribution import — rows not imported:", problems);
    if (parsed.length === 0) {
      return void toast.error("No paid entries to import", { description: [summary, ...firstLines(problems, "")].filter(Boolean).join("\n"), duration: 10000 });
    }

    importingRef.current = true;
    const progress = (n: number) => `Saving ${n} of ${parsed.length} payment(s)...`;
    const toastId = toast.loading(progress(1));
    let saved = 0;
    let skipped = 0;
    let receiptsIssued = 0;
    const failures: string[] = [];
    const label = (item: ParsedEntry) => `${item.student.name} – ${item.event.name}`;

    try {
      // Strictly sequential: each entry is fully written (payment, totals,
      // receipt, audit) before the next starts, so OR numbers follow the file
      // order and a failure only affects its own entry.
      for (const [index, item] of parsed.entries()) {
        if (!navigator.onLine) {
          failures.push(...parsed.slice(index).map((r) => `${label(r)}: connection lost`));
          break;
        }
        toast.loading(progress(index + 1), { id: toastId });
        try {
          const result = await paymentsService.importPaidEntryDirect({ ...item, recordedBy, issueReceipt: canIssueReceipts });
          if (result.status === "saved") {
            saved++;
            if (result.receiptIssued) receiptsIssued++;
          } else {
            skipped++;
            console.info(`Import skipped ${label(item)}: ${result.reason}`);
          }
        } catch (error) {
          failures.push(`${label(item)}: ${errorMessage(error)}`);
          console.error(`Error importing ${label(item)}:`, error);
        }
      }
    } finally {
      importingRef.current = false;
      toast.dismiss(toastId);
      await reload();
    }

    if (failures.length > 0) console.error("Contribution import — failed entries:", failures);
    const title = `Import finished: ${saved} saved, ${skipped} already recorded (skipped), ${failures.length} failed`;
    const description = [summary, receiptsIssued > 0 ? `${receiptsIssued} receipt(s) generated` : "", ...firstLines([...failures, ...problems], " (see browser console)")]
      .filter(Boolean)
      .join("\n");
    if (failures.length > 0 || problems.length > 0) toast.warning(title, { description, duration: 15000 });
    else toast.success(title, { description, duration: 8000 });
  };

  const { importing, handleFileSelected, importInputRef } = useSpreadsheetImport({ onRows: importRows });

  return (
    <Page
      eyebrow="Finance"
      title="Contributions & Payments"
      subtitle="Track balances, record payments, and manage each student's contribution to every event."
      onBack={onBack}
      actions={
        <>
          <button
            onClick={() => importInputRef.current?.click()}
            className="btn btn-light"
            disabled={loading || importing}
            title={`Import contribution records from a CSV or Excel (.xlsx) file. ${IMPORT_HINT} A receipt is generated automatically for every imported row with a payment.`}
          >
            <FileUp className="h-4 w-4" />
            {importing ? "Importing…" : "Import CSV / Excel"}
          </button>
          <button onClick={() => setPaymentOpen(true)} className="btn btn-primary" disabled={loading || importing}>
            Record payment
            <span className="btn-orb">
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </button>
        </>
      }
      hero={
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard featured icon={Wallet} label="Total collected" value={formatPeso(totals.totalPaid)} hint="payments received" />
          <StatCard icon={Coins} label="Total collectable" value={formatPeso(totals.totalRequired)} hint="required contributions" />
          <StatCard icon={Scale} tone="warning" label="Outstanding" value={formatPeso(totals.totalBalance)} hint="remaining balances" />
          <StatCard icon={ListChecks} tone="success" label="Records" value={total.toLocaleString()} hint="matching current filters" />
        </div>
      }
    >
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Recent payments */}
      <section className="card p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="icon-tile">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-ink">Recent payments</h2>
            <p className="text-xs text-muted">Latest recorded student payments</p>
          </div>
        </div>
        {payments.length === 0 ? (
          <EmptyState icon={CreditCard} title="No payments recorded yet" />
        ) : (
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            {payments.slice(0, 8).map((payment) => {
              const record = rows.find((r) => r.id === payment.contributionId || (r.studentId === payment.studentId && r.eventId === payment.eventId));
              return (
                <div key={payment.id} className="flex min-w-[230px] shrink-0 flex-col gap-2 rounded-2xl border border-line bg-surface-2 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{payment.studentName}</p>
                      <p className="truncate text-xs text-muted">{payment.eventName}</p>
                    </div>
                    <p className="shrink-0 font-bold text-success">{formatPeso(payment.amount)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{formatPhilippineDateTime(payment.recordedAt)}</span>
                    {record && <StatusChip record={record} />}
                  </div>
                  {payment.receiptUrl && (
                    <button className="btn btn-ghost btn-sm -mb-1 self-start px-2" onClick={() => setReceiptUrl(payment.receiptUrl!)}>
                      <Receipt className="h-3.5 w-3.5" />
                      Receipt{payment.orNumber && ` · ${payment.orNumber}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by student name or ID…" className="flex-1" />
        {(
          [
            ["Filter by event", eventFilter, setEventFilter, "All events", contributionEvents.map((e) => [e.id, e.name] as const), "sm:w-56"],
            ["Filter by status", statusFilter, setStatusFilter, "All statuses", STATUS_OPTIONS, "sm:w-48"],
          ] as const
        ).map(([label, value, set, all, options, width]) => (
          <select
            key={label}
            value={value}
            onChange={(e) => {
              set(e.target.value);
              setPage(1);
            }}
            className={cn("input", width)}
            aria-label={label}
          >
            <option value="">{all}</option>
            {options.map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ))}
          </select>
        ))}
      </div>

      {/* Records */}
      {loading ? (
        <LoadingCard label="Loading contribution records…" />
      ) : loadError ? (
        <div className="card">
          <EmptyState
            icon={Coins}
            title="Unable to load contribution records"
            description={loadError}
            action={
              <button onClick={() => void reload()} className="btn btn-primary">
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState icon={Coins} title="No contribution records found" description="Try a different search or filter, or record a payment." />
          ) : (
            <div data-lenis-prevent className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Event</th>
                    <th className="text-right">Required</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Balance</th>
                    <th>Status</th>
                    <th className="w-12" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <p className="font-semibold">{record.studentName}</p>
                        <p className="text-xs text-muted">{record.studentDisplayId}</p>
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1.5 text-muted">
                          <CalendarDays className="h-4 w-4" />
                          {record.eventName}
                        </span>
                      </td>
                      <td className="text-right tabular-nums text-muted">{formatPeso(record.requiredAmount)}</td>
                      <td className="text-right font-semibold tabular-nums text-success">{formatPeso(record.amountPaid)}</td>
                      <td className="text-right tabular-nums">{formatPeso(record.remainingBalance)}</td>
                      <td>
                        <StatusChip record={record} />
                      </td>
                      <td className="text-right">
                        <Menu>
                          <RowActionsTrigger label={`Actions for ${record.studentName}`} />
                          <MenuContent>
                            <MenuItem
                              onSelect={() =>
                                setEditing({
                                  record,
                                  form: { studentId: record.studentId, eventId: record.eventId, requiredAmount: record.requiredAmount, amountPaid: record.amountPaid },
                                })
                              }
                            >
                              <Pencil />
                              Edit
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem danger onSelect={() => setToDelete(record)}>
                              <Trash2 />
                              Delete
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={lastPage} totalItems={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </div>
      )}

      {editing && (
        <EditContributionModal
          form={editing.form}
          onChange={(form) => setEditing({ ...editing, form })}
          onSubmit={saveEdit}
          onClose={() => !saving && setEditing(null)}
          // Keep the record's own student/event selectable even if it is no longer eligible.
          students={students.filter((s) => !officerIds.has(s.id) || s.id === editing.record.studentId)}
          events={events.filter((ev) => collectsContribution(ev) || ev.id === editing.record.eventId)}
          saving={saving}
        />
      )}

      {paymentOpen && (
        <RecordPaymentModal
          students={eligibleStudents}
          events={contributionEvents}
          saving={saving}
          onClose={() => !saving && setPaymentOpen(false)}
          onSubmit={async (student, event, amount) => (await recordPayment(student, event, amount)) && setPaymentOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        loading={saving}
        title="Delete contribution"
        description={`Delete ${toDelete?.studentName ?? "this student"}'s contribution record for ${toDelete?.eventName ?? "this event"}? This cannot be undone.`}
        confirmLabel="Delete contribution"
      />

      <ReceiptViewer receiptUrl={receiptUrl} onClose={() => setReceiptUrl(null)} title="Payment Receipt" />
    </Page>
  );
}

// ---------------------------------------------------------------------------

function ModalFooter({ formId, saving, disabled, label, busyLabel, onClose }: { formId: string; saving: boolean; disabled: boolean; label: string; busyLabel: string; onClose: () => void }) {
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
        Cancel
      </button>
      <button type="submit" form={formId} className="btn btn-primary" disabled={saving || disabled}>
        {saving ? busyLabel : label}
      </button>
    </>
  );
}

const EventSelect = ({ value, onChange, events, disabled }: { value: string; onChange: (id: string) => void; events: Event[]; disabled: boolean }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className="input" disabled={disabled}>
    <option value="">Select event…</option>
    {events.map((ev) => (
      <option key={ev.id} value={ev.id}>
        {ev.name}
      </option>
    ))}
  </select>
);

interface EditContributionModalProps {
  form: EditForm;
  onChange: (form: EditForm) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
  students: Student[];
  events: Event[];
  saving: boolean;
}

function EditContributionModal({ form, onChange, onSubmit, onClose, students, events, saving }: EditContributionModalProps) {
  const set = (patch: Partial<EditForm>) => onChange({ ...form, ...patch });
  const balance = Math.max(0, form.requiredAmount - form.amountPaid);

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit contribution"
      icon={<Pencil className="h-5 w-5" />}
      size="lg"
      footer={
        <ModalFooter
          formId="edit-contribution"
          saving={saving}
          disabled={!form.studentId || !form.eventId || form.requiredAmount <= 0}
          label="Save changes"
          busyLabel="Saving…"
          onClose={onClose}
        />
      }
    >
      <form id="edit-contribution" onSubmit={onSubmit} className="space-y-4">
        <Field label="Student">
          <select value={form.studentId} onChange={(e) => set({ studentId: e.target.value })} className="input" disabled={saving}>
            <option value="">Select student…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.studentId} – {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Event">
          <EventSelect value={form.eventId} onChange={(eventId) => set({ eventId })} events={events} disabled={saving} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Required amount (₱)">
            <AmountInput value={form.requiredAmount} onChange={(requiredAmount) => set({ requiredAmount })} disabled={saving} />
          </Field>
          <Field label="Amount paid (₱)">
            <AmountInput value={form.amountPaid} onChange={(amountPaid) => set({ amountPaid })} disabled={saving} />
          </Field>
        </div>
        <SummaryLine label="Remaining balance">
          <span className={cn("font-bold", balance > 0 ? "text-danger" : "text-success")}>{formatPeso(balance)}</span>
        </SummaryLine>
      </form>
    </Modal>
  );
}

interface RecordPaymentModalProps {
  /** Students who owe contributions (active LSC officers excluded). */
  students: Student[];
  /** Events that collect a contribution. */
  events: Event[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (student: Student, event: Event, amount: number) => void;
}

function RecordPaymentModal({ students, events, saving, onClose, onSubmit }: RecordPaymentModalProps) {
  const [student, setStudent] = useState<Student | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [eventId, setEventId] = useState("");
  const [amount, setAmount] = useState(0);
  // The selected pair's existing record (may live on any table page, so it is fetched).
  const [existing, setExisting] = useState<ContributionRecord | null>(null);
  const lookupRef = useRef(0);

  const event = events.find((ev) => ev.id === eventId);
  const needle = studentQuery.trim().toLowerCase();
  const matches =
    pickerOpen && needle && !student ? students.filter((s) => s.name.toLowerCase().includes(needle) || s.studentId.toLowerCase().includes(needle)).slice(0, 8) : [];

  const select = (nextStudent: Student | null, nextEventId: string) => {
    setStudent(nextStudent);
    setEventId(nextEventId);
    const id = ++lookupRef.current;
    setExisting(null);
    if (!nextStudent || !nextEventId) return;
    contributionsService
      .getByStudentAndEvent(nextStudent.id, nextEventId)
      .then((record) => id === lookupRef.current && setExisting(record))
      .catch((error) => console.warn("Contribution lookup failed:", error));
  };

  const required = existing?.requiredAmount ?? event?.allocationAmount;
  const balance = required !== undefined ? required - (existing?.amountPaid ?? 0) : undefined;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!student || !event) return void toast.error("Please select both student and event");
    onSubmit(student, event, amount);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Record payment"
      description="A contribution record is created automatically on a student's first payment. Partial payments are added to the running total."
      icon={<CreditCard className="h-5 w-5" />}
      size="lg"
      footer={<ModalFooter formId="record-payment" saving={saving} disabled={!student || !eventId || amount <= 0} label="Record payment" busyLabel="Recording…" onClose={onClose} />}
    >
      <form id="record-payment" onSubmit={submit} className="space-y-4">
        <div className="relative">
          <Field label="Student">
            <input
              value={studentQuery}
              onChange={(e) => {
                setStudentQuery(e.target.value);
                setPickerOpen(true);
                select(null, eventId);
              }}
              onFocus={() => setPickerOpen(true)}
              onBlur={() => setPickerOpen(false)}
              placeholder="Search by name or student ID…"
              className="input"
              disabled={saving}
              autoComplete="off"
            />
          </Field>
          {matches.length > 0 && (
            <ul data-lenis-prevent className="card absolute z-10 mt-1 max-h-56 w-full overflow-y-auto p-1.5 shadow-lift">
              {matches.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    // mousedown fires before the input's blur closes the list
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setStudentQuery(`${s.name} (${s.studentId})`);
                      setPickerOpen(false);
                      select(s, eventId);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    <span className="truncate font-medium text-ink">{s.name}</span>
                    <span className="shrink-0 text-xs text-muted">{s.studentId}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Field label="Event">
          <EventSelect value={eventId} onChange={(id) => select(student, id)} events={events} disabled={saving} />
        </Field>
        <Field label="Amount (₱)" hint={balance !== undefined && balance > 0 ? `Up to ${formatPeso(balance)} remaining` : undefined}>
          <AmountInput value={amount} onChange={setAmount} disabled={saving} />
        </Field>

        {student && event && required !== undefined && (
          <div className="space-y-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm">
            <SummaryLine label="Required">{formatPeso(required)}</SummaryLine>
            {existing && <SummaryLine label="Already paid">{formatPeso(existing.amountPaid)}</SummaryLine>}
            <SummaryLine label="Status">
              <StatusChip record={existing ?? { amountPaid: 0, remainingBalance: required }} />
            </SummaryLine>
          </div>
        )}
      </form>
    </Modal>
  );
}

function AmountInput({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted">₱</span>
      <input
        type="number"
        min={0}
        step={0.01}
        inputMode="decimal"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value))}
        placeholder="0.00"
        className="input pl-8 tabular-nums"
        disabled={disabled}
      />
    </div>
  );
}

const SummaryLine = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-muted">{label}</span>
    <span className="font-semibold text-ink">{children}</span>
  </div>
);
