import { useCallback, useEffect, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { auditLogsService } from "@/services/db";
import type { AuditLog } from "@/types";
import SectionEmptyState from "@/components/SectionEmptyState";
import SectionLayout from "@/components/common/SectionLayout";
import Pagination from "@/components/common/Pagination";
import SectionLoader from "@/components/SectionLoader";

interface SystemLogsSectionProps {
  onBack: () => void;
}

const PAGE_SIZE = 20;

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatLabel(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function SystemLogsSection({ onBack }: SystemLogsSectionProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLogs = useCallback(async (showRefreshState = false) => {
    try {
      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const result = await auditLogsService.getPage(
        currentPage - 1,
        PAGE_SIZE,
      );

      // Contributions have their own management view and do not belong in
      // the administrator's general system activity list.
      setLogs(
        result.data.filter(
          (log) =>
            String(log.entityType ?? "").trim().toLowerCase() !==
            "contribution",
        ),
      );
      setTotalLogs(result.total);
    } catch (error) {
      console.error("Error loading system logs:", error);
      toast.error("Failed to load system logs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    return auditLogsService.subscribe(() => {
      void loadLogs(true);
    });
  }, [loadLogs]);

  const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));
  const pageStartIndex = (currentPage - 1) * PAGE_SIZE;

  return (
    <SectionLayout
      title="System Logs"
      subtitle="Review administrative activity across the transparency board"
      onBack={onBack}
      headerActions={
        <button
          type="button"
          onClick={() => void loadLogs(true)}
          disabled={loading || refreshing}
          className="btn-secondary px-4 py-2.5 text-sm inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      {loading ? (
        <SectionLoader message="Loading system logs" variant="table" />
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-white/10 p-5 lg:p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-royal-blue/10">
              <ClipboardList className="h-5 w-5 text-royal-blue" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-dark">
                Activity history
              </h2>
              <p className="text-sm text-text-secondary">
                Showing system actions from newest to oldest.
              </p>
            </div>
          </div>

          {logs.length === 0 ? (
            <SectionEmptyState
              message="No system activity found."
              icon={ClipboardList}
              compact
            />
          ) : (
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
                        {formatDateTime(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="px-5 pb-5 lg:px-6 lg:pb-6">
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                totalItems={totalLogs}
                startIndex={pageStartIndex}
                endIndex={pageStartIndex + logs.length}
                onPrev={() => setCurrentPage((page) => Math.max(1, page - 1))}
                onNext={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
                onJump={setCurrentPage}
              />
            </div>
          )}
        </div>
      )}
    </SectionLayout>
  );
}