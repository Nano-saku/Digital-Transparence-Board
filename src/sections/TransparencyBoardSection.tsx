import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, ChevronDown, Download, Eye, FileText, MessageCircle, Pencil, PieChart, Plus, Trash2, TrendingDown, TrendingUp, Upload } from "lucide-react";
import type { ViewState, Transaction, FinancialReport, EventAllocation, UserRole, Event } from "@/types";
import { transactionsService, financialReportingService, eventsService } from "@/services/db";
import { uploadReceiptFile } from "@/lib/receipts";
import { formatDate, today, formatPeso } from "@/lib/format";
import { canAccess } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { downloadReport, printTable, type Column, type PrintableReport } from "@/lib/printReport";
import { useSearch } from "@/hooks/useSearch";
import { usePagination } from "@/hooks/usePagination";
import ReceiptViewer from "@/components/ReceiptViewer";
import DataTable, { type DataColumn } from "@/components/DataTable";
import Page from "@/components/ui/Page";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Field from "@/components/ui/Field";
import EmptyState from "@/components/ui/EmptyState";
import SearchInput from "@/components/ui/SearchInput";
import Pagination from "@/components/ui/Pagination";
import { LoadingCard } from "@/components/ui/Skeleton";
import { Reveal as DisclosureReveal } from "@/components/ui/Disclosure";
import { Menu, MenuContent, MenuItem, MenuSeparator, RowActionsTrigger } from "@/components/ui/Menu";

interface TransparencyBoardSectionProps {
  adminMode?: boolean;
  onBack?: () => void;
  onNavigate?: (view: ViewState) => void;
  role?: UserRole;
  staffName?: string;
}

type TxForm = { date: string; description: string; eventId: string; amount: number; receiptFile: File | null };

const emptyForm = (): TxForm => ({ date: today(), description: "", eventId: "", amount: 0, receiptFile: null });
const txText = (t: Transaction) => `${t.description} ${t.eventName ?? ""}`;
// Expected total after excluding current LSC officers (0 when not reported).
const expectedCollection = (a: EventAllocation) => (a.expectedAmount != null ? Number(a.expectedAmount) : 0);
const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0);

