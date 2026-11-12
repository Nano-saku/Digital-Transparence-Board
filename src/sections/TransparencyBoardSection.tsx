import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Download, Eye, FileText, MessageCircle, Pencil, PieChart, Plus, Trash2, TrendingDown, TrendingUp, Upload, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ViewState, Transaction, FinancialReport, EventAllocation, UserRole, Event } from "@/types";
import { transactionsService, financialReportingService, eventsService } from "@/services/db";
import { blobToDataUri, downloadBlob, uploadReceiptFile } from "@/lib/receipts";
import { formatDate, today, formatPeso } from "@/lib/format";
import { useSearch } from "@/hooks/useSearch";
import { usePagination } from "@/hooks/usePagination";
import ReceiptViewer from "@/components/ReceiptViewer";
import Page from "@/components/ui/Page";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Field from "@/components/ui/Field";
import EmptyState from "@/components/ui/EmptyState";
import SearchInput from "@/components/ui/SearchInput";
import Pagination from "@/components/ui/Pagination";
import { LoadingCard } from "@/components/ui/Skeleton";
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
  const [downloading, setDownloading] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  // `editing`: null = closed, "new" = add, Transaction = edit.
  const [editing, setEditing] = useState<Transaction | "new" | null>(null);
  const [form, setForm] = useState<TxForm>(emptyForm);
  const [toDelete, setToDelete] = useState<Transaction | null>(null);

  // Only the admin, treasurer and auditor manage the ledger and download the report.
  const canManage = adminMode && (role === "admin" || role === "treasurer" || role === "auditor");

  const { query, setQuery, filtered } = useSearch(transactions, txText);
  const { pageItems, pagination } = usePagination(filtered, 10);

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

  const downloadReport = async () => {
    if (!canManage) return void toast.error("You do not have permission to download this report");
    if (!report) return;
    setDownloading(true);
    try {
      const html = buildReportHtml(report, transactions, await loadReportLogos());
      downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `transparency-board-report-${today()}.html`);
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

  const summary = report?.summary;
  const allocations = report?.eventAllocations ?? [];

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
              onClick={downloadReport}
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
        loading || !summary ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="glass h-32 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card-brand flex flex-col justify-between p-5 sm:col-span-2 lg:col-span-1 lg:row-span-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white/75">Remaining budget</p>
                <PieChart className="h-5 w-5 text-powder" />
              </div>
              <p className="mt-3 text-3xl font-extrabold tracking-tight">{formatPeso(summary.remainingBudget)}</p>
              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-powder" style={{ width: `${pct(summary.totalFundsSpent, summary.totalFundsCollected)}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-white/70">{pct(summary.totalFundsSpent, summary.totalFundsCollected)}% of collected funds spent</p>
              </div>
            </div>
            <GlassStat icon={Wallet} label="Total contribution amount" value={formatPeso(summary.totalBudget)} />
            <GlassStat icon={TrendingUp} label="Funds collected" value={formatPeso(summary.totalFundsCollected)} />
            <GlassStat icon={TrendingDown} label="Funds spent" value={formatPeso(summary.totalFundsSpent)} />
          </div>
        )
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
                <div data-lenis-prevent className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Event</th>
                        <th>Type</th>
                        <th className="text-right">Amount</th>
                        <th>Officer</th>
                        <th>Receipt</th>
                        {canManage && <th className="w-12" />}
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((t) => {
                        const income = t.type === "income";
                        return (
                          <tr key={t.id}>
                            <td className="whitespace-nowrap text-muted">{formatDate(t.date)}</td>
                            <td className="font-medium">{t.description}</td>
                            <td className="text-muted">{t.eventName || "—"}</td>
                            <td>
                              <span className={`chip ${income ? "chip-success" : "chip-danger"}`}>
                                {income ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {income ? "Income" : "Expense"}
                              </span>
                            </td>
                            <td className={`whitespace-nowrap text-right font-semibold ${income ? "text-success" : "text-danger"}`}>
                              {income ? "+" : "−"}
                              {formatPeso(t.amount)}
                            </td>
                            <td className="whitespace-nowrap text-muted">{t.responsibleOfficer}</td>
                            <td>
                              {t.receiptUrl ? (
                                <button onClick={() => setReceipt(t.receiptUrl!)} className="btn btn-secondary btn-sm">
                                  <Eye className="h-3.5 w-3.5" /> View
                                </button>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            {canManage && (
                              <td>
                                <Menu>
                                  <RowActionsTrigger label={`Actions for ${t.description}`} />
                                  <MenuContent>
                                    <MenuItem onSelect={() => openForm(t)}><Pencil /> Edit</MenuItem>
                                    <MenuSeparator />
                                    <MenuItem danger onSelect={() => setToDelete(t)}><Trash2 /> Delete</MenuItem>
                                  </MenuContent>
                                </Menu>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination {...pagination} />
              </>
            )}
          </section>

          <section>
            <SectionHeading eyebrow="Allocations" title="Where each event's money stands" />
            {allocations.length === 0 ? (
              <div className="card">
                <EmptyState icon={PieChart} title="No event allocations yet" />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {allocations.map((a) => {
                  const used = pct(a.totalSpent, a.totalCollected);
                  return (
                    <article key={a.eventId} className="card card-hover p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="min-w-0 truncate font-bold text-ink" title={a.eventName}>{a.eventName}</h3>
                        <span className="chip chip-brand shrink-0">{formatPeso(a.allocationAmount)} / student</span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                        {[
                          ["Expected", expectedCollection(a), "text-ink"],
                          ["Collected", a.totalCollected, "text-success"],
                          ["Spent", a.totalSpent, "text-danger"],
                          ["Balance", a.remainingBalance, "text-ink"],
                        ].map(([label, value, tone]) => (
                          <div key={label} className="rounded-xl bg-surface-2 px-2 py-2.5">
                            <p className="text-[11px] font-medium text-muted">{label}</p>
                            <p className={`mt-0.5 truncate text-sm font-bold ${tone}`}>{formatPeso(value as number)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-indigo-500" style={{ width: `${used}%` }} />
                      </div>
                      <p className="mt-1.5 text-xs text-muted">{used}% of collected funds spent</p>
                    </article>
                  );
                })}
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
            <span className={`chip ${editing !== "new" && editing?.type === "income" ? "chip-success" : "chip-danger"}`}>
              {editing !== "new" && editing?.type === "income" ? "Income" : "Expense"}
            </span>
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

function GlassStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="glass flex flex-col justify-between p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/70">{label}</p>
        <div className="grid h-9 w-9 place-items-center rounded-full border border-white/20"><Icon className="h-4 w-4 text-powder" /></div>
      </div>
      <p className="mt-3 truncate text-2xl font-extrabold tracking-tight text-white">{value}</p>
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

const esc = (value: unknown) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface ReportLogos {
  lsc: string;
  dssc: string;
}

/** Embeds both official logos as data URIs so the downloaded report is self-contained. */
async function loadReportLogos(): Promise<ReportLogos> {
  const responses = await Promise.all([fetch("/lsc-logo.jpg"), fetch("/DSSC-logo.png")]);
  if (responses.some((r) => !r.ok)) throw new Error("Unable to load report logos");
  const [lsc, dssc] = await Promise.all(responses.map(async (r) => blobToDataUri(await r.blob())));
  return { lsc, dssc };
}

/** Self-contained printable HTML report (Print > Save as PDF for a PDF copy). */
function buildReportHtml({ summary, eventAllocations }: FinancialReport, transactions: Transaction[], logos: ReportLogos) {
  const rows = (cells: string[][], cols: number, empty: string) =>
    cells.length
      ? cells.map((r, i) => `<tr class="${i % 2 === 0 ? "even" : "odd"}">${r.join("")}</tr>`).join("")
      : `<tr><td colspan="${cols}">${empty}</td></tr>`;
  const money = (n: number) => `<td class="right">${formatPeso(n)}</td>`;
  const card = (caption: string, n: number, cls = "") =>
    `<div class="card"><div class="number ${cls}">${formatPeso(n)}</div><div class="caption">${caption}</div></div>`;

  const allocationRows = rows(
    eventAllocations.map((a) => [
      `<td>${esc(a.eventName)}</td>`,
      money(a.allocationAmount),
      money(expectedCollection(a)),
      money(a.totalCollected),
      money(a.totalSpent),
      money(a.remainingBalance),
    ]),
    6,
    "No allocations recorded.",
  );
  const transactionRows = rows(
    transactions.map((t) => [
      `<td>${esc(formatDate(String(t.date)))}</td>`,
      `<td>${esc(t.description)}</td>`,
      `<td>${esc(t.eventName || "-")}</td>`,
      `<td><span class="type-${t.type}">${t.type === "income" ? "Income" : "Expense"}</span></td>`,
      `<td class="right ${t.type === "income" ? "pos" : "neg"}">${t.type === "income" ? "+" : "-"}${formatPeso(t.amount)}</td>`,
      `<td>${esc(t.responsibleOfficer)}</td>`,
    ]),
    6,
    "No transactions recorded.",
  );

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Student Council Financial Report</title>
<style>
  @page{size:landscape;margin:0}
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:0;padding:20px 28px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .header{display:flex;align-items:center;justify-content:center;gap:20px;border-bottom:3px solid #1b2e8c;padding-bottom:12px}
  .header img{width:70px;height:70px;object-fit:contain}.title{text-align:center}.org{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1.8px}.title h1{font-size:22px;color:#1b2e8c;margin:3px 0;font-weight:800}.sub{font-size:11px;color:#6b7280}
  .metadata{display:grid;grid-template-columns:1fr 1fr;gap:7px 30px;margin:16px 0;font-size:13px}.label{font-weight:700;color:#374151;display:inline-block;min-width:125px}
  .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0 18px}.card{border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;padding:9px;text-align:center}.number{font-weight:800;font-size:20px}.caption{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.8px;margin-top:2px}.collected{color:#047857}.spent{color:#b91c1c}.remaining{color:#1b2e8c}
  h2{font-size:15px;color:#1b2e8c;margin:18px 0 8px;border-bottom:2px solid #1b2e8c;padding-bottom:5px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px}thead tr{background:#1b2e8c;color:#fff}th{padding:8px 7px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.4px}td{padding:7px;border-bottom:1px solid #e5e7eb}.right{text-align:right;white-space:nowrap}.odd{background:#f9fafb}.even{background:#fff}
  .pos{color:#047857;font-weight:700}.neg{color:#b91c1c;font-weight:700}.type-income,.type-expense{display:inline-block;padding:2px 7px;border-radius:999px;font-size:9px;font-weight:700}.type-income{background:#d1fae5;color:#047857}.type-expense{background:#fee2e2;color:#b91c1c}
  footer{display:flex;justify-content:space-between;margin-top:18px;padding-top:9px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px}@media print{body{padding:12mm 10mm}.ledger-section{break-before:page;page-break-before:always}.ledger-section h2{break-after:avoid-page;page-break-after:avoid}}
</style></head><body>
  <header class="header"><img src="${logos.lsc}" alt="LSC logo"/><div class="title"><div class="org">Local Student Council · DSSC Santa Cruz</div><h1>Student Council Financial Report</h1><div class="sub">Official Financial Record for Verification and Filing</div></div><img src="${logos.dssc}" alt="DSSC logo"/></header>
  <section class="metadata"><div><span class="label">Report Type:</span>Official Financial Report</div><div><span class="label">Reporting Scope:</span>All recorded events and transactions</div><div><span class="label">Events Covered:</span>${eventAllocations.length}</div><div><span class="label">Transactions Recorded:</span>${transactions.length}</div></section>
  <section class="summary">${card("Total Contribution Amount", summary.totalBudget)}${card("Funds Collected", summary.totalFundsCollected, "collected")}${card("Funds Spent", summary.totalFundsSpent, "spent")}${card("Remaining Budget", summary.remainingBudget, "remaining")}</section>
  <h2>Event Allocations</h2>
  <table><thead><tr><th>Event</th><th class="right">Allocation</th><th class="right">Expected Collection</th><th class="right">Collected</th><th class="right">Spent</th><th class="right">Balance</th></tr></thead><tbody>${allocationRows}</tbody></table>
  <section class="ledger-section"><h2>Transaction Ledger</h2>
  <table><thead><tr><th>Date</th><th>Description</th><th>Event</th><th>Type</th><th class="right">Amount</th><th>Officer</th></tr></thead><tbody>${transactionRows}</tbody></table></section>
  <footer><span>Generated ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}</span><span>Digital Transparency Board — LSC · DSSC Santa Cruz</span></footer>
</body></html>`;
}
