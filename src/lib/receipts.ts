// Receipt upload, SVG generation and export (no third-party dependencies).
// Transaction ledger receipts are uploaded scans; payment/contribution
// receipts are generated as SVG.

import { getSupabase } from "./supabase";

export type ReceiptFormat = "svg" | "png" | "jpg";

const MAX_UPLOADED_RECEIPT_BYTES = 10 * 1024 * 1024;

/** Uploads a scanned receipt (PDF/image) to the receipts bucket; returns its public URL. */
export async function uploadReceiptFile(file: File): Promise<string> {
  if (file.type !== "application/pdf" && !file.type.toLowerCase().startsWith("image/")) {
    throw new Error("Receipt must be a PDF or an image file.");
  }
  if (file.size > MAX_UPLOADED_RECEIPT_BYTES) {
    throw new Error("Receipt files must be 10 MB or smaller.");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return uploadToBucket(`manual/${crypto.randomUUID()}-${safeName || "receipt"}`, file, file.type);
}

async function uploadToBucket(path: string, body: Blob, contentType: string, upsert = false): Promise<string> {
  const bucket = getSupabase().storage.from("receipts");
  const { error } = await bucket.upload(path, body, { upsert, contentType });
  if (error) throw new Error(error.message);
  return bucket.getPublicUrl(path).data.publicUrl;
}

/** Blob -> base64 data URI (also used for self-contained printable reports). */
export function blobToDataUri(blob: Blob, errorMessage = "Failed to read blob"): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(errorMessage));
    reader.readAsDataURL(blob);
  });
}

async function loadImage(src: string, errorMessage: string): Promise<HTMLImageElement> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(errorMessage));
    image.src = src;
  });
  return image;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, errorMessage: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(errorMessage))), type, quality);
  });
}

function canvasContext(canvas: HTMLCanvasElement, errorMessage: string): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(errorMessage);
  return ctx;
}

/** Base64 data URIs for the two official logos embedded in every receipt. */
export interface ReceiptLogoData {
  lsc: string;
  dssc: string;
}

let logoCache: ReceiptLogoData | null = null;

/** Fetches a public image, fits it within `maxDim` px and returns a PNG data URI. */
async function imageToDataUri(path: string, maxDim: number): Promise<string> {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`Failed to fetch logo ${path}: ${resp.status}`);
  const objectUrl = URL.createObjectURL(await resp.blob());
  try {
    const img = await loadImage(objectUrl, `Failed to decode logo: ${path}`);
    const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvasContext(canvas, "Canvas not supported").drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await canvasToBlob(canvas, "image/png", `Failed to encode logo: ${path}`);
    return await blobToDataUri(png, `Failed to read encoded logo: ${path}`);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Cached logo data URIs (≤100px keeps the SVG receipts light). */
export async function getReceiptLogos(): Promise<ReceiptLogoData> {
  if (logoCache) return logoCache;
  const [lsc, dssc] = await Promise.all([
    imageToDataUri("/lsc-logo.jpg", 100),
    imageToDataUri("/DSSC-logo.png", 100),
  ]);
  logoCache = { lsc, dssc };
  return logoCache;
}

/** Logo markup; `xlink:href` keeps the images visible in older SVG viewers. */
function receiptLogoMarkup(logos: ReceiptLogoData): string {
  return [
    `<image href="${logos.lsc}" xlink:href="${logos.lsc}" x="10" y="10" width="70" height="70" preserveAspectRatio="xMidYMid meet"/>`,
    `<image href="${logos.dssc}" xlink:href="${logos.dssc}" x="520" y="10" width="70" height="70" preserveAspectRatio="xMidYMid meet"/>`,
  ].join("\n  ");
}

export interface ReceiptDetails {
  /** Small caption shown under the big title, e.g. "PAYMENT" / "EXPENSE". */
  tag?: string;
  /** Official Receipt number, e.g. "OR-2026-000001". */
  receiptNumber: string;
  /** Who the receipt is for (student name or supplier). */
  issuedTo: string;
  eventName?: string;
  description?: string;
  amount: number;
  type: "income" | "expense";
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Officer that issued the receipt. */
  recordedBy: string;
  fiscalYear?: string;
  /** Contribution-record receipts only: required contribution amount. */
  requiredAmount?: number;
  /** Contribution-record receipts only: outstanding balance (required - paid). */
  remainingBalance?: number;
  /** Contribution-record receipts only: status label (Unpaid / Partial / Fully Paid). */
  statusLabel?: string;
  /** Contribution receipts only: installment payments; when present a payment history table replaces the amount rows. */
  paymentItems?: Array<{ amount: number; date: string; status: string }>;
}

const xml = (s: string): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatAmount = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const peso = (n: number) => `₱${formatAmount(n)}`;

const formatDateHuman = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function threeDigits(n: number): string {
  const words: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) words.push(`${ONES[hundreds]} Hundred`);
  if (rest > 0) {
    if (rest < 20) words.push(ONES[rest]);
    else words.push(`${TENS[Math.floor(rest / 10)]}${rest % 10 ? "-" + ONES[rest % 10] : ""}`);
  }
  return words.join(" ");
}

