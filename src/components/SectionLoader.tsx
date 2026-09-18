import Skeleton from "@/components/Skeleton";

interface SectionLoaderProps {
  message?: string;
  variant?: "dashboard" | "table" | "cards" | "detail" | "list";
}

/** Layout-shaped loading state shared by public and admin data sections. */
export default function SectionLoader({
  message = "Loading...",
  variant = "table",
}: SectionLoaderProps) {
  const rowCount = variant === "dashboard" ? 4 : variant === "cards" ? 3 : 5;

  return (
    <div className="glass-card p-5 lg:p-6" role="status" aria-label={message}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3 w-64 max-w-[65vw]" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>

      {variant === "dashboard" && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-white/10 p-4">
              <Skeleton className="mb-4 h-9 w-9 rounded-lg" />
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
      )}

      {variant === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: rowCount }).map((_, index) => (
            <div key={index} className="rounded-xl border border-white/10 p-4">
              <Skeleton className="mb-4 h-32 w-full rounded-lg" />
              <Skeleton className="mb-2 h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : variant === "detail" ? (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-72 max-w-[70vw]" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-white/10 p-4">
                <Skeleton className="mb-3 h-3 w-24" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <div className="grid grid-cols-4 gap-4 bg-white/5 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-20 max-w-full" />
            ))}
          </div>
          <div className="divide-y divide-white/10">
            {Array.from({ length: rowCount }).map((_, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-4 gap-4 p-4">
                <Skeleton className="h-4 w-32 max-w-full" />
                <Skeleton className="h-4 w-24 max-w-full" />
                <Skeleton className="h-4 w-28 max-w-full" />
                <Skeleton className="h-7 w-20 max-w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}