export default function TransparencyBoardSection({ adminMode = false, onBack, onNavigate, role, staffName = "" }: TransparencyBoardSectionProps) {
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openAllocation, setOpenAllocation] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  // `editing`: null = closed, "new" = add, Transaction = edit.
  const [editing, setEditing] = useState<Transaction | "new" | null>(null);
  const [form, setForm] = useState<TxForm>(emptyForm);
  const [toDelete, setToDelete] = useState<Transaction | null>(null);

  // Only the finance roles (admin, treasurer, auditor) manage the ledger and download the report.
  const canManage = adminMode && !!canAccess(role ?? null, "transaction-management");

  const { query, setQuery, filtered } = useSearch(transactions, txText);
  const { pageItems, pagination } = usePagination(filtered, 10, query);

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [reportData, txData, eventsData] = await Promise.all([
        financialReportingService.getReport(),
        transactionsService.getAll(),
        eventsService.getAll(),
      ]);
      setReport(reportData);
      setTransactions(txData);
      setEvents(eventsData);
    } catch (error) {
      console.error("Error loading transparency data:", error);
      toast.error("Failed to load financial data");
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  // Initial load + live reload whenever any source table changes.
  useEffect(() => {
    loadData();
    return financialReportingService.subscribe(() => loadData(false));
  }, [loadData]);

  const exportReport = async () => {
    if (!canManage) return void toast.error("You do not have permission to download this report");
    if (!report) return;
    setDownloading(true);
    try {
      await downloadReport(`transparency-board-report-${today()}.html`, financialReport(report, transactions));
      toast.success("Report downloaded. Open it in a browser and use Print > Save as PDF to export.");
    } catch (error) {
      console.error("Error downloading report:", error);
      toast.error("Failed to download report");
    } finally {
      setDownloading(false);
    }
  };

  const openForm = (tx?: Transaction) => {
    setEditing(tx ?? "new");
    setForm(tx ? { date: tx.date.slice(0, 10), description: tx.description, eventId: tx.eventId ?? "", amount: tx.amount, receiptFile: null } : emptyForm());
  };

  const saveTransaction = async () => {
    if (!editing) return;
    if (!form.description.trim() || form.amount <= 0) return void toast.error("Please enter a description and a valid amount");
    const existing = editing === "new" ? null : editing;
    setSaving(true);
    try {
      // Receipts are scans/photos of the physical receipt; keep the current
      // one when editing unless a replacement was chosen.
      const receiptUrl = form.receiptFile ? await uploadReceiptFile(form.receiptFile) : existing?.receiptUrl;
      const payload: Omit<Transaction, "id"> = {
        date: form.date,
        description: form.description.trim(),
        eventId: form.eventId || undefined,
        eventName: events.find((e) => e.id === form.eventId)?.name,
        amount: form.amount,
        // New entries are expenses (income is tracked via contributions);
        // editing keeps the original type.
        type: existing?.type ?? "expense",
        responsibleOfficer: staffName || "Council Officer",
        receiptUrl,
      };
      if (existing) await transactionsService.update(existing.id, payload);
      else await transactionsService.create(payload);
      toast.success(existing ? "Transaction updated successfully" : "Transaction added to the ledger");
      setEditing(null);
      await loadData(false);
    } catch (error) {
      console.error("Error saving transaction:", error);
      toast.error("Failed to save transaction");
    } finally {
      setSaving(false);
    }
  };

  const deleteTransaction = async () => {
    if (!toDelete) return;
    setSaving(true);
    try {
      await transactionsService.delete(toDelete.id);
      setToDelete(null);
      toast.success("Transaction deleted");
      await loadData(false);
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast.error("Failed to delete transaction");
    } finally {
      setSaving(false);
    }
  };

  const columns: DataColumn<Transaction>[] = [
    { header: "Date", cell: (t) => formatDate(t.date), className: "whitespace-nowrap text-muted" },
    { header: "Description", cell: (t) => t.description, className: "font-medium" },
    { header: "Event", cell: (t) => t.eventName || "—", className: "text-muted" },
    { header: "Type", cell: (t) => <TypeChip income={t.type === "income"} /> },
    {
      header: "Amount",
      right: true,
      className: "whitespace-nowrap font-semibold",
      cell: (t) => <span className={t.type === "income" ? "text-success" : "text-danger"}>{`${t.type === "income" ? "+" : "−"}${formatPeso(t.amount)}`}</span>,
    },
    { header: "Officer", cell: (t) => t.responsibleOfficer, className: "whitespace-nowrap text-muted" },
    {
      header: "Receipt",
      cell: (t) =>
        t.receiptUrl ? (
          <button onClick={() => setReceipt(t.receiptUrl!)} className="btn btn-secondary btn-sm">
            <Eye className="h-3.5 w-3.5" /> View
          </button>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    ...(canManage
      ? [
          {
            header: "",
            cell: (t: Transaction) => (
              <Menu>
                <RowActionsTrigger label={`Actions for ${t.description}`} />
                <MenuContent>
                  <MenuItem onSelect={() => openForm(t)}><Pencil /> Edit</MenuItem>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => setToDelete(t)}><Trash2 /> Delete</MenuItem>
                </MenuContent>
              </Menu>
            ),
          },
        ]
      : []),
  ];

  const summary = report?.summary;
  const allocations = report?.eventAllocations ?? [];
  const editingIncome = editing !== "new" && editing?.type === "income";

  return (
    <Page
      eyebrow={adminMode ? "Finance" : "Open books"}
      title={adminMode ? "Transaction Ledger" : "Transparency Board"}
      subtitle={
        adminMode
          ? "Record council expenses, attach receipts and keep the public board up to date."
          : "Real-time financial transparency. Track every contribution, expense and allocation."
      }
      onBack={onBack}
      actions={
        canManage && (
          <>
            <button
              onClick={exportReport}
              disabled={!report || downloading}
              className="btn border border-white/25 bg-white/10 text-white hover:bg-white/20"
            >
              <Download className="h-4 w-4" /> {downloading ? "Preparing…" : "Download report"}
            </button>
            <button onClick={() => openForm()} className="btn btn-light">
              <Plus className="h-4 w-4" /> Add transaction
            </button>
          </>
        )
      }
      hero={
        // The lead figure, then its parts, in one strip.
        <div className="card grid overflow-hidden lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {loading || !summary ? (
            <div className="h-36 animate-pulse lg:col-span-4" />
          ) : (
            <>
              <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
                <p className="text-xs font-semibold text-muted">Remaining budget</p>
                <p className="mt-2 text-4xl font-extrabold tabular-nums tracking-tight text-ink">{formatPeso(summary.remainingBudget)}</p>
                <SpentBar className="mt-4 h-1.5 bg-surface-2" fill="bg-[#1449ff]" caption="text-muted" percent={pct(summary.totalFundsSpent, summary.totalFundsCollected)} />
              </div>
              <div className="grid grid-cols-3 lg:col-span-3 [&>*+*]:border-l [&>*+*]:border-line">
                <Figure label="Collected" value={formatPeso(summary.totalFundsCollected)} />
                <Figure label="Spent" value={formatPeso(summary.totalFundsSpent)} />
                <Figure label="Contribution total" value={formatPeso(summary.totalBudget)} />
              </div>
            </>
          )}
        </div>
      }
    >
      {loading ? (
        <LoadingCard rows={6} label="Loading financial data…" />
      ) : (
        <>
          <section className="card overflow-hidden">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="icon-tile"><FileText className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-bold text-ink">Transactions</h2>
                  <p className="text-xs text-muted">{transactions.length} recorded</p>
                </div>
              </div>
              <SearchInput value={query} onChange={setQuery} placeholder="Search transactions…" className="w-full sm:w-72" />
            </div>
            {filtered.length === 0 ? (
              <EmptyState icon={FileText} title={query ? "No matching transactions" : "No transactions yet"} />
            ) : (
              <>
                <DataTable columns={columns} rows={pageItems} rowKey={(t) => t.id} />
                <Pagination {...pagination} />
              </>
            )}
          </section>

          <section>
            <SectionHeading eyebrow="By event" title="Event allocations" />
            {allocations.length === 0 ? (
              <div className="card">
                <EmptyState icon={PieChart} title="No event allocations yet" />
              </div>
            ) : (
              <div className="card overflow-hidden p-0">
                {/* At a glance: event, collected, how much is used. Details open on demand. */}
                <ul className="divide-y divide-line/40">
                  {allocations.map((a) => (
                    <AllocationRow key={a.eventId} allocation={a} open={openAllocation === a.eventId} onToggle={() => setOpenAllocation((id) => (id === a.eventId ? null : a.eventId))} />
                  ))}
                </ul>
              </div>
            )}
          </section>

          {!adminMode && onNavigate && (
            <section className="card-brand flex flex-col items-start gap-5 p-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-extrabold">Have a question about the numbers?</h2>
                <p className="mt-1 text-sm text-white/75">Ask the council directly — every inquiry is answered by an officer.</p>
              </div>
              <button onClick={() => onNavigate("inquiry")} className="btn btn-light btn-lg">
                <MessageCircle className="h-4 w-4" /> Submit inquiry
                <span className="btn-orb bg-brand-500 text-white"><ArrowRight className="h-4 w-4" /></span>
              </button>
            </section>
          )}
        </>
      )}

      <ReceiptViewer receiptUrl={receipt} onClose={() => setReceipt(null)} title="Receipt" />

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        icon={<FileText className="h-5 w-5 text-brand-500" />}
        title={editing === "new" ? "Add transaction" : "Edit transaction"}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={saveTransaction} disabled={saving}>
              {saving ? "Saving…" : editing === "new" ? "Add transaction" : "Save changes"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Amount (₱)">
              <input
                type="number"
                min={0}
                className="input"
                placeholder="0"
                value={form.amount || ""}
                onChange={(e) => setForm({ ...form, amount: parseInt(e.target.value) || 0 })}
              />
            </Field>
          </div>
          <Field label="Description">
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g., Venue rental for General Assembly" />
          </Field>
          <Field label="Event (optional)">
            <select className="input" value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })}>
              <option value="">No event</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Physical receipt (optional)"
            hint={`PDF or image, up to 10 MB.${editing !== "new" && editing?.receiptUrl && !form.receiptFile ? " The current receipt is kept unless you choose a replacement." : ""}`}
          >
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setForm({ ...form, receiptFile: e.target.files?.[0] ?? null })}
              className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-brand-500/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-600"
            />
          </Field>
          {form.receiptFile && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
              <Upload className="h-3.5 w-3.5" /> {form.receiptFile.name}
            </p>
          )}
          <p className="flex items-center gap-2 text-xs text-muted">
            Type
            <TypeChip income={editingIncome} />
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => !saving && setToDelete(null)}
        onConfirm={deleteTransaction}
        loading={saving}
        title="Delete transaction"
        confirmLabel="Delete transaction"
        description={<>Delete <b className="text-ink">"{toDelete?.description}"</b>? This cannot be undone.</>}
      />
    </Page>
  );
}

