import { useRef, useEffect } from "react";
import type { Transaction } from "@/types";

/**
 * FinancialSummaryCard
 *
 * A financial summary card for the Admin Dashboard that adapts to
 * both dark and light themes via the project's [data-theme] CSS variable system.
 *
 * Dark mode  → deep navy gradient, near-white text, green sparkline.
 * Light mode → white/pale-blue surface, dark navy text, green sparkline.
 *
 * Visual reference: rounded card, large top-left PHP amount with split
 * whole/decimal display, green change indicator, smooth SVG cubic-bezier
 * sparkline with gradient fill, draw-in animation on mount.
 */

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
  chartMode: "income" | "expense" | "balance";
  /** Required for balance mode: all transactions (income + expense). */
  allTransactions?: Transaction[];
}

// ─── Amount Formatters ───────────────────────────────────────────────────────

/** Format a number's whole part as "₱58,834" (no decimals). */
function formatWhole(amount: number): string {
  const abs = Math.abs(amount);
  return `₱${Math.floor(abs).toLocaleString("en-US")}`;
}

/** Extract the two-decimal fraction string, e.g. 834.75 → "75". */
function formatDecimalPart(amount: number): string {
  const abs = Math.abs(amount);
  const cents = Math.round((abs - Math.floor(abs)) * 100);
  return cents.toString().padStart(2, "0");
}

// ─── Chart Data Builder ──────────────────────────────────────────────────────

/**
 * Build an ordered array of values (oldest → newest) for the sparkline.
 * One value per distinct transaction date in the source data.
 */
function buildChartPoints(
  transactions: Transaction[],
  mode: "income" | "expense" | "balance",
  allTransactions: Transaction[],
): number[] {
  const source = mode === "balance" ? allTransactions : transactions;
  if (source.length === 0) return [];

  const dateSet = new Set<string>();
  source.forEach((t) => { if (t.date) dateSet.add(t.date.slice(0, 10)); });
  const sortedDates = [...dateSet].sort();

  if (mode === "income") {
    return sortedDates.map((d) =>
      transactions
        .filter((t) => t.date?.slice(0, 10) === d && t.type === "income")
        .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
    );
  }

  if (mode === "expense") {
    return sortedDates.map((d) =>
      transactions
        .filter((t) => t.date?.slice(0, 10) === d && t.type === "expense")
        .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
    );
  }

  // balance: cumulative running balance per date
  let running = 0;
  return sortedDates.map((d) => {
    const dayIncome = allTransactions
      .filter((t) => t.date?.slice(0, 10) === d && t.type === "income")
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    const dayExpense = allTransactions
      .filter((t) => t.date?.slice(0, 10) === d && t.type === "expense")
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    running += dayIncome - dayExpense;
    return running;
  });
}

// ─── Change Indicator ────────────────────────────────────────────────────────

/**
 * Compare the most-recent transaction date to the previous date to compute
 * a change amount and percentage. Returns { amount: 0, percent: 0 } when
 * there is not enough historical data to compute a meaningful change.
 */
function computeChange(
  transactions: Transaction[],
  mode: "income" | "expense" | "balance",
  allTransactions: Transaction[],
): { amount: number; percent: number } {
  const source = mode === "balance" ? allTransactions : transactions;
  if (source.length === 0) return { amount: 0, percent: 0 };

  const dateSet = new Set<string>();
  source.forEach((t) => { if (t.date) dateSet.add(t.date.slice(0, 10)); });
  const sortedDates = [...dateSet].sort();
  if (sortedDates.length < 2) return { amount: 0, percent: 0 };

  const latestDate = sortedDates[sortedDates.length - 1];
  const prevDate   = sortedDates[sortedDates.length - 2];

  const dayTotal = (date: string, type: "income" | "expense", src: Transaction[]) =>
    src
      .filter((t) => t.date?.slice(0, 10) === date && t.type === type)
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

  if (mode === "income") {
    const todayVal = dayTotal(latestDate, "income", transactions);
    const prevVal  = dayTotal(prevDate,   "income", transactions);
    const amount   = todayVal - prevVal;
    const percent  = prevVal > 0 ? (amount / prevVal) * 100 : 0;
    return { amount, percent };
  }

  if (mode === "expense") {
    const todayVal = dayTotal(latestDate, "expense", transactions);
    const prevVal  = dayTotal(prevDate,   "expense", transactions);
    const amount   = todayVal - prevVal;
    const percent  = prevVal > 0 ? (amount / prevVal) * 100 : 0;
    return { amount, percent };
  }

  // balance: cumulative at prevDate vs. cumulative at latestDate
  let cumPrev = 0;
  let cumLatest = 0;
  for (const d of sortedDates) {
    const net =
      dayTotal(d, "income", allTransactions) -
      dayTotal(d, "expense", allTransactions);
    if (d <= prevDate)   cumPrev   += net;
    if (d <= latestDate) cumLatest += net;
  }
  const amount  = cumLatest - cumPrev;
  const percent = cumPrev !== 0 ? (amount / Math.abs(cumPrev)) * 100 : 0;
  return { amount, percent };
}

// ─── SVG Sparkline ──────────────────────────────────────────────────────────

interface SparklineProps {
  points: number[];
  width: number;
  height: number;
}

