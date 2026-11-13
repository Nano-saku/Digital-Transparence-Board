import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Eye,
  FileText,
  FolderOpen,
  MessageSquare,
  PieChart,
  Receipt,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import type { UserRole, ViewState } from "@/types";
import { eventsService, feedbackService, financialReportingService, studentsService, transactionsService } from "@/services/db";
import { daysUntil, formatDate, formatPeso, getEarliestScheduledTime, today } from "@/lib/format";
import { ROLE_LABEL, canAccess } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useLiveData } from "@/hooks/useLiveData";
import Page from "@/components/ui/Page";
import EmptyState from "@/components/ui/EmptyState";
import { LoadingCard } from "@/components/ui/Skeleton";
import FinancialSummaryCard from "@/components/FinancialSummaryCard";

interface AdminDashboardSectionProps {
  onNavigate: (view: ViewState) => void;
  onLogout: () => void;
  role: UserRole;
  userEmail: string;
  userId?: string;
}

interface Module {
  view: ViewState;
  title: string;
  description: string;
  icon: LucideIcon;
}

// Shown to every role that `canAccess` allows (public views are shown to all).
const MODULES: Module[] = [
  { view: "student-management", title: "Students", description: "Add, edit, import and print student QR passes.", icon: UserCog },
  { view: "officer-volunteers-management", title: "Officers & Volunteers", description: "Appoint LSC officers and assign event volunteers.", icon: ShieldCheck },
  { view: "contribution-management", title: "Contributions & Payments", description: "Record and track student contributions and payments.", icon: Coins },
  { view: "transaction-management", title: "Transaction Ledger", description: "Manage income and expenses with auto receipts.", icon: Receipt },
  { view: "attendance-management", title: "Attendance", description: "Scan QR passes and record attendance per event.", icon: ClipboardCheck },
  { view: "event-management", title: "Events", description: "Create events, schedules and fund allocations.", icon: Calendar },
  { view: "report-management", title: "Reports", description: "Generate printable attendance reports.", icon: FileText },
  { view: "requirement-files-management", title: "Council Files", description: "Upload and share student requirement documents.", icon: FolderOpen },
  { view: "feedback-management", title: "Feedback Inbox", description: "Complaints, inquiries and suggestions.", icon: MessageSquare },
  { view: "system-logs", title: "System Logs", description: "Officer activity and contribution history.", icon: ClipboardList },
  { view: "transparency", title: "Transparency Board", description: "The public council financial report.", icon: Eye },
];

const GROUPS: { title: string; views: ViewState[] }[] = [
  { title: "People", views: ["student-management", "officer-volunteers-management"] },
  { title: "Money", views: ["contribution-management", "transaction-management", "transparency"] },
  { title: "Events", views: ["event-management", "attendance-management", "report-management"] },
  { title: "Records", views: ["feedback-management", "requirement-files-management", "system-logs"] },
];

const NONE: never[] = [];

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};

/** Days-until chip for an upcoming event (counted to its earliest scheduled start). */
function countdown(days: number): { label: string; chip: string } {
  if (days === 0) return { label: "Today", chip: "chip-danger" };
  return days > 0 ? { label: `${days}d`, chip: "chip-success" } : { label: "Over", chip: "chip-neutral" };
}