/** e.g. `1500.5 -> "One Thousand, Five Hundred Pesos and 50/100 only"`. */
export function amountInWords(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  const scales = ["", " Thousand", " Million", " Billion", " Trillion"];
  const chunks: string[] = [];
  for (let n = whole, scale = 0; n > 0; n = Math.floor(n / 1000), scale++) {
    const chunk = n % 1000;
    if (chunk > 0) chunks.unshift(`${threeDigits(chunk)}${scales[scale]}`);
  }
  const wholeText = chunks.length ? chunks.join(", ") : "Zero";
  const centsText = cents > 0 ? ` and ${String(cents).padStart(2, "0")}/100` : "";
  return `${wholeText} Pesos${centsText} only`;
}

const SANS = "Arial, Helvetica, sans-serif";
const ROWS_START = 352; // y of the first detail label
const ROW_PITCH = 64; // vertical space per label/value pair
const HIST_ROW_H = 28;
const [GREEN, AMBER, RED, INK] = ["#16a34a", "#d97706", "#dc2626", "#111827"];

type DetailRow = [label: string, value: string, color?: string];

const detailRowsSvg = (rows: DetailRow[], startY: number): string =>
  rows
    .map(([label, value, color = INK], index) => {
      const ry = startY + index * ROW_PITCH;
      return `<text x="60" y="${ry}" font-family="${SANS}" font-size="12" letter-spacing="1" fill="#6b7280">${label}</text>\n    <text x="60" y="${ry + 26}" font-family="${SANS}" font-size="17" font-weight="bold" fill="${color}">${value}</text>`;
    })
    .join("\n    ");

/** "PAYMENT HISTORY" caption, column header band and one striped row per installment. */
function historyTableSvg(items: NonNullable<ReceiptDetails["paymentItems"]>, captionY: number, headerY: number): string {
  const [num, amount, date, status] = [60, 130, 300, 440];
  const head = (x: number, label: string) =>
    `<text x="${x}" y="${headerY}" font-family="${SANS}" font-size="11" font-weight="bold" fill="#374151">${label}</text>`;
  return [
    `<text x="${num}" y="${captionY}" font-family="${SANS}" font-size="12" letter-spacing="1" fill="#6b7280">PAYMENT HISTORY</text>`,
    `<rect x="52" y="${headerY - 14}" width="496" height="20" rx="3" fill="#e2e8f0"/>`,
    head(num, "#"),
    head(amount, "AMOUNT"),
    head(date, "DATE"),
    head(status, "STATUS"),
    ...items.flatMap((item, i) => {
      const ry = headerY + (i + 1) * HIST_ROW_H;
      return [
        `<rect x="52" y="${ry - 16}" width="496" height="${HIST_ROW_H}" fill="${i % 2 === 0 ? "#f8fafc" : "#ffffff"}"/>`,
        `<text x="${num}" y="${ry}" font-family="monospace" font-size="12" fill="#374151">${i + 1}</text>`,
        `<text x="${amount}" y="${ry}" font-family="monospace" font-size="12" fill="${INK}">${peso(item.amount)}</text>`,
        `<text x="${date}" y="${ry}" font-family="${SANS}" font-size="12" fill="#374151">${xml(formatDateHuman(item.date))}</text>`,
        `<text x="${status}" y="${ry}" font-family="${SANS}" font-size="12" font-weight="bold" fill="${item.status === "Fully Paid" ? GREEN : AMBER}">${xml(item.status)}</text>`,
      ];
    }),
  ].join("\n    ");
}

export function buildReceiptSvg(details: ReceiptDetails, logos?: ReceiptLogoData): string {
  const typeColor = details.type === "income" ? "#0f766e" : "#b91c1c";
  const tag = details.tag ? xml(details.tag) : details.type === "income" ? "COLLECTION" : "EXPENSE";
  const isContribution = details.requiredAmount !== undefined;
  const history = isContribution ? (details.paymentItems ?? []) : [];

  const headerRows: DetailRow[] = [
    ["RECEIVED FROM / PAID TO", xml(details.issuedTo) || "—"],
    ["EVENT / PURPOSE", xml(details.eventName || details.description || "—")],
    ...(details.description && details.eventName ? [["DETAILS", xml(details.description)] as DetailRow] : []),
  ];

  // The layout grows with the rows so the total and footer stay inside the box
  // (and the PNG/JPG export adapts automatically).
  let rowsSvg: string;
  let lineY: number; // separator above the total
  if (history.length > 0) {
    const remaining = details.remainingBalance ?? 0;
    const summaryY = ROWS_START + headerRows.length * ROW_PITCH + 16;
    const summaryRows: DetailRow[] = [
      ["REQUIRED AMOUNT", peso(details.requiredAmount ?? 0)],
      ["TOTAL AMOUNT PAID", peso(details.amount)],
      ["REMAINING BALANCE", peso(remaining), remaining > 0 ? RED : GREEN],
      ["OVERALL STATUS", xml(details.statusLabel || "—"), details.statusLabel === "Fully Paid" ? GREEN : AMBER],
    ];
    const captionY = summaryY + summaryRows.length * ROW_PITCH + 20;
    const tableHeaderY = captionY + 22;
    rowsSvg = [
      detailRowsSvg(headerRows, ROWS_START),
      detailRowsSvg(summaryRows, summaryY),
      historyTableSvg(history, captionY, tableHeaderY),
    ].join("\n    ");
    lineY = tableHeaderY + (history.length + 1) * HIST_ROW_H + 8;
  } else {
    const rows: DetailRow[] = [
      ...headerRows,
      ...(isContribution
        ? ([
            ["REQUIRED AMOUNT", peso(details.requiredAmount ?? 0)],
            ["AMOUNT PAID", peso(details.amount)],
            ["REMAINING BALANCE", peso(details.remainingBalance ?? 0)],
            ["STATUS", xml(details.statusLabel || "—")],
          ] as DetailRow[])
        : []),
    ];
    rowsSvg = detailRowsSvg(rows, ROWS_START);
    lineY = ROWS_START + rows.length * ROW_PITCH - 12;
  }

  const totalLabel = history.length > 0 ? "TOTAL AMOUNT PAID" : isContribution ? "AMOUNT PAID" : "TOTAL AMOUNT";
  const boxBottom = lineY + 148;
  const footerLine = boxBottom + 26;
  const thankYouTop = footerLine + 70;
  const height = thankYouTop + 92;
  const words = xml(amountInWords(details.amount));
  const wordsShort = words.length > 86 ? words.slice(0, 83) + "..." : words;
  const recordedBy = xml(details.recordedBy || "Council Officer");

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="600" height="${height}" viewBox="0 0 600 ${height}">
  <rect width="600" height="${height}" fill="#ffffff"/>
  <rect width="600" height="96" fill="${typeColor}"/>
  <text x="300" y="46" font-family="${SANS}" font-size="24" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="2">OFFICIAL RECEIPT</text>
  <text x="300" y="76" font-family="${SANS}" font-size="13" fill="#ffe4ea" text-anchor="middle" letter-spacing="1">LOCAL STUDENT COUNCIL — DIGITAL TRANSPARENCY</text>
  ${logos ? receiptLogoMarkup(logos) : ""}
  <text x="40" y="132" font-family="${SANS}" font-size="14" fill="#1f2937">Local Student Council — Digital Transparency Board</text>
  <text x="40" y="156" font-family="${SANS}" font-size="13" fill="#6b7280">${xml(details.fiscalYear || dynamicSchoolYear())}</text>
  <line x1="40" y1="176" x2="560" y2="176" stroke="#e5e7eb" stroke-width="2"/>
  <text x="40" y="212" font-family="monospace" font-size="13" fill="#374151">${xml(details.receiptNumber)}</text>
  <text x="40" y="236" font-family="monospace" font-size="13" fill="#374151">${history.length > 0 ? "Issued" : "Date"}: ${xml(formatDateHuman(details.date))}</text>
  <text x="40" y="262" font-family="${SANS}" font-size="11" font-weight="bold" fill="${typeColor}" letter-spacing="2">${tag}</text>
  <rect x="40" y="272" width="520" height="${boxBottom - 272 + 18}" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>
    ${rowsSvg}
  <line x1="60" y1="${lineY}" x2="540" y2="${lineY}" stroke="#e5e7eb" stroke-width="1"/>
  <text x="60" y="${lineY + 40}" font-family="${SANS}" font-size="14" fill="#374151">${totalLabel}</text>
  <text x="540" y="${lineY + 46}" font-family="monospace" font-size="26" font-weight="bold" fill="${typeColor}" text-anchor="end">PHP ${xml(formatAmount(details.amount))}</text>
  <text x="60" y="${lineY + 88}" font-family="monospace" font-size="11" fill="#6b7280">${wordsShort}</text>
  <text x="60" y="${lineY + 114}" font-family="monospace" font-size="11" fill="#9ca3af">PREPARED BY: ${recordedBy}</text>
  <line x1="40" y1="${footerLine}" x2="560" y2="${footerLine}" stroke="#e5e7eb" stroke-width="2"/>
  <text x="40" y="${footerLine + 36}" font-family="${SANS}" font-size="12" fill="#6b7280">Authorized signature: ________________________</text>
  <text x="40" y="${footerLine + 56}" font-family="${SANS}" font-size="12" fill="#6b7280">Recorded by: ${recordedBy}</text>
  <rect x="40" y="${thankYouTop}" width="520" height="56" rx="6" fill="${typeColor}"/>
  <text x="300" y="${thankYouTop + 35}" font-family="${SANS}" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="3">THANK YOU FOR YOUR SUPPORT!</text>
</svg>`;
}

/** Rasterizes an SVG receipt to PNG or JPG (white background, 2x for crispness). */
async function svgToImageBlob(svg: string, format: "png" | "jpg", scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = await loadImage(url, "Unable to render the receipt image.");
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * scale;
    canvas.height = image.naturalHeight * scale;
    const ctx = canvasContext(canvas, "Canvas is not supported in this browser.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    // The quality argument only applies to JPEG.
    return await canvasToBlob(canvas, `image/${format === "png" ? "png" : "jpeg"}`, `${format.toUpperCase()} export failed.`, 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Triggers a browser download for a blob. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export const isSvgUrl = (url: string): boolean => {
  const normalizedUrl = url.split("?")[0].toLowerCase();
  return normalizedUrl.endsWith(".svg") || normalizedUrl.startsWith("data:image/svg+xml");
};

/** Adds the logos to old SVG receipts generated before logos were embedded. */
async function ensureReceiptLogos(svg: string): Promise<string> {
  if (/<image\b/i.test(svg)) return svg;
  const logoMarkup = receiptLogoMarkup(await getReceiptLogos());
  return svg.replace(/(<rect[^>]*width=["']600["'][^>]*height=["']96["'][^>]*\/?>)/i, `$1\n  ${logoMarkup}`);
}

/** Offline-only fallback for the OR sequence (the RPC is authoritative). */
let orFallbackSequence = 0;

/** e.g. "School Year 2026 – 2027"; used when no fiscal year is supplied. */
function dynamicSchoolYear(): string {
  const year = new Date().getFullYear();
  return `School Year ${year} – ${year + 1}`;
}

/**
 * Next Official Receipt number (OR-YYYY-NNNNNN), allocated atomically by the
 * `get_next_or_number()` RPC; falls back to a local counter when offline.
 */
export async function officialReceiptNumber(): Promise<string> {
  try {
    const { data, error } = await getSupabase().rpc("get_next_or_number");
    if (!error && typeof data === "string" && data.length > 0) return data;
    if (error) console.warn("get_next_or_number RPC failed:", error.message);
  } catch (err) {
    console.warn("get_next_or_number RPC error:", err);
  }
  orFallbackSequence += 1;
  return `OR-${new Date().getFullYear()}-${String(orFallbackSequence).padStart(6, "0")}`;
}

/**
 * Generates an SVG receipt, uploads it to the "receipts" bucket and returns its
 * public URL. An OR-numbered receipt is stored at a path derived from the number
 * and overwritten on later payments, so each contribution keeps one current receipt.
 */
export async function autoCreateReceipt(details: ReceiptDetails): Promise<string> {
  const svg = buildReceiptSvg(details, await getReceiptLogos());
  const slug = /^OR-\d{4}-\d{6}$/.test(details.receiptNumber) ? details.receiptNumber.toLowerCase() : crypto.randomUUID();
  return uploadToBucket(`auto/${slug}.svg`, new Blob([svg], { type: "image/svg+xml" }), "image/svg+xml", true);
}

/** Downloads a receipt URL; SVG receipts can be converted to PNG/JPG, other files download as-is. */
export async function downloadReceipt(url: string, format: ReceiptFormat): Promise<string> {
  const baseName = (url.split("/").pop()?.split("?")[0] || "receipt").replace(/\.[^.]+$/, "");
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  if (!isSvgUrl(url)) {
    downloadBlob(await response.blob(), `${baseName}.${url.split(".").pop()?.split("?")[0] || "png"}`);
    return "Receipt downloaded";
  }
  const svg = await ensureReceiptLogos(await response.text());
  if (format === "svg") {
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${baseName}.svg`);
    return "Receipt downloaded";
  }
  downloadBlob(await svgToImageBlob(svg, format), `${baseName}.${format}`);
  return `Receipt downloaded as ${format.toUpperCase()}`;
}

/** Builds a contribution receipt locally (no upload); only for records with a payment. */
async function buildContributionReceipt(details: ReceiptDetails): Promise<string> {
  if (details.amount <= 0) {
    throw new Error("Receipt is only available when the paid amount is greater than zero.");
  }
  return buildReceiptSvg(details, await getReceiptLogos());
}

/** Downloads a contribution-record receipt (works offline). Returns a toast message. */
export async function downloadContributionReceipt(
  details: ReceiptDetails,
  format: ReceiptFormat = "svg",
): Promise<string> {
  const svg = await buildContributionReceipt(details);
  const blob = format === "svg" ? new Blob([svg], { type: "image/svg+xml" }) : await svgToImageBlob(svg, format);
  downloadBlob(blob, `contribution-receipt-${details.receiptNumber}.${format}`);
  return `Contribution receipt downloaded (${format.toUpperCase()})`;
}

/** In-memory data URL for previewing a contribution-record receipt. */
export async function createContributionReceiptPreview(details: ReceiptDetails): Promise<string> {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await buildContributionReceipt(details))}`;
}
