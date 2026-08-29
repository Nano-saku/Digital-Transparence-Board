import type { LucideIcon } from "lucide-react";

interface SectionEmptyStateProps {
  message: string;
  icon: LucideIcon;
  /** Wrap the message in a padded glass card (full-section empty states). */
  card?: boolean;
  /** Compact sizing for in-table placeholders (`py-8`, smaller icon). */
  compact?: boolean;
}

/** Consistent "nothing here yet" placeholder for lists, tables, and cards. */
export default function SectionEmptyState({
  message,
  icon: Icon,
  card = false,
  compact = false,
}: SectionEmptyStateProps) {
  return (
    <div
      className={`text-center text-text-secondary ${card ? "glass-card p-12" : ""} ${
        compact ? "py-8" : "py-12"
      }`}
    >
      <Icon className={`${compact ? "w-10 h-10 mb-2" : "w-12 h-12 mb-3"} mx-auto opacity-40`} />
      <p>{message}</p>
    </div>
  );
}