import type { LucideIcon } from "lucide-react";

/**
 * A small summary/stat card used in management dashboards and
 * report pages (e.g. ReportManagementSection, ContributionManagementSection).
 *
 * @example
 * ```tsx
 * <SummaryCard icon={Users} color="blue" value={120} label="Students" />
 * ```
 */
interface SummaryCardProps {
  icon?: LucideIcon;
  color: "blue" | "green" | "amber" | "red" | "purple";
  value: number | string;
  label: string;
  /** Optional subtitle below the label. */
  subtitle?: string;
  /** Compact layout without the icon, intended for stacked stat cards. */
  compact?: boolean;
}

const COLOR_CLASSES: Record<SummaryCardProps["color"], string> = {
  blue: "bg-blue-100 text-blue-600",
  green: "bg-green-100 text-green-600",
  amber: "bg-amber-100 text-amber-600",
  red: "bg-red-100 text-red-500",
  purple: "bg-purple-100 text-purple-600",
};

export default function SummaryCard({
  icon: Icon,
  color,
  value,
  label,
  subtitle,
  compact = false,
}: SummaryCardProps) {
  return (
    <div
      className={
        compact
          ? "glass-card px-4 py-3.5 flex flex-col justify-center"
          : "glass-card p-4 lg:p-5 flex items-center gap-3"
      }
    >
      {/* Icon */}
      {!compact && Icon && (
        <div
          className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center ${COLOR_CLASSES[color]}`}
        >
          <Icon className="w-4 h-4" />
        </div>
      )}

      {/* Text */}
      <div className="min-w-0">
        <p
          className={
            compact
              ? "font-display font-bold text-2xl lg:text-3xl text-dark leading-tight truncate"
              : "font-display font-bold text-xl lg:text-2xl text-dark truncate"
          }
        >
          {value}
        </p>

        <p
          className={
            compact
              ? "text-[11px] text-text-secondary uppercase tracking-wider mt-1 truncate"
              : "text-xs text-text-secondary uppercase tracking-wider truncate"
          }
        >
          {label}
        </p>

        {subtitle && (
          <p
            className={
              compact
                ? "text-[10px] text-text-secondary/60 mt-0.5 truncate"
                : "text-xs text-text-secondary/70 mt-0.5 truncate"
            }
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
