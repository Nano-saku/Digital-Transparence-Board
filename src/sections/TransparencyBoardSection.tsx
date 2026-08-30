import { useEffect, useRef, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PieChart,
  FileText,
  Download,
  MessageCircle,
  Receipt,
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Save,
} from "lucide-react";
import type {
  ViewState,
  Transaction,
  EventAllocation,
  FinancialSummary,
  UserRole,
  Event,
} from "@/types";
import {
  transactionsService,
  financialReportingService,
  eventsService,
} from "@/services/db";
import {
  autoCreateReceipt,
  officialReceiptNumber,
  downloadBlob,
} from "@/lib/receipts";
import ReceiptViewer from "@/components/ReceiptViewer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDate, today, formatPeso } from "@/lib/format";
import { useSectionEntrance } from "@/hooks/useSectionEntrance";
import SectionLoader from "@/components/SectionLoader";
import SectionEmptyState from "@/components/SectionEmptyState";
import SectionBackButton from "@/components/SectionBackButton";
import AnimatedNetwork from "@/components/ui/animated-network";
interface TransparencyBoardSectionProps {
  adminMode?: boolean;
  onBack?: () => void;
  onNavigate?: (view: ViewState) => void;
  role?: UserRole;
  staffName?: string;
}

export default function TransparencyBoardSection({
  adminMode = false,
  onBack,
  onNavigate,
  role,
  staffName = "",
}: TransparencyBoardSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const allocationRef = useRef<HTMLDivElement>(null);
  const ledgerRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);

  // Data states
  const [financialSummary, setFinancialSummary] =
    useState<FinancialSummary | null>(null);
  const [eventAllocations, setEventAllocations] = useState<EventAllocation[]>(
    [],
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  // Transaction ledger CRUD state (admin mode only)
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [transactionForm, setTransactionForm] = useState({
    date: today(),
    description: "",
    eventId: "",
    eventName: "",
    amount: 0,
    type: "income" as "income" | "expense",
  });

  // Only the admin, treasurer, and auditor manage the ledger.
  const canManageLedger = Boolean(
    adminMode &&
    (role === "admin" || role === "treasurer" || role === "auditor"),
  );

  // Load data from database
  useEffect(() => {
    loadData();
  }, []);

  // Live updates: reload derived financial figures whenever the source tables change.
  useEffect(() => {
    return financialReportingService.subscribe(() => {
      loadData();
    });
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [report, transactionsData, eventsData] = await Promise.all([
        financialReportingService.getReport(),
        transactionsService.getAll(),
        eventsService.getAll(),
      ]);
      setFinancialSummary(report.summary);
      setEventAllocations(report.eventAllocations);
      setTransactions(transactionsData);
      setEvents(eventsData);
    } catch (error) {
      console.error("Error loading transparency data:", error);
      toast.error("Failed to load financial data");
    } finally {
      setLoading(false);
    }
  };

  useSectionEntrance(sectionRef, [
    // Headline entrance
    {
      ref: headlineRef,
      from: { x: "-40vw", opacity: 0 },
      to: { x: 0, opacity: 1, duration: 0.7 },
    },
    // Summary cards entrance
    {
      ref: summaryRef,
      selector: ".summary-card",
      from: { y: "-30vh", opacity: 0 },
      to: { y: 0, opacity: 1, duration: 0.6, stagger: 0.06 },
      position: "-=0.4",
    },
    // Allocation table entrance
    {
      ref: allocationRef,
      from: { x: "-60vw", opacity: 0 },
      to: { x: 0, opacity: 1, duration: 0.7 },
      position: "-=0.3",
    },
    // Ledger entrance
    {
      ref: ledgerRef,
      from: { x: "60vw", opacity: 0 },
      to: { x: 0, opacity: 1, duration: 0.7 },
      position: "-=0.5",
    },
    // CTA row entrance
    {
      ref: ctaRef,
      from: { y: "30vh", opacity: 0 },
      to: { y: 0, opacity: 1, duration: 0.6 },
      position: "-=0.3",
    },
  ]);

  // ------------------------------------------------------------------
  // Transaction ledger CRUD (admin / treasurer / auditor)
  // ------------------------------------------------------------------

  const resetTransactionForm = () => {
    setTransactionForm({
      date: today(),
      description: "",
      eventId: "",
      eventName: "",
      amount: 0,
      type: "income",
    });
  };

  /**
   * Builds a self-contained, printable HTML report of the transparency board
   * (financial summary, event allocations, and the full transaction ledger)
   * and downloads it. Open it in a browser and use Print > Save as PDF to
   * export a PDF copy.
   */
  const downloadTransparencyReport = async () => {
    try {
      setDownloadingReport(true);
      const escaped = (value: string) =>
        String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      const allocationRows = eventAllocations
        .map(
          (a) => `<tr>
              <td>${escaped(a.eventName)}</td>
              <td class="right">${formatPeso(a.allocationAmount)}</td>
              <td class="right">${formatPeso(a.totalCollected)}</td>
              <td class="right">${formatPeso(a.totalSpent)}</td>
            </tr>`,
        )
        .join("");

      const transactionRows = transactions
        .map(
          (t) => `<tr>
              <td>${escaped(String(t.date))}</td>
              <td>${escaped(t.description)}</td>
              <td>${escaped(t.eventName || "-")}</td>
              <td>${t.type === "income" ? "Income" : "Expense"}</td>
              <td class="right ${t.type === "income" ? "pos" : "neg"}">${t.type === "income" ? "+" : "-"}${formatPeso(t.amount)}</td>
              <td>${escaped(t.responsibleOfficer)}</td>
            </tr>`,
        )
        .join("");

      const totalIncome = transactions
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amount, 0);
      const totalExpense = transactions
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + t.amount, 0);

      const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Transparency Board Report</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:32px auto;max-width:960px;padding:0 16px;}
  h1{font-size:24px;margin:0 0 4px;}
  .meta{color:#6b7280;font-size:13px;margin-bottom:24px;}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:24px;}
  .card{border:1px solid #e5e7eb;border-radius:8px;padding:14px;background:#f9fafb;}
  .card .label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;}
  .card .value{font-size:20px;font-weight:700;margin-top:4px;}
  h2{font-size:16px;margin:28px 0 10px;border-bottom:2px solid #111827;padding-bottom:6px;}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;}
  th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left;}
  th{background:#f3f4f6;}
  .right{text-align:right;}
  .pos{color:#047857;} .neg{color:#b91c1c;}
  footer{margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;}
</style></head>
<body>
  <h1>Local Student Council � Digital Transparency Board</h1>
  <p class="meta">Official financial report � Generated ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}</p>

  <div class="cards">
    <div class="card"><div class="label">Total Contribution Amount</div><div class="value">${formatPeso(financialSummary?.totalBudget ?? 0)}</div></div>
    <div class="card"><div class="label">Funds Collected</div><div class="value pos">${formatPeso(financialSummary?.totalFundsCollected ?? 0)}</div></div>
    <div class="card"><div class="label">Funds Spent</div><div class="value neg">${formatPeso(financialSummary?.totalFundsSpent ?? 0)}</div></div>
    <div class="card"><div class="label">Remaining Budget</div><div class="value">${formatPeso(financialSummary?.remainingBudget ?? 0)}</div></div>
  </div>

  <h2>Event Allocations</h2>
  <table>
    <thead><tr><th>Event</th><th class="right">Allocation</th><th class="right">Collected</th><th class="right">Spent</th><th class="right">Balance</th></tr></thead>
    <tbody>${allocationRows || '<tr><td colspan="5">No allocations recorded.</td></tr>'}</tbody>
  </table>

  <h2>Transaction Ledger</h2>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th>Event</th><th>Type</th><th class="right">Amount</th><th>Officer</th></tr></thead>
    <tbody>${transactionRows || '<tr><td colspan="6">No transactions recorded.</td></tr>'}</tbody>
  </table>

  <p><strong>Totals:</strong> Income ${formatPeso(totalIncome)} � Expenses ${formatPeso(totalExpense)} � Net ${formatPeso(totalIncome - totalExpense)}</p>

  <footer>Generated by the Digital Transparency Board � for questions contact the Local Student Council treasurer or auditor.</footer>
</body></html>`;

      downloadBlob(
        new Blob([html], { type: "text/html;charset=utf-8" }),
        `transparency-board-report-${today()}.html`,
      );
      toast.success(
        "Report downloaded. Open it in a browser and use Print > Save as PDF to export.",
      );
    } catch (error) {
      console.error("Error downloading report:", error);
      toast.error("Failed to download report");
    } finally {
      setDownloadingReport(false);
    }
  };

  const openAddTransaction = () => {
    setEditingTransaction(null);
    resetTransactionForm();
    setShowTransactionModal(true);
  };

  const handleOpenEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setTransactionForm({
      date: transaction.date.slice(0, 10),
      description: transaction.description,
      eventId: transaction.eventId ?? "",
      eventName: transaction.eventName ?? "",
      amount: transaction.amount,
      type: transaction.type,
    });
    setShowTransactionModal(true);
  };

  const ensureTransactionReceipt = async (base: {
    type: "income" | "expense";
    amount: number;
    date: string;
    description: string;
    eventName?: string;
  }): Promise<string> =>
    autoCreateReceipt({
      tag: base.type === "income" ? "COLLECTION" : "EXPENSE",
      receiptNumber: await officialReceiptNumber(),
      issuedTo: base.type === "income" ? "Student payments" : "Council funds",
      eventName: base.eventName,
      description: base.description,
      amount: base.amount,
      type: base.type,
      date: base.date,
      recordedBy: staffName || "Council Officer",
    });

  const handleSaveTransaction = async () => {
    if (!transactionForm.description.trim() || transactionForm.amount <= 0) {
      toast.error("Please enter a description and a valid amount");
      return;
    }
    try {
      setSaving(true);
      const eventName = events.find(
        (e) => e.id === transactionForm.eventId,
      )?.name;

      // An official receipt is generated automatically for staff roles (as
      // SVG, uploaded to the "receipts" Storage bucket). Edited
      // transactions keep any receipt they already have.
      let receiptUrl: string | undefined = editingTransaction?.receiptUrl;
      if (
        !receiptUrl &&
        (role === "admin" || role === "treasurer" || role === "auditor")
      ) {
        try {
          receiptUrl = await ensureTransactionReceipt({
            type: transactionForm.type,
            amount: transactionForm.amount,
            date: transactionForm.date,
            description: transactionForm.description,
            eventName,
          });
          toast.success(
            "An official receipt was generated and attached automatically.",
          );
        } catch (receiptError) {
          console.warn("Auto receipt generation failed:", receiptError);
        }
      }

      const payload = {
        date: transactionForm.date,
        description: transactionForm.description,
        eventId: transactionForm.eventId || undefined,
        eventName,
        amount: transactionForm.amount,
        type: transactionForm.type,
        responsibleOfficer: staffName || "Council Officer",
        receiptUrl,
      };

      if (editingTransaction) {
        await transactionsService.update(editingTransaction.id, payload);
        toast.success("Transaction updated successfully");
      } else {
        await transactionsService.create(payload);
        toast.success("Transaction added to the ledger");
      }

      setShowTransactionModal(false);
      setEditingTransaction(null);
      resetTransactionForm();
      await loadData();
    } catch (error) {
      console.error("Error saving transaction:", error);
      toast.error("Failed to save transaction");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTransaction = async (transaction: Transaction) => {
    if (
      !window.confirm(
        `Delete transaction "${transaction.description}"? This cannot be undone.`,
      )
    )
      return;
    try {
      await transactionsService.delete(transaction.id);
      await loadData();
      toast.success("Transaction deleted");
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast.error("Failed to delete transaction");
    }
  };

  const filteredTransactions = transactions.filter(
    (t) =>
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.eventName?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <section
      ref={sectionRef}
      className="min-h-screen w-full gradient-bg-orange relative overflow-hidden py-20 lg:py-24"
    >
      {/* Animated Network Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <AnimatedNetwork nodeCount={45} maxEdgeDistance={150} speed={0.3} />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        {/* Admin Back Button */}
        {adminMode && onBack && (
          <div className="mb-6">
            <SectionBackButton onClick={onBack} label="Back to Dashboard" />
          </div>
        )}

        {/* Headline */}
        <div ref={headlineRef} className="text-center mb-10">
          <h1 className="font-display font-bold text-3xl lg:text-4xl xl:text-5xl text-dark mb-3">
            Transparency Board
          </h1>
          <p className="text-text-secondary text-base lg:text-lg max-w-2xl mx-auto">
            Real-time financial transparency. Track every contribution, expense,
            and allocation.
          </p>
        </div>

        {/* Loading State */}
        {loading && <SectionLoader message="Loading financial data..." />}

        {!loading && (
          <>
            {/* Financial Summary */}
            <div
              ref={summaryRef}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
            >
              <div className="summary-card glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">
                    Total Contribution Amount
                  </span>
                </div>
                <p className="font-display font-bold text-2xl text-dark">
                  {formatPeso(financialSummary?.totalBudget ?? 0)}
                </p>
              </div>

              <div className="summary-card glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">
                    Funds Collected
                  </span>
                </div>
                <p className="font-display font-bold text-2xl text-green-600">
                  {formatPeso(financialSummary?.totalFundsCollected ?? 0)}
                </p>
              </div>

              <div className="summary-card glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-red" />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">
                    Funds Spent
                  </span>
                </div>
                <p className="font-display font-bold text-2xl text-red">
                  {formatPeso(financialSummary?.totalFundsSpent ?? 0)}
                </p>
              </div>

              <div className="summary-card glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <PieChart className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">
                    Remaining
                  </span>
                </div>
                <p className="font-display font-bold text-2xl text-purple-600">
                  {formatPeso(financialSummary?.remainingBudget ?? 0)}
                </p>
              </div>
            </div>

            {/* Event Allocations */}
            <div ref={allocationRef} className="glass-card p-5 lg:p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                  <PieChart className="w-5 h-5 text-red" />
                </div>
                <h3 className="font-display font-semibold text-lg text-dark">
                  Event Allocations
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Allocation</th>
                      <th>Collected</th>
                      <th>Spent</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventAllocations.map((allocation) => (
                      <tr key={allocation.eventId}>
                        <td className="font-medium text-dark">
                          {allocation.eventName}
                        </td>
                        <td className="text-text-secondary">
                          {formatPeso(allocation.allocationAmount)}
                        </td>
                        <td className="text-green-600">
                          {formatPeso(allocation.totalCollected)}
                        </td>
                        <td className="text-red">
                          {formatPeso(allocation.totalSpent)}
                        </td>
                        <td className="font-medium text-dark">
                          {formatPeso(allocation.remainingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {eventAllocations.length === 0 && (
                <SectionEmptyState
                  message="No event allocations found"
                  icon={PieChart}
                  compact
                />
              )}
            </div>

            {/* Transaction Ledger */}
            <div ref={ledgerRef} className="glass-card p-5 lg:p-6 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-red" />
                  </div>
                  <h3 className="font-display font-semibold text-lg text-dark">
                    Transaction Ledger
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                    <input
                      type="text"
                      placeholder="Search transactions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="glass-input pl-10 pr-4 py-2 text-sm w-full sm:w-64"
                    />
                  </div>
                  <button
                    onClick={downloadTransparencyReport}
                    disabled={downloadingReport}
                    className="glass-button px-4 py-2.5 flex items-center gap-2 text-sm"
                  >
                    {downloadingReport ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>Download Report</span>
                  </button>
                  {canManageLedger && (
                    <button
                      onClick={openAddTransaction}
                      className="btn-primary px-4 py-2.5 flex items-center gap-2 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Transaction</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Event</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Officer</th>
                      <th>Receipt</th>
                      {canManageLedger && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="text-text-secondary">
                          {formatDate(transaction.date)}
                        </td>
                        <td className="font-medium text-dark">
                          {transaction.description}
                        </td>
                        <td className="text-text-secondary">
                          {transaction.eventName || "-"}
                        </td>
                        <td>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              transaction.type === "income"
                                ? "bg-green-100 text-green-600"
                                : "bg-red/10 text-red-500"
                            }`}
                          >
                            {transaction.type === "income"
                              ? "Income"
                              : "Expense"}
                          </span>
                        </td>
                        <td
                          className={`font-medium ${
                            transaction.type === "income"
                              ? "text-green-600"
                              : "text-red-500"
                          }`}
                        >
                          {transaction.type === "income" ? "+" : "-"}
                          {formatPeso(transaction.amount)}
                        </td>
                        <td className="text-text-secondary">
                          {transaction.responsibleOfficer}
                        </td>
                        <td>
                          {transaction.receiptUrl ? (
                            <button
                              onClick={() =>
                                setSelectedReceipt(
                                  transaction.receiptUrl || null,
                                )
                              }
                              className="p-2 rounded-lg"
                            >
                              <Receipt className="w-4 h-4 text-red" />
                            </button>
                          ) : (
                            <span className="text-text-secondary/50">-</span>
                          )}
                        </td>
                        {canManageLedger && (
                          <td>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() =>
                                  handleOpenEditTransaction(transaction)
                                }
                                className="p-2 rounded-lg"
                                title="Edit transaction"
                              >
                                <Pencil className="w-4 h-4 text-dark" />
                              </button>
                              <button
                                onClick={() =>
                                  handleDeleteTransaction(transaction)
                                }
                                className="p-2 rounded-lg hover:bg-red/10"
                                title="Delete transaction"
                              >
                                <Trash2 className="w-4 h-4 text-red" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredTransactions.length === 0 && (
                <SectionEmptyState
                  message="No transactions found"
                  icon={FileText}
                  compact
                />
              )}
            </div>

            {/* CTA Row */}
            {!adminMode && onNavigate && (
              <div ref={ctaRef} className="flex flex-wrap justify-center gap-4">
                <button
                  onClick={() => onNavigate("inquiry")}
                  className="glass-button px-6 py-3 flex items-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Submit Inquiry</span>
                </button>
                <button
                  onClick={downloadTransparencyReport}
                  disabled={downloadingReport}
                  className="glass-button px-6 py-3 flex items-center gap-2"
                >
                  {downloadingReport ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Download className="w-5 h-5" />
                  )}
                  <span>Download Report</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Receipt Modal */}
      <ReceiptViewer
        receiptUrl={selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        title="Receipt"
      />

      {/* Add / Edit Transaction Dialog */}
      <Dialog
        open={showTransactionModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowTransactionModal(false);
            setEditingTransaction(null);
          }
        }}
      >
        <DialogContent className="glass-card-strong max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl text-dark">
              {editingTransaction ? "Edit Transaction" : "Add Transaction"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Date
              </label>
              <input
                type="date"
                value={transactionForm.date}
                onChange={(e) =>
                  setTransactionForm({
                    ...transactionForm,
                    date: e.target.value,
                  })
                }
                className="glass-input w-full px-4 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Description
              </label>
              <input
                type="text"
                value={transactionForm.description}
                onChange={(e) =>
                  setTransactionForm({
                    ...transactionForm,
                    description: e.target.value,
                  })
                }
                className="glass-input w-full px-4 py-2"
                placeholder="e.g., Venue rental for General Assembly"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                Event (optional)
              </label>
              <select
                value={transactionForm.eventId}
                onChange={(e) =>
                  setTransactionForm({
                    ...transactionForm,
                    eventId: e.target.value,
                  })
                }
                className="glass-input w-full px-4 py-2 text-sm"
              >
                <option value="">No event</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  Type
                </label>
                <select
                  value={transactionForm.type}
                  onChange={(e) =>
                    setTransactionForm({
                      ...transactionForm,
                      type: e.target.value as "income" | "expense",
                    })
                  }
                  className="glass-input w-full px-4 py-2 text-sm"
                >
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  Amount (?)
                </label>
                <input
                  type="number"
                  value={transactionForm.amount || ""}
                  onChange={(e) =>
                    setTransactionForm({
                      ...transactionForm,
                      amount: parseInt(e.target.value) || 0,
                    })
                  }
                  className="glass-input w-full px-4 py-2"
                  placeholder="0.00"
                  min="0"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setShowTransactionModal(false);
                  setEditingTransaction(null);
                }}
                className="flex-1 glass-button px-4 py-2.5"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTransaction}
                className="flex-1 btn-primary px-4 py-2.5 flex items-center justify-center gap-2"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {editingTransaction ? "Update" : "Add Transaction"}
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