function Sparkline({ points, width, height }: SparklineProps) {
  const pad = 4;

  if (points.length < 2) {
    const y = height * 0.6;
    return (
      <polyline
        points={`0,${y} ${width},${y}`}
        fill="none"
        stroke="#4ade80"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const xs = points.map((_, i) => (i / (points.length - 1)) * width);
  const ys = points.map((v) => pad + ((max - v) / range) * (height - pad * 2));

  const d = xs.reduce((acc, x, i) => {
    if (i === 0) return `M ${x},${ys[i]}`;
    const cpX = (xs[i - 1] + x) / 2;
    return `${acc} C ${cpX},${ys[i - 1]} ${cpX},${ys[i]} ${x},${ys[i]}`;
  }, "");

  return (
    <path
      d={d}
      fill="none"
      stroke="#4ade80"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

// ─── Area fill under the sparkline ──────────────────────────────────────────

interface AreaPathProps {
  points: number[];
  width: number;
  height: number;
  gradientId: string;
}

function AreaPath({ points, width, height, gradientId }: AreaPathProps) {
  if (points.length < 2) return null;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const xs = points.map((_, i) => (i / (points.length - 1)) * width);
  const ys = points.map((v) => pad + ((max - v) / range) * (height - pad * 2));

  const linePath = xs.reduce((acc, x, i) => {
    if (i === 0) return `M ${x},${ys[i]}`;
    const cpX = (xs[i - 1] + x) / 2;
    return `${acc} C ${cpX},${ys[i - 1]} ${cpX},${ys[i]} ${x},${ys[i]}`;
  }, "");

  const d = `${linePath} L ${xs[xs.length - 1]},${height} L ${xs[0]},${height} Z`;
  return <path d={d} fill={`url(#${gradientId})`} stroke="none" />;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function FinancialSummaryCard({
  title,
  value,
  transactions,
  chartMode,
  allTransactions = [],
}: FinancialSummaryCardProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Build chart data points (downsample to ≤ 12 for clarity)
  const rawPoints = buildChartPoints(transactions, chartMode, allTransactions);
  const chartPoints =
    rawPoints.length <= 12
      ? rawPoints
      : rawPoints.filter(
          (_, i) =>
            i % Math.ceil(rawPoints.length / 12) === 0 ||
            i === rawPoints.length - 1,
        );

  // Change indicator derived from real data
  const { amount: changeAmount, percent: changePercent } = computeChange(
    transactions,
    chartMode,
    allTransactions,
  );

  const isPositive = changeAmount >= 0;
  const changeSign = isPositive ? "+" : "−";
  const changeAbs  = Math.abs(changeAmount);
  const changeWhole   = Math.floor(changeAbs).toLocaleString("en-US");
  const changeCents   = Math.round((changeAbs - Math.floor(changeAbs)) * 100)
    .toString()
    .padStart(2, "0");
  const changePercentAbs = Math.abs(changePercent);

  // Animate line draw on mount / when data changes
  useEffect(() => {
    const path = svgRef.current?.querySelector<SVGPathElement | SVGPolylineElement>(
      "path, polyline",
    );
    if (!path) return;
    const len = (path as SVGPathElement).getTotalLength?.() ?? 200;
    path.style.strokeDasharray  = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    path.style.transition       = "stroke-dashoffset 1.1s ease-out";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        path.style.strokeDashoffset = "0";
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPoints.join(",")]);

  const whole   = formatWhole(value);
  const decimal = formatDecimalPart(value);
  const gradId  = `fill-grad-${title.replace(/\s+/g, "-")}`;
  const SVG_W   = 280;
  const SVG_H   = 52;

  return (
    <div
      className="financial-summary-card relative overflow-hidden rounded-2xl flex flex-col"
      style={{ minHeight: "180px" }}
    >
      {/* Card body */}
      <div className="flex-1 px-5 pt-5 pb-2">
        {/* Title */}
        <p className="fsc-title text-[11px] font-display font-semibold uppercase tracking-widest mb-3">
          {title}
        </p>

        {/* Main amount — whole part large + decimal smaller */}
        <div className="flex items-baseline gap-0.5 leading-none mb-2">
          <span
            className="fsc-amount-whole font-display font-bold"
            style={{
              fontSize: "clamp(1.65rem, 3.8vw, 2.2rem)",
              letterSpacing: "-0.02em",
            }}
          >
            {whole}
          </span>
          <span
            className="fsc-amount-decimal font-display font-semibold"
            style={{
              fontSize: "clamp(0.88rem, 2vw, 1.1rem)",
              letterSpacing: "0",
            }}
          >
            .{decimal}
          </span>
        </div>

        {/* Change indicator */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-[12px] font-display font-semibold"
            style={{ color: isPositive ? "var(--fsc-positive)" : "var(--fsc-negative)" }}
          >
            {changeSign}₱{changeWhole}.{changeCents}
          </span>
          <span
            className="text-[11px] font-medium"
            style={{ color: isPositive ? "var(--fsc-positive)" : "var(--fsc-negative)" }}
          >
            {changePercentAbs < 0.005
              ? "0.0%"
              : `${isPositive ? "+" : "−"}${changePercentAbs.toFixed(1)}%`}
          </span>
          <span className="fsc-period text-[10px]">
            latest period
          </span>
        </div>
      </div>

      {/* Sparkline chart at the bottom */}
      <div className="mt-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          height={SVG_H}
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ display: "block" }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#22c55e" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0"    />
            </linearGradient>
          </defs>

          {/* Gradient area fill */}
          <AreaPath
            points={chartPoints}
            width={SVG_W}
            height={SVG_H}
            gradientId={gradId}
          />

          {/* Line */}
          <Sparkline points={chartPoints} width={SVG_W} height={SVG_H} />
        </svg>
      </div>
    </div>
  );
}
