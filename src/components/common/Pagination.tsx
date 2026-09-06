import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Pagination controls for data tables. Displays page numbers with
 * Previous/Next buttons and a "Showing X–Y of Z" summary.
 *
 * @example
 * ```tsx
 * <Pagination
 *   page={pagination.page}
 *   totalPages={pagination.totalPages}
 *   totalItems={pagination.totalItems}
 *   startIndex={pagination.startIndex}
 *   endIndex={pagination.endIndex}
 *   onPrev={pagination.prevPage}
 *   onNext={pagination.nextPage}
 *   onJump={pagination.setPage}
 * />
 * ```
 */
interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onJump?: (page: number) => void;
  /** Maximum visible page buttons (default: 5). */
  maxVisible?: number;
}

export default function Pagination({
  page,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onPrev,
  onNext,
  onJump,
  maxVisible = 5,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  // Compute visible page numbers
  const half = Math.floor(maxVisible / 2);
  let start = Math.max(1, page - half);
  const end = Math.min(totalPages, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);

  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 text-sm text-text-secondary">
      <span>
        Showing <strong className="text-dark">{startIndex + 1}–{Math.min(endIndex, totalItems)}</strong> of{" "}
        <strong className="text-dark">{totalItems}</strong>
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          disabled={page <= 1}
          className="p-2 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/50 transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {start > 1 && (
          <>
            <button
              onClick={() => onJump?.(1)}
              className="w-8 h-8 rounded-lg hover:bg-white/50 transition-colors text-xs"
            >
              1
            </button>
            {start > 2 && (
              <span className="px-1 text-text-secondary/50">…</span>
            )}
          </>
        )}

        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onJump?.(p)}
            className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
              p === page
                ? "bg-red text-white"
                : "hover:bg-white/50 text-dark"
            }`}
          >
            {p}
          </button>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && (
              <span className="px-1 text-text-secondary/50">…</span>
            )}
            <button
              onClick={() => onJump?.(totalPages)}
              className="w-8 h-8 rounded-lg hover:bg-white/50 transition-colors text-xs"
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          onClick={onNext}
          disabled={page >= totalPages}
          className="p-2 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/50 transition-colors"
          title="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
