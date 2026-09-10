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
  icon: LucideIcon;
  color: "blue" | "green" | "amber" | "red" | "purple";
  value: number | string;
  label: string;
  /** Optional subtitle below the label. */
  subtitle?: string;
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
}: SummaryCardProps) {
  return (
    <div className="glass-card p-4 lg:p-5 flex items-center gap-3">
      {/* Icon */}
      <div
        className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center ${COLOR_CLASSES[color]}`}
      >
        <Icon className="w-4 h-4" />
      </div>

      {/* Text */}
      <div className="min-w-0">
        <p className="font-display font-bold text-xl lg:text-2xl text-dark truncate">
          {value}
        </p>
        <p className="text-xs text-text-secondary uppercase tracking-wider truncate">
          {label}
        </p>
        {subtitle && (
          <p className="text-xs text-text-secondary/70 mt-0.5 truncate">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
