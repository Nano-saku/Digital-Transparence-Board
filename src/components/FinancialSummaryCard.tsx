import { useId, useRef } from "react";
import { PieChart, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { Transaction } from "@/types";
import { cn } from "@/lib/utils";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import CountUp from "@/components/motion/CountUp";

type ChartMode = "income" | "expense" | "balance";

interface FinancialSummaryCardProps {
  title: string;
  /** Current total in PHP. */
  value: number;
  /** Full transaction history (income + expense). */
  transactions: Transaction[];
  /** Sparkline: daily income, daily expense, or the running balance. */
  chartMode: ChartMode;
  /** Show a placeholder amount while the dashboard loads. */
  loading?: boolean;
}

const MODE_STYLE: Record<ChartMode, { icon: LucideIcon; tone: string; tile: string }> = {
  income: { icon: TrendingUp, tone: "text-success", tile: "bg-success/10 text-success" },
  expense: { icon: TrendingDown, tone: "text-danger", tile: "bg-danger/10 text-danger" },
  balance: { icon: PieChart, tone: "text-warning", tile: "bg-warning/10 text-warning" },
};

const SVG_W = 280;
const SVG_H = 52;
const PAD = 4;

/** One value per distinct transaction date, oldest → newest. */
function series(transactions: Transaction[], mode: ChartMode): number[] {
  const byDay = new Map<string, Record<Transaction["type"], number>>();
  for (const t of transactions) {
    const day = t.date?.slice(0, 10);
    if (!day) continue;
    const totals = byDay.get(day) ?? { income: 0, expense: 0 };
    totals[t.type] += Math.abs(Number(t.amount) || 0);
    byDay.set(day, totals);
  }
  let running = 0;
  return [...byDay.keys()].sort().map((day) => {
    const { income, expense } = byDay.get(day)!;
    return mode === "balance" ? (running += income - expense) : mode === "income" ? income : expense;
  });
}

/** Change between the two latest dates; zero without enough history. */
function latestChange(points: number[]): { amount: number; percent: number } {
  if (points.length < 2) return { amount: 0, percent: 0 };
  const [prev, latest] = points.slice(-2);
  const amount = latest - prev;
  return { amount, percent: prev !== 0 ? (amount / Math.abs(prev)) * 100 : 0 };
}

/** Downsample to ≤ 12 points for clarity, always keeping the newest. */
function downsample(points: number[]): number[] {
  if (points.length <= 12) return points;
  const step = Math.ceil(points.length / 12);
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

/** Smooth cubic-bezier line through the points; a flat baseline when there are too few. */
function linePath(points: number[]): string {
  if (points.length < 2) return `M 0,${SVG_H * 0.6} L ${SVG_W},${SVG_H * 0.6}`;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * SVG_W);
  const ys = points.map((v) => PAD + ((max - v) / range) * (SVG_H - PAD * 2));
  return xs.reduce((acc, x, i) => {
    if (i === 0) return `M ${x},${ys[i]}`;
    const cpX = (xs[i - 1] + x) / 2;
    return `${acc} C ${cpX},${ys[i - 1]} ${cpX},${ys[i]} ${x},${ys[i]}`;
  }, "");
}

const cents = (n: number) => Math.round((Math.abs(n) % 1) * 100).toString().padStart(2, "0");
const whole = (n: number) => Math.floor(Math.abs(n)).toLocaleString("en-US");

/**
 * Dashboard funds card: a large peso amount (whole part + smaller cents), the
 * change between the two latest transaction dates, and a sparkline of the
 * history that draws itself in whenever the data changes.
 */
export default function FinancialSummaryCard({ title, value, transactions, chartMode, loading }: FinancialSummaryCardProps) {
  const lineRef = useRef<SVGPathElement>(null);
  const gradId = `fsc-${useId().replace(/[^\w-]/g, "")}`;
  const { icon: Icon, tone, tile } = MODE_STYLE[chartMode];

  const history = series(transactions, chartMode);
  const points = downsample(history);
  const line = linePath(points);
  const { amount: change, percent } = latestChange(history);
  const sign = change >= 0 ? "+" : "−";
  const changeTone = change >= 0 ? "text-success" : "text-danger";

  useGSAP(
    () => {
      const path = lineRef.current;
      if (!path || prefersReducedMotion()) return;
      const length = path.getTotalLength();
      gsap.fromTo(path, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.out" });
    },
    { dependencies: [line] },
  );

  return (
    <div className="card flex min-h-[180px] flex-col overflow-hidden">
      <div className="flex-1 px-5 pb-2 pt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-muted">{title}</p>
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", tile)}>
            <Icon className="h-4 w-4" />
          </span>
        </div>

        <p className="mt-2 flex items-baseline gap-0.5 font-extrabold tabular-nums tracking-tight text-ink">
          {loading ? (
            <span className="text-2xl">—</span>
          ) : (
            <>
              <span className="text-2xl lg:text-3xl">
                {value < 0 && "−"}
                <CountUp value={`₱${whole(value)}`} />
              </span>
              <span className="text-sm font-semibold text-muted">.{cents(value)}</span>
            </>
          )}
        </p>

        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs tabular-nums">
          <span className={cn("font-semibold", changeTone)}>
            {sign}₱{whole(change)}.{cents(change)}
          </span>
          <span className={cn("font-medium", changeTone)}>{Math.abs(percent) < 0.005 ? "0.0%" : `${sign}${Math.abs(percent).toFixed(1)}%`}</span>
          <span className="text-muted">latest period</span>
        </p>
      </div>

      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" height={SVG_H} preserveAspectRatio="none" aria-hidden="true" className={cn("mt-auto block", tone)}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {points.length >= 2 && <path d={`${line} L ${SVG_W},${SVG_H} L 0,${SVG_H} Z`} fill={`url(#${gradId})`} />}
        <path ref={lineRef} d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
