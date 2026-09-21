import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Coins, RefreshCw, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { auditLogsService, paymentsService } from "@/services/db";
import type { AuditLog, PaymentRecord } from "@/types";
import SectionEmptyState from "@/components/SectionEmptyState";
import SectionLayout from "@/components/common/SectionLayout";
import Pagination from "@/components/common/Pagination";
import SectionLoader from "@/components/SectionLoader";
import { formatPhilippineDateTime } from "@/lib/format";

interface SystemLogsSectionProps {
  onBack: () => void;
}

const PAGE_SIZE = 20;
const OFFICER_ROLES = [
  "admin",
  "secretary",
  "treasurer",
  "auditor",
  "board-member",
] as const;

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
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function LogsTable({
  logs,
  emptyMessage,
  icon: Icon,
}: {
  logs: AuditLog[];
  emptyMessage: string;
  icon: LucideIcon;
}) {
  if (logs.length === 0) {
    return <SectionEmptyState message={emptyMessage} icon={Icon} compact />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="glass-table min-w-[980px]">
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
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="font-medium text-dark">{log.actorName || "—"}</td>
              <td className="text-text-secondary">
                {log.actorRole ? formatLabel(log.actorRole) : "—"}
              </td>
              <td>
                <span className="inline-flex rounded-full bg-royal-blue/10 px-2.5 py-1 text-xs font-medium text-royal-blue">
                  {log.action ? formatLabel(log.action) : "—"}
                </span>
              </td>
              <td className="max-w-[28rem] whitespace-normal text-text-secondary">
                {log.description || "—"}
              </td>
              <td className="text-text-secondary">
                {log.entityType ? formatLabel(log.entityType) : "—"}
              </td>
              <td className="whitespace-nowrap text-text-secondary">
                {formatPhilippineDateTime(log.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentLogsTable({ logs }: { logs: PaymentRecord[] }) {
  if (logs.length === 0) {
    return <SectionEmptyState message="No contribution activity found." icon={Coins} compact />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="glass-table min-w-[1040px]">
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
          {logs.map((payment) => (
            <tr key={payment.id}>
              <td className="font-medium text-dark">{payment.studentName || "—"}</td>
              <td className="text-text-secondary">{payment.eventName || "—"}</td>
              <td className="whitespace-nowrap font-medium text-dark">
                ₱{payment.amount.toLocaleString()}
              </td>
              <td>
                <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  Payment recorded
                </span>
              </td>
              <td className="text-text-secondary">{payment.recordedBy || "—"}</td>
              <td className="text-text-secondary">
                {payment.recordedBy ? officerRoleFromName(payment.recordedBy) : "—"}
              </td>
              <td className="whitespace-nowrap text-text-secondary">
                {formatPhilippineDateTime(payment.recordedAt)}
              </td>
              <td className="text-text-secondary">{payment.orNumber || payment.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogsPager({
  page,
  total,
  visibleCount,
  onPageChange,
}: {
  page: number;
  total: number;
  visibleCount: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  return (
    <Pagination
      page={page}
      totalPages={totalPages}
      totalItems={total}
      startIndex={startIndex}
      endIndex={startIndex + visibleCount}
      onPrev={() => onPageChange(Math.max(1, page - 1))}
      onNext={() => onPageChange(Math.min(totalPages, page + 1))}
      onJump={onPageChange}
    />
  );
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
          auditLogsService.getPage(systemPage - 1, PAGE_SIZE, {
            entityTypes: [
              "authentication",
              "student",
              "event",
              "attendance",
              "transaction",
              "requirement_file",
              "feedback",
              "board_member",
            ],
            actorRoles: OFFICER_ROLES,
          }),
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
    <SectionLayout
      title="System Logs"
      subtitle="Review administrative activity and contribution history across the transparency board"
      onBack={onBack}
      headerActions={
        <button
          type="button"
          onClick={() => void loadLogs(true)}
          disabled={loading || refreshing}
          className="btn-secondary inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      {loading ? (
        <SectionLoader message="Loading system logs" variant="table" />
      ) : (
        <div className="space-y-6">
          <section className="glass-card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-white/10 p-5 lg:p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-royal-blue/10">
                <ClipboardList className="h-5 w-5 text-royal-blue" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-dark">System Logs</h2>
                <p className="text-sm text-text-secondary">Officer and administrative actions, newest to oldest.</p>
              </div>
            </div>
            <LogsTable logs={systemLogs} emptyMessage="No system activity found." icon={ClipboardList} />
            <div className="px-5 pb-5 lg:px-6 lg:pb-6">
              <LogsPager page={systemPage} total={systemTotal} visibleCount={systemLogs.length} onPageChange={setSystemPage} />
            </div>
          </section>

          <section className="glass-card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-white/10 p-5 lg:p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <Coins className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-dark">Contribution Logs</h2>
                <p className="text-sm text-text-secondary">Contribution and payment activity with its own count and pagination.</p>
              </div>
            </div>
            <PaymentLogsTable logs={contributionLogs} />
            <div className="px-5 pb-5 lg:px-6 lg:pb-6">
              <LogsPager page={contributionPage} total={contributionTotal} visibleCount={contributionLogs.length} onPageChange={setContributionPage} />
            </div>
          </section>
        </div>
      )}
    </SectionLayout>
  );
}