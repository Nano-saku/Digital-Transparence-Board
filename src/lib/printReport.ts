// Self-contained printable HTML reports (attendance, contributions, finances):
// one landscape document shell with both official logos inlined, so the
// downloaded file opens anywhere and prints via Print → Save as PDF.
import { blobToDataUri, downloadBlob } from "@/lib/receipts";

export type Tone = "brand" | "success" | "warning" | "danger" | "accent";

/** [text colour, pill fill] per tone. */
const TONES: Record<Tone, [string, string]> = {
  brand: ["#1b2e8c", "#e0e7ff"],
  success: ["#047857", "#d1fae5"],
  warning: ["#b45309", "#fef3c7"],
  danger: ["#b91c1c", "#fee2e2"],
  accent: ["#7e22ce", "#f3e8ff"],
};

export interface Column<T> {
  label: string;
  /** Plain text; escaped when rendered. */
  value: (row: T) => string | number;
  align?: "center" | "right";
  /** Renders the value as a coloured pill. */
  pill?: (row: T) => Tone;
  /** Renders the value in bold colour. */
  tone?: (row: T) => Tone;
}

export interface PrintableReport {
  title: string;
  /** e.g. "Attendance" → "Official Attendance Record for Verification and Filing". */
  kind: string;
  meta: [label: string, value: string | number][];
  summary?: { label: string; value: string | number; tone?: Tone }[];
  /** Built with `printTable`. */
  tables: string[];
}

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"]/g, (c) => ENTITIES[c]);

/** One report table; `newPage` starts it on a fresh printed page. */
export function printTable<T>({ heading, columns, rows, empty = "No records.", newPage }: {
  heading?: string;
  columns: Column<T>[];
  rows: T[];
  empty?: string;
  newPage?: boolean;
}): string {
  const align = (c: Column<T>) => (c.align ? ` class="${c.align}"` : "");
  const cell = (c: Column<T>, row: T) => {
    const text = esc(c.value(row));
    const html = c.pill ? `<span class="pill p-${c.pill(row)}">${text}</span>` : c.tone ? `<b class="c-${c.tone(row)}">${text}</b>` : text;
    return `<td${align(c)}>${html}</td>`;
  };
  const body = rows.length
    ? rows.map((row) => `<tr>${columns.map((c) => cell(c, row)).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length}">${esc(empty)}</td></tr>`;
  const html = `${heading ? `<h2>${esc(heading)}</h2>` : ""}<table><thead><tr>${columns.map((c) => `<th${align(c)}>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
  return newPage ? `<section class="new-page">${html}</section>` : html;
}

// @page margin 0 hides the browser's own print header/footer (URL, date);
// the body padding restores the page margins instead.
const STYLES = `
@page{size:landscape;margin:0}
*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:0;padding:20px 28px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.header{display:flex;align-items:center;justify-content:center;gap:20px;border-bottom:3px solid #1b2e8c;padding-bottom:12px}
.header img{width:70px;height:70px;object-fit:contain}.title{text-align:center}.org{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1.8px}.title h1{font-size:22px;color:#1b2e8c;margin:3px 0;font-weight:800}.sub{font-size:11px;color:#6b7280}
.metadata{display:grid;grid-template-columns:1fr 1fr;gap:7px 30px;margin:16px 0;font-size:13px}.label{font-weight:700;color:#374151;display:inline-block;min-width:125px}
.summary{display:grid;gap:10px;margin:14px 0 18px}.card{border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;padding:9px;text-align:center}.number{font-weight:800;font-size:20px}.caption{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.8px;margin-top:2px}
h2{font-size:15px;color:#1b2e8c;margin:18px 0 8px;border-bottom:2px solid #1b2e8c;padding-bottom:5px}
table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px}thead tr{background:#1b2e8c;color:#fff}th{padding:8px 7px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.4px}td{padding:7px;border-bottom:1px solid #e5e7eb}tbody tr:nth-child(even){background:#f9fafb}
.center{text-align:center}.right{text-align:right;white-space:nowrap}.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:9px;font-weight:700;white-space:nowrap}
${Object.entries(TONES).map(([tone, [text, fill]]) => `.c-${tone}{color:${text}}.p-${tone}{background:${fill};color:${text}}`).join("")}
footer{display:flex;justify-content:space-between;margin-top:18px;padding-top:9px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:10px}
@media print{body{padding:12mm 10mm}.new-page{break-before:page;page-break-before:always}h2{break-after:avoid-page;page-break-after:avoid}}`;

function renderReport({ title, kind, meta, summary = [], tables }: PrintableReport, [lscLogo, dsscLogo]: string[]): string {
  const metadata = meta.map(([label, value]) => `<div><span class="label">${esc(label)}:</span>${esc(value)}</div>`).join("");
  const cards = summary
    .map(({ label, value, tone }) => `<div class="card"><div class="number${tone ? ` c-${tone}` : ""}">${esc(value)}</div><div class="caption">${esc(label)}</div></div>`)
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>${esc(title)}</title><style>${STYLES}</style></head><body>
<header class="header"><img src="${lscLogo}" alt="LSC logo"/><div class="title"><div class="org">Local Student Council · DSSC Santa Cruz</div><h1>${esc(title)}</h1><div class="sub">Official ${esc(kind)} Record for Verification and Filing</div></div><img src="${dsscLogo}" alt="DSSC logo"/></header>
<section class="metadata">${metadata}</section>
${cards && `<section class="summary" style="grid-template-columns:repeat(${summary.length},1fr)">${cards}</section>`}
${tables.join("\n")}
<footer><span>Generated ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}</span><span>Digital Transparency Board — LSC · DSSC Santa Cruz</span></footer>
</body></html>`;
}

let logos: Promise<string[]> | null = null;

/** Both official logos as data URIs, fetched once per session. */
function loadLogos(): Promise<string[]> {
  logos ??= Promise.all(
    ["/lsc-logo.jpg", "/DSSC-logo.png"].map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load report logo ${url}`);
      return blobToDataUri(await response.blob());
    }),
  ).catch((error: unknown) => {
    logos = null; // retry on the next download
    throw error;
  });
  return logos;
}

/** Builds the report and downloads it as a self-contained `.html` file. */
export async function downloadReport(fileName: string, report: PrintableReport): Promise<void> {
  const html = renderReport(report, await loadLogos());
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), fileName);
}
