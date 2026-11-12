import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ClipboardList, Coins, RefreshCw, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { auditLogsService, paymentsService } from "@/services/db";
import type { AuditLog, PaymentRecord } from "@/types";
import { formatPeso, formatPhilippineDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import Page from "@/components/ui/Page";
import StatCard from "@/components/ui/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import { LoadingCard } from "@/components/ui/Skeleton";

interface SystemLogsSectionProps {
  onBack: () => void;
}

const PAGE_SIZE = 20;
const OFFICER_ROLES = ["admin", "secretary", "treasurer", "auditor", "board-member"] as const;
const SYSTEM_ENTITY_TYPES = ["authentication", "student", "event", "attendance", "transaction", "requirement_file", "feedback", "board_member"];

function officerRoleFromName(name: string): string {
  const normalized = name.toLowerCase();
  const role = [
    ["admin", "Admin"],
    ["secretary", "Secretary"],
    ["treasurer", "Treasurer"],
    ["auditor", "Auditor"],
    ["board member", "Board Member"],
  ].find(([key]) => normalized.includes(key));
  return role?.[1] ?? "Officer";
}

function formatLabel(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function SystemLogsSection({ onBack }: SystemLogsSectionProps) {
  const [systemLogs, setSystemLogs] = useState<AuditLog[]>([]);
  const [contributionLogs, setContributionLogs] = useState<PaymentRecord[]>([]);
  const [systemPage, setSystemPage] = useState(1);
  const [contributionPage, setContributionPage] = useState(1);
  const [systemTotal, setSystemTotal] = useState(0);
  const [contributionTotal, setContributionTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLogs = useCallback(
    async (showRefreshState = false) => {
      try {
        if (showRefreshState) setRefreshing(true);
        else setLoading(true);

        const [systemResult, contributionResult] = await Promise.all([
          auditLogsService.getPage(systemPage - 1, PAGE_SIZE, { entityTypes: SYSTEM_ENTITY_TYPES, actorRoles: OFFICER_ROLES }),
          paymentsService.getPage(contributionPage - 1, PAGE_SIZE),
        ]);

        setSystemLogs(systemResult.data);
        setSystemTotal(systemResult.total);
        setContributionLogs(contributionResult.data);
        setContributionTotal(contributionResult.total);
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
  }, [loadLogs]);

  useEffect(() => {
    const unsubscribeAudit = auditLogsService.subscribe(() => void loadLogs(true));
    const unsubscribePayments = paymentsService.subscribe(() => void loadLogs(true));
    return () => {
      unsubscribeAudit();
      unsubscribePayments();
    };
  }, [loadLogs]);

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
          <StatCard featured icon={ClipboardList} label="System events" value={loading ? "—" : systemTotal} hint="Officer and administrative actions" />
          <StatCard icon={Coins} tone="success" label="Contribution records" value={loading ? "—" : contributionTotal} hint="Payments recorded by officers" />
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
            pagination={{ page: systemPage, totalItems: systemTotal, onPage: setSystemPage }}
          >
            {systemLogs.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No system activity found." />
            ) : (
              <table className="data-table min-w-[980px]">
                <thead>
                  <tr>
                    <th>Actor</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Description</th>
                    <th>Entity</th>
                    <th>Date/Time</th>
                  </tr>
                </thead>
                <tbody>
                  {systemLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="font-semibold">{log.actorName || "—"}</td>
                      <td className="text-muted">{log.actorRole ? formatLabel(log.actorRole) : "—"}</td>
                      <td>
                        <span className="chip chip-brand">{log.action ? formatLabel(log.action) : "—"}</span>
                      </td>
                      <td className="max-w-[28rem] whitespace-normal text-muted">{log.description || "—"}</td>
                      <td className="text-muted">{log.entityType ? formatLabel(log.entityType) : "—"}</td>
                      <td className="whitespace-nowrap text-muted">{formatPhilippineDateTime(log.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </LogCard>

          <LogCard
            icon={Coins}
            tone="success"
            title="Contribution Logs"
            subtitle="Contribution and payment activity with its own count and pagination."
            pagination={{ page: contributionPage, totalItems: contributionTotal, onPage: setContributionPage }}
          >
            {contributionLogs.length === 0 ? (
              <EmptyState icon={Coins} title="No contribution activity found." />
            ) : (
              <table className="data-table min-w-[1040px]">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Event</th>
                    <th>Amount</th>
                    <th>Payment/Action</th>
                    <th>Officer</th>
                    <th>Role</th>
                    <th>Date/Time</th>
                    <th>OR/Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {contributionLogs.map((payment) => (
                    <tr key={payment.id}>
                      <td className="font-semibold">{payment.studentName || "—"}</td>
                      <td className="text-muted">{payment.eventName || "—"}</td>
                      <td className="whitespace-nowrap font-semibold tabular-nums">{formatPeso(payment.amount)}</td>
                      <td>
                        <span className="chip chip-success">Payment recorded</span>
                      </td>
                      <td className="text-muted">{payment.recordedBy || "—"}</td>
                      <td className="text-muted">{payment.recordedBy ? officerRoleFromName(payment.recordedBy) : "—"}</td>
                      <td className="whitespace-nowrap text-muted">{formatPhilippineDateTime(payment.recordedAt)}</td>
                      <td className="font-mono text-xs text-muted">{payment.orNumber || payment.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </LogCard>
        </>
      )}
    </Page>
  );
}

interface LogCardProps {
  icon: LucideIcon;
  tone?: "brand" | "success";
  title: string;
  subtitle: string;
  /** Server-side pagination: the page shown and the total row count. */
  pagination: { page: number; totalItems: number; onPage: (page: number) => void };
  children: ReactNode;
}

function LogCard({ icon: Icon, tone = "brand", title, subtitle, pagination, children }: LogCardProps) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line/60 p-5 lg:p-6">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full", tone === "success" ? "bg-success/10 text-success" : "bg-brand-500/10 text-brand-500")}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
      </header>
      <div data-lenis-prevent className="table-scroll">
        {children}
      </div>
      <Pagination {...pagination} pageSize={PAGE_SIZE} totalPages={Math.max(1, Math.ceil(pagination.totalItems / PAGE_SIZE))} />
    </section>
  );
}