export default function AdminDashboardSection({ onNavigate, role, userEmail }: AdminDashboardSectionProps) {
  // Refreshes on realtime changes (reconnect-aware, debounced) without flashing the loader.
  const { data, loading } = useLiveData({
    sources: {
      report: () => financialReportingService.getReport(),
      students: () => studentsService.getAll(),
      events: () => eventsService.getAll(),
      pending: () => feedbackService.getByStatus("pending"),
      /** Full history: feeds the funds sparklines; the first five are "recent". */
      transactions: () => transactionsService.getAll(),
    },
    tables: ["students", "events", "lsc_officers", "contributions", "payments", "transactions", "feedback", "board_members"],
    channel: "dashboard",
    onError: () => toast.error("Failed to load dashboard data"),
  });
  const { report, students = NONE, events = NONE, pending = NONE, transactions = NONE } = data ?? {};
  const summary = report?.summary;
  const studentCount = students.length;
  const now = today();
  const upcoming = events.filter((e) => e.date && e.date >= now).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  // Collection performance, without no-contribution events.
  const noContribution = new Set(events.filter((e) => e.isNoContribution).map((e) => e.id));
  const allocations = (report?.eventAllocations ?? []).filter((a) => !noContribution.has(a.eventId));
  const modules = MODULES.filter((m) => canAccess(role, m.view) !== false);
  const badges: Partial<Record<ViewState, string>> = {
    "feedback-management": pending.length ? `${pending.length} pending` : undefined,
    "event-management": upcoming.length ? `${upcoming.length} upcoming` : undefined,
  };
  const showLedger = canAccess(role, "transaction-management");
  const funds = { transactions, loading };

  // What needs an officer today, from live data (each links to where it gets done).
  const thisWeek = upcoming.filter((e) => daysUntil(e.date ?? "", getEarliestScheduledTime(e.schedules)) <= 7);
  const behind = allocations.filter((a) => {
    const expected = a.expectedAmount != null ? Number(a.expectedAmount) : Number(a.allocationAmount ?? 0) * studentCount;
    return expected > 0 && Number(a.totalCollected ?? 0) / expected < 0.5;
  });
  const attention = [
    pending.length > 0 && canAccess(role, "feedback-management") !== false && { view: "feedback-management" as ViewState, icon: MessageSquare, text: `${pending.length} feedback ${pending.length === 1 ? "message waits" : "messages wait"} for a reply` },
    thisWeek.length > 0 && canAccess(role, "attendance-management") !== false && { view: "attendance-management" as ViewState, icon: ClipboardCheck, text: `${thisWeek.length} ${thisWeek.length === 1 ? "event takes" : "events take"} attendance this week` },
    behind.length > 0 && canAccess(role, "contribution-management") !== false && { view: "contribution-management" as ViewState, icon: Coins, text: `${behind.length} ${behind.length === 1 ? "event is" : "events are"} under half collected` },
  ].filter(Boolean) as { view: ViewState; icon: LucideIcon; text: string }[];

  return (
    <Page
      title={greeting()}
      subtitle={`${ROLE_LABEL[role]} · ${userEmail}`}
      hero={
        // One strip of figures instead of a row of separate boxes.
        <div className="card grid overflow-hidden sm:grid-cols-2 lg:grid-cols-4 [&>*+*]:border-t [&>*+*]:border-line sm:[&>*:nth-child(2)]:border-t-0 lg:[&>*+*]:border-l lg:[&>*+*]:border-t-0">
          <div className="flex min-h-[150px] flex-col justify-between px-5 pb-5 pt-5">
            <p className="text-xs font-semibold text-muted">Students</p>
            <p className="text-3xl font-extrabold tabular-nums tracking-tight text-ink">{loading ? "—" : studentCount.toLocaleString("en-US")}</p>
            <p className="text-xs text-muted">
              Expected contributions {loading ? "—" : formatPeso(summary?.totalExpectedContributions ?? 0)}
            </p>
          </div>
          <FinancialSummaryCard bare title="Funds collected" value={summary?.totalFundsCollected ?? 0} chartMode="income" {...funds} />
          <FinancialSummaryCard bare title="Funds spent" value={summary?.totalFundsSpent ?? 0} chartMode="expense" {...funds} />
          <FinancialSummaryCard bare title="Remaining budget" value={summary?.remainingBudget ?? 0} chartMode="balance" {...funds} />
        </div>
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <section className="card p-5 lg:p-6" aria-labelledby="attention-heading">
            <h2 id="attention-heading" className="text-base font-bold text-ink">Needs attention</h2>
            {loading ? (
              <LoadingCard rows={2} label="Checking…" />
            ) : attention.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing is waiting on you right now.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {attention.map(({ view, icon: Icon, text }) => (
                  <li key={view}>
                    <button onClick={() => onNavigate(view)} className="group flex w-full items-center gap-3 py-3 text-left">
                      <Icon className="h-4 w-4 shrink-0 text-muted" />
                      <span className="flex-1 text-sm font-medium text-ink">{text}</span>
                      <ArrowRight className="h-4 w-4 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!loading && (
            <div className="grid gap-6 xl:grid-cols-2">
              <Panel title="Upcoming events" onMore={() => onNavigate("event-management")}>
                {upcoming.length === 0 ? (
                  <EmptyState icon={Calendar} title="No upcoming events scheduled" />
                ) : (
                  <ul data-lenis-prevent className="max-h-72 space-y-2 overflow-y-auto">
                    {upcoming.map((event) => {
                      const date = event.date ?? ""; // always set: filtered above
                      const { label, chip } = countdown(daysUntil(date, getEarliestScheduledTime(event.schedules)));
                      return (
                        <Row key={event.id} title={event.name} meta={`${formatDate(date)} · Allocation ${formatPeso(event.allocationAmount)}`}>
                          <span className={cn("chip", chip)}>{label}</span>
                        </Row>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              <Panel title="Collection progress" onMore={() => onNavigate("contribution-management")}>
                {allocations.length === 0 ? (
                  <EmptyState icon={PieChart} title="No event collection data yet" />
                ) : (
                  <ul data-lenis-prevent className="max-h-72 space-y-4 overflow-y-auto pr-1">
                    {allocations.map((event) => {
                      // The report already excludes appointed LSC officers from the
                      // expected amount; older deployed functions don't return it yet.
                      const expected = event.expectedAmount != null ? Number(event.expectedAmount) : Number(event.allocationAmount ?? 0) * studentCount;
                      const collected = Number(event.totalCollected ?? 0);
                      const progress = expected > 0 ? Math.min((collected / expected) * 100, 100) : 0;
                      return (
                        <li key={event.eventId}>
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="truncate text-sm font-semibold text-ink">{event.eventName}</p>
                            <span className="text-xs font-bold tabular-nums text-ink">{Math.round(progress)}%</span>
                          </div>
                          <p className="text-xs text-muted">
                            {formatPeso(collected)} / {formatPeso(expected)}
                          </p>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full bg-[#1449ff] transition-all duration-500" style={{ width: `${progress}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              {showLedger && (
                <Panel title="Recent transactions" onMore={() => onNavigate("transaction-management")} className="xl:col-span-2">
                  {transactions.length === 0 ? (
                    <EmptyState icon={Receipt} title="No transactions recorded yet" />
                  ) : (
                    <ul className="space-y-2">
                      {transactions.slice(0, 5).map((t) => {
                        const income = t.type === "income";
                        const Icon = income ? TrendingUp : TrendingDown;
                        return (
                          <Row
                            key={t.id}
                            icon={<Icon className={cn("h-4 w-4", income ? "text-success" : "text-danger")} />}
                            title={t.description || "Transaction"}
                            meta={`${income ? "Income" : "Expense"} · ${t.date ? formatDate(t.date) : "No date"}`}
                          >
                            <span className={cn("text-sm font-bold", income ? "text-success" : "text-danger")}>
                              {income ? "+" : "−"}
                              {formatPeso(Math.abs(Number(t.amount) || 0))}
                            </span>
                          </Row>
                        );
                      })}
                    </ul>
                  )}
                </Panel>
              )}
            </div>
          )}
        </div>

        {/* Everything else, grouped by the job it belongs to: a list, not a wall of tiles. */}
        <nav aria-label="Council tools" className="card p-2 lg:sticky lg:top-24">
          {GROUPS.map((group) => {
            const items = modules.filter((m) => group.views.includes(m.view));
            if (items.length === 0) return null;
            return (
              <div key={group.title} className="py-1">
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{group.title}</p>
                {items.map((m) => (
                  <button key={m.view} onClick={() => onNavigate(m.view)} title={m.description} className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2">
                    <m.icon className="h-4 w-4 shrink-0 text-muted group-hover:text-ink" />
                    <span className="flex-1 text-sm font-medium text-ink">{m.title}</span>
                    {badges[m.view] && <span className="chip chip-brand">{badges[m.view]}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
      </div>
    </Page>
  );
}

function Panel({ title, onMore, className, children }: { title: string; onMore: () => void; className?: string; children: ReactNode }) {
  return (
    <section className={cn("card p-5 lg:p-6", className)}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        <button onClick={onMore} className="btn btn-ghost btn-sm">
          View all <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </header>
      {children}
    </section>
  );
}

function Row({ title, meta, icon, children }: { title: string; meta: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3.5 py-3">
      {icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{title}</p>
        <p className="truncate text-xs text-muted">{meta}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </li>
  );
}
