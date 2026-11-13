import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import CountUp from "@/components/motion/CountUp";

const TONES = {
  brand: "bg-brand-500/10 text-brand-500",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

interface StatCardProps {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  hint?: string;
  /** Render as the highlighted deep-blue card. */
  featured?: boolean;
  className?: string;
}

export default function StatCard({ label, value, icon: Icon, tone = "brand", hint, featured, className }: StatCardProps) {
  return (
    // Phones: icon above the number so two cards fit side by side without truncating.
    <div className={cn(featured ? "card-brand" : "card", "flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5", className)}>
      {Icon && (
        <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full sm:h-11 sm:w-11", featured ? "bg-white/15 text-white" : TONES[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className={cn("text-xs font-semibold", featured ? "text-white/75" : "text-muted")}>{label}</p>
        <p className={cn("mt-1 truncate text-xl font-extrabold sm:text-2xl tabular-nums tracking-tight", featured ? "text-white" : "text-ink")}>
          <CountUp value={value} />
        </p>
        {hint && <p className={cn("mt-0.5 truncate text-xs", featured ? "text-white/70" : "text-muted")}>{hint}</p>}
      </div>
    </div>
  );
}