function TypeChip({ income }: { income: boolean }) {
  return (
    <span className={`chip ${income ? "chip-success" : "chip-danger"}`}>
      {income ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {income ? "Income" : "Expense"}
    </span>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-center p-4 sm:p-5">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1.5 truncate text-lg font-bold tabular-nums tracking-tight text-ink sm:text-xl">{value}</p>
    </div>
  );
}

/** "N% of collected funds spent" progress bar. */
function AllocationRow({ allocation: a, open, onToggle }: { allocation: EventAllocation; open: boolean; onToggle: () => void }) {
  const used = pct(a.totalSpent, a.totalCollected);
  const expected = expectedCollection(a);
  const id = `allocation-${a.eventId}`;
  const details: [string, string][] = [
    ["Spent", formatPeso(a.totalSpent)],
    ["Balance", formatPeso(a.remainingBalance)],
    ["Per student", formatPeso(a.allocationAmount)],
    ...(expected > 0 ? [["Expected", formatPeso(expected)] as [string, string]] : []),
  ];
  return (
    <li>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-white/[.04] sm:grid-cols-[minmax(0,1fr)_9rem_minmax(8rem,14rem)_auto] sm:px-6">
        <span className="col-start-1 row-start-1 min-w-0 truncate font-semibold text-ink" title={a.eventName}>{a.eventName}</span>
        <span className="col-start-2 row-start-1 text-right font-bold tabular-nums text-ink">{formatPeso(a.totalCollected)}</span>
        <span className="col-span-3 row-start-2 flex items-center gap-3 sm:col-span-1 sm:col-start-3 sm:row-start-1">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
            <span className="block h-full rounded-full bg-[#8ff4ff]" style={{ width: `${used}%` }} />
          </span>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{used}%</span>
        </span>
        <ChevronDown className={cn("col-start-3 row-start-1 h-4 w-4 text-muted transition-[rotate] duration-500 sm:col-start-4", open && "[rotate:180deg]")} />
      </button>
      <DisclosureReveal open={open} id={id}>
        <dl className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-4 sm:px-6">
          {details.map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-surface-2 px-4 py-3">
              <dt className="text-[11px] font-medium text-muted">{label}</dt>
              <dd className="mt-0.5 font-bold tabular-nums text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </DisclosureReveal>
    </li>
  );
}

function SpentBar({ percent, className, fill, caption }: { percent: number; className: string; fill: string; caption: string }) {
  return (
    <div>
      <div className={`overflow-hidden rounded-full ${className}`}>
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${percent}%` }} />
      </div>
      <p className={`mt-1.5 text-xs ${caption}`}>{percent}% of collected funds spent</p>
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4 pt-2">
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="mt-2 text-xl font-extrabold text-ink lg:text-2xl">{title}</h2>
    </div>
  );
}

const money = <T,>(label: string, get: (row: T) => number): Column<T> => ({ label, align: "right", value: (row) => formatPeso(get(row)) });

/** The official printable financial report: summary, allocations, then the ledger on its own page. */
const financialReport = ({ summary, eventAllocations }: FinancialReport, transactions: Transaction[]): PrintableReport => ({
  title: "Student Council Financial Report",
  kind: "Financial",
  meta: [
    ["Report Type", "Official Financial Report"],
    ["Reporting Scope", "All recorded events and transactions"],
    ["Events Covered", eventAllocations.length],
    ["Transactions Recorded", transactions.length],
  ],
  summary: [
    { label: "Total Contribution Amount", value: formatPeso(summary.totalBudget) },
    { label: "Funds Collected", value: formatPeso(summary.totalFundsCollected), tone: "success" },
    { label: "Funds Spent", value: formatPeso(summary.totalFundsSpent), tone: "danger" },
    { label: "Remaining Budget", value: formatPeso(summary.remainingBudget), tone: "brand" },
  ],
  tables: [
    printTable<EventAllocation>({
      heading: "Event Allocations",
      rows: eventAllocations,
      empty: "No allocations recorded.",
      columns: [
        { label: "Event", value: (a) => a.eventName },
        money("Allocation", (a) => a.allocationAmount),
        money("Expected Collection", expectedCollection),
        money("Collected", (a) => a.totalCollected),
        money("Spent", (a) => a.totalSpent),
        money("Balance", (a) => a.remainingBalance),
      ],
    }),
    printTable<Transaction>({
      heading: "Transaction Ledger",
      newPage: true,
      rows: transactions,
      empty: "No transactions recorded.",
      columns: [
        { label: "Date", value: (t) => formatDate(t.date) },
        { label: "Description", value: (t) => t.description },
        { label: "Event", value: (t) => t.eventName || "-" },
        { label: "Type", value: (t) => (t.type === "income" ? "Income" : "Expense"), pill: (t) => (t.type === "income" ? "success" : "danger") },
        { label: "Amount", align: "right", value: (t) => `${t.type === "income" ? "+" : "-"}${formatPeso(t.amount)}`, tone: (t) => (t.type === "income" ? "success" : "danger") },
        { label: "Officer", value: (t) => t.responsibleOfficer },
      ],
    }),
  ],
});
