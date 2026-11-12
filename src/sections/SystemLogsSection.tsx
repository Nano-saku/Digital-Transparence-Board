import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Coins, RefreshCw, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { auditLogsService, paymentsService } from "@/services/db";
import type { AuditLog, PaymentRecord } from "@/types";
import { formatPeso, formatPhilippineDateTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";
import DataTable, { type DataColumn } from "@/components/DataTable";
import Page from "@/components/ui/Page";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import { LoadingCard } from "@/components/ui/Skeleton";

const PAGE_SIZE = 20;
const OFFICER_ROLES = Object.keys(ROLE_LABEL);
const SYSTEM_ENTITY_TYPES = ["authentication", "student", "event", "attendance", "transaction", "requirement_file", "feedback", "board_member"];

/** The officer role named in a "recorded by" label, e.g. "Treasurer Ana" -> "Treasurer". */
const officerRoleFromName = (name: string) =>
  Object.values(ROLE_LABEL).find((label) => name.toLowerCase().includes(label.toLowerCase())) ?? "Officer";
const formatLabel = (value?: string) => (value ? value.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—");

const SYSTEM_COLUMNS: DataColumn<AuditLog>[] = [
  { header: "Actor", cell: (log) => log.actorName || "—", className: "font-semibold" },
  { header: "Role", cell: (log) => formatLabel(log.actorRole), className: "text-muted" },
  { header: "Action", cell: (log) => <span className="chip chip-brand">{formatLabel(log.action)}</span> },
  { header: "Description", cell: (log) => log.description || "—", className: "max-w-[28rem] whitespace-normal text-muted" },
  { header: "Entity", cell: (log) => formatLabel(log.entityType), className: "text-muted" },
  { header: "Date/Time", cell: (log) => formatPhilippineDateTime(log.createdAt), className: "whitespace-nowrap text-muted" },
];

const CONTRIBUTION_COLUMNS: DataColumn<PaymentRecord>[] = [
  { header: "Student", cell: (p) => p.studentName || "—", className: "font-semibold" },
  { header: "Event", cell: (p) => p.eventName || "—", className: "text-muted" },
  { header: "Amount", cell: (p) => formatPeso(p.amount), className: "whitespace-nowrap font-semibold tabular-nums" },
  { header: "Payment/Action", cell: () => <span className="chip chip-success">Payment recorded</span> },
  { header: "Officer", cell: (p) => p.recordedBy || "—", className: "text-muted" },
  { header: "Role", cell: (p) => (p.recordedBy ? officerRoleFromName(p.recordedBy) : "—"), className: "text-muted" },
  { header: "Date/Time", cell: (p) => formatPhilippineDateTime(p.recordedAt), className: "whitespace-nowrap text-muted" },
  { header: "OR/Reference", cell: (p) => p.orNumber || p.id, className: "font-mono text-xs text-muted" },
];

interface Logs {
  system: { data: AuditLog[]; total: number };
  contributions: { data: PaymentRecord[]; total: number };
}

export default function SystemLogsSection({ onBack }: { onBack: () => void }) {
  const [logs, setLogs] = useState<Logs>({ system: { data: [], total: 0 }, contributions: { data: [], total: 0 } });
  const [systemPage, setSystemPage] = useState(1);
  const [contributionPage, setContributionPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLogs = useCallback(
    async (refresh = false) => {
      (refresh ? setRefreshing : setLoading)(true);
      try {
        const [system, contributions] = await Promise.all([
          auditLogsService.getPage(systemPage - 1, PAGE_SIZE, { entityTypes: SYSTEM_ENTITY_TYPES, actorRoles: OFFICER_ROLES }),
          paymentsService.getPage(contributionPage - 1, PAGE_SIZE),
        ]);
        setLogs({ system, contributions });
      } catch (error) {
        console.error("Error loading audit logs:", error);
        toast.error("Failed to load audit logs");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [contributionPage, systemPage],
  );

  useEffect(() => {
    void loadLogs();
    const unsubscribe = [auditLogsService, paymentsService].map((service) => service.subscribe(() => void loadLogs(true)));
    return () => unsubscribe.forEach((stop) => stop());
  }, [loadLogs]);

  const { system, contributions } = logs;
  return (
    <Page
      eyebrow="Audit trail"
      title="System Logs"
      subtitle="Review administrative activity and contribution history across the transparency board"
      onBack={onBack}
      actions={
        <button type="button" onClick={() => void loadLogs(true)} disabled={loading || refreshing} className="btn btn-light">
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </button>
      }
      hero={
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard featured icon={ClipboardList} label="System events" value={loading ? "—" : system.total} hint="Officer and administrative actions" />
          <StatCard icon={Coins} tone="success" label="Contribution records" value={loading ? "—" : contributions.total} hint="Payments recorded by officers" />
        </div>
      }
    >
      {loading ? (
        <LoadingCard label="Loading system logs…" rows={8} />
      ) : (
        <>
          <LogCard
            icon={ClipboardList}
            title="System Logs"
            subtitle="Officer and administrative actions, newest to oldest."
            empty="No system activity found."
            tableClassName="min-w-[980px]"
            columns={SYSTEM_COLUMNS}
            {...system}
            page={systemPage}
            onPage={setSystemPage}
          />
          <LogCard
            icon={Coins}
            success
            title="Contribution Logs"
            subtitle="Contribution and payment activity with its own count and pagination."
            empty="No contribution activity found."
            tableClassName="min-w-[1040px]"
            columns={CONTRIBUTION_COLUMNS}
            {...contributions}
            page={contributionPage}
            onPage={setContributionPage}
          />
        </>
      )}
    </Page>
  );
}

interface LogCardProps<T> {
  icon: LucideIcon;
  success?: boolean;
  title: string;
  subtitle: string;
  empty: string;
  tableClassName: string;
  columns: DataColumn<T>[];
  data: T[];
  /** Server-side pagination: the total row count and the page shown. */
  total: number;
  page: number;
  onPage: (page: number) => void;
}

function LogCard<T extends { id: string }>({ icon: Icon, success, title, subtitle, empty, tableClassName, columns, data, total, page, onPage }: LogCardProps<T>) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line/60 p-5 lg:p-6">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", success ? "bg-success/10 text-success" : "bg-brand-500/10 text-brand-500")}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
      </header>
      {data.length === 0 ? <EmptyState icon={Icon} title={empty} /> : <DataTable columns={columns} rows={data} rowKey={(row) => row.id} className={tableClassName} />}
      <Pagination page={page} onPage={onPage} totalItems={total} pageSize={PAGE_SIZE} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} />
    </section>
  );
}
