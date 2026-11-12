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
  Users,
  type LucideIcon,
} from "lucide-react";
import type { UserRole, ViewState } from "@/types";
import { eventsService, feedbackService, financialReportingService, studentsService, transactionsService } from "@/services/db";
import { daysUntil, formatDate, formatPeso, getEarliestScheduledTime, today } from "@/lib/format";
import { ROLE_LABEL, canAccess } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useLiveData } from "@/hooks/useLiveData";
import Page from "@/components/ui/Page";
import StatCard from "@/components/ui/StatCard";
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

const ROLE_FOCUS: Record<UserRole, string> = {
  admin: "operations",
  secretary: "attendance",
  treasurer: "finance",
  auditor: "finance & audit",
  "board-member": "events",
};

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

  return (
    <Page
      eyebrow="Council dashboard"
      title={greeting()}
      subtitle={`${userEmail} — your council ${ROLE_FOCUS[role]} overview.`}
      actions={
        <div className="glass flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5">
          <img src="/DSSC-logo.png" alt="DSSC logo" className="h-11 w-11 rounded-full bg-white object-contain p-1" />
          <div className="leading-tight">
            <p className="text-[11px] text-white/70">Signed in as</p>
            <p className="text-sm font-bold">{ROLE_LABEL[role]}</p>
          </div>
        </div>
      }
      hero={
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-4">
            <StatCard featured label="Total Students" value={loading ? "—" : studentCount} icon={Users} hint={`${upcoming.length} upcoming events`} />
            <StatCard label="Expected Contributions" value={loading ? "—" : formatPeso(summary?.totalExpectedContributions ?? 0)} icon={Coins} />
          </div>
          <FinancialSummaryCard title="Funds Collected" value={summary?.totalFundsCollected ?? 0} chartMode="income" {...funds} />
          <FinancialSummaryCard title="Funds Spent" value={summary?.totalFundsSpent ?? 0} chartMode="expense" {...funds} />
          <FinancialSummaryCard title="Remaining Budget" value={summary?.remainingBudget ?? 0} chartMode="balance" {...funds} />
        </div>
      }
    >
      <div className="pt-32">
        <span className="eyebrow">Workspace</span>
        <h2 className="mt-3 text-2xl font-extrabold text-ink">Everything you manage, in one place</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m, i) => (
          <ModuleCard key={m.view} module={m} primary={i === 0} badge={badges[m.view]} onOpen={() => onNavigate(m.view)} />
        ))}
      </div>

      {loading ? (
        <LoadingCard label="Loading dashboard…" />
      ) : (
        <div className={cn("grid gap-6", showLedger ? "lg:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2")}>
          <Panel title="Upcoming Events" subtitle="Scheduled council activities" onMore={() => onNavigate("event-management")}>
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

          <Panel title="Collection Performance" subtitle="Progress against event allocation targets" onMore={() => onNavigate("event-management")}>
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
                        <span className="text-xs font-bold text-brand-600">{Math.round(progress)}%</span>
                      </div>
                      <p className="text-xs text-muted">
                        {formatPeso(collected)} / {formatPeso(expected)}
                      </p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {showLedger && (
            <Panel title="Recent Transactions" subtitle="Latest income and expense records" onMore={() => onNavigate("transaction-management")}>
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
    </Page>
  );
}

/** AirLume-style feature card: outlined icon circle, title, one-liner, "Open →". */
function ModuleCard({ module: m, primary, badge, onOpen }: { module: Module; primary: boolean; badge?: string; onOpen: () => void }) {
  const Icon = m.icon;
  return (
    <button onClick={onOpen} className={cn("group flex flex-col items-start p-6 text-left", primary ? "card-brand" : "card card-hover")}>
      <div className="flex w-full items-start justify-between gap-3">
        <span className={cn("icon-tile", primary && "border-white/30 bg-white/10 text-white")}>
          <Icon className="h-5 w-5" />
        </span>
        {badge && <span className={cn("chip", primary ? "bg-white/15 text-white" : "chip-brand")}>{badge}</span>}
      </div>
      <h3 className={cn("mt-5 text-lg font-bold", primary ? "text-white" : "text-ink")}>{m.title}</h3>
      <p className={cn("mt-1 line-clamp-1 text-sm", primary ? "text-white/75" : "text-muted")}>{m.description}</p>
      <span className={cn("mt-5 inline-flex items-center gap-1.5 text-sm font-semibold", primary ? "text-white" : "text-brand-600")}>
        Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
    </button>
  );
}

function Panel({ title, subtitle, onMore, children }: { title: string; subtitle: string; onMore: () => void; children: ReactNode }) {
  return (
    <section className="card p-5 lg:p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">{title}</h3>
          <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
        </div>
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
