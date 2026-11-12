import { useId, useRef } from "react";
import { PieChart, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { Transaction } from "@/types";
import { cn } from "@/lib/utils";
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap";
import CountUp from "@/components/motion/CountUp";

/**
 * Dashboard funds card: a large peso amount (whole part + smaller cents), the
 * change between the two latest transaction dates, and a sparkline of the
 * transaction history that draws itself in whenever the data changes.
 */

type ChartMode = "income" | "expense" | "balance";

interface FinancialSummaryCardProps {
  /** Card title, e.g. "Funds Collected" */
  title: string;
  /** Current total value in PHP */
  value: number;
  /**
   * Transactions for chart + change computation.
   * For "income" / "expense" modes, pass only the relevant type.
   * For "balance" mode, pass all transactions via allTransactions.
   */
  transactions: Transaction[];
  /**
   * How to compute chart points:
   * - "income"  → daily income amounts
   * - "expense" → daily expense amounts
   * - "balance" → cumulative running balance
   */
  chartMode: ChartMode;
  /** Required for balance mode: all transactions (income + expense). */
  allTransactions?: Transaction[];
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

// ─── Chart data ──────────────────────────────────────────────────────────────

const dayOf = (t: Transaction) => t.date?.slice(0, 10);

const dayTotal = (date: string, type: "income" | "expense", src: Transaction[]) =>
  src.filter((t) => dayOf(t) === date && t.type === type).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

/** Distinct transaction dates in the source data, oldest → newest. */
function sortedDates(source: Transaction[]): string[] {
  const dates = new Set<string>();
  source.forEach((t) => {
    const d = dayOf(t);
    if (d) dates.add(d);
  });
  return [...dates].sort();
}

/** One value per distinct transaction date (oldest → newest) for the sparkline. */
function buildChartPoints(transactions: Transaction[], mode: ChartMode, allTransactions: Transaction[]): number[] {
  const source = mode === "balance" ? allTransactions : transactions;
  if (source.length === 0) return [];
  const dates = sortedDates(source);

  if (mode !== "balance") return dates.map((d) => dayTotal(d, mode, transactions));

  // balance: cumulative running balance per date
  let running = 0;
  return dates.map((d) => {
    running += dayTotal(d, "income", allTransactions) - dayTotal(d, "expense", allTransactions);
    return running;
  });
}

/**
 * Compare the most-recent transaction date to the previous date to compute
 * a change amount and percentage. Returns { amount: 0, percent: 0 } when
 * there is not enough historical data to compute a meaningful change.
 */
function computeChange(transactions: Transaction[], mode: ChartMode, allTransactions: Transaction[]): { amount: number; percent: number } {
  const source = mode === "balance" ? allTransactions : transactions;
  if (source.length === 0) return { amount: 0, percent: 0 };
  const dates = sortedDates(source);
  if (dates.length < 2) return { amount: 0, percent: 0 };

  const latestDate = dates[dates.length - 1];
  const prevDate = dates[dates.length - 2];

  if (mode !== "balance") {
    const latestVal = dayTotal(latestDate, mode, transactions);
    const prevVal = dayTotal(prevDate, mode, transactions);
    const amount = latestVal - prevVal;
    return { amount, percent: prevVal > 0 ? (amount / prevVal) * 100 : 0 };
  }

  // balance: cumulative at prevDate vs. cumulative at latestDate
  let cumPrev = 0;
  let cumLatest = 0;
  for (const d of dates) {
    const net = dayTotal(d, "income", allTransactions) - dayTotal(d, "expense", allTransactions);
    if (d <= prevDate) cumPrev += net;
    if (d <= latestDate) cumLatest += net;
  }
  const amount = cumLatest - cumPrev;
  return { amount, percent: cumPrev !== 0 ? (amount / Math.abs(cumPrev)) * 100 : 0 };
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

const cents = (n: number) => Math.round((Math.abs(n) - Math.floor(Math.abs(n))) * 100).toString().padStart(2, "0");
const whole = (n: number) => Math.floor(Math.abs(n)).toLocaleString("en-US");

// ─── Card ────────────────────────────────────────────────────────────────────

export default function FinancialSummaryCard({ title, value, transactions, chartMode, allTransactions = [], loading }: FinancialSummaryCardProps) {
  const lineRef = useRef<SVGPathElement>(null);
  const gradId = `fsc-${useId().replace(/[^\w-]/g, "")}`;
  const { icon: Icon, tone, tile } = MODE_STYLE[chartMode];

  const points = downsample(buildChartPoints(transactions, chartMode, allTransactions));
  const line = linePath(points);
  const { amount: change, percent } = computeChange(transactions, chartMode, allTransactions);
  const positive = change >= 0;
  const sign = positive ? "+" : "−";
  const percentAbs = Math.abs(percent);

  // Draw the line in whenever the data changes.
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

        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={cn("font-semibold tabular-nums", positive ? "text-success" : "text-danger")}>
            {sign}₱{whole(change)}.{cents(change)}
          </span>
          <span className={cn("font-medium tabular-nums", positive ? "text-success" : "text-danger")}>
            {percentAbs < 0.005 ? "0.0%" : `${sign}${percentAbs.toFixed(1)}%`}
          </span>
          <span className="text-muted">latest period</span>
        </p>
      </div>

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        height={SVG_H}
        preserveAspectRatio="none"
        aria-hidden="true"
        className={cn("mt-auto block", tone)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {points.length >= 2 && <path d={`${line} L ${SVG_W},${SVG_H} L 0,${SVG_H} Z`} fill={`url(#${gradId})`} />}
        <path
          ref={lineRef}
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
