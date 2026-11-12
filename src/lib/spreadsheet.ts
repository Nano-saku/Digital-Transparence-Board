// CSV / Excel import helpers shared by the management sections.
import type { Row } from "read-excel-file/browser";

/** "Student ID" -> "studentid". */
const normalizeHeader = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

const cellText = (cell: unknown) => String(cell ?? "").trim();
const isBlankRow = (values?: readonly unknown[]) => !values || values.every((cell) => cellText(cell) === "");

/**
 * Turns a cell matrix (first row = headers) into header-keyed records, skipping
 * wholly blank rows only (an empty Amount Paid cell is valid input). Repeated
 * headers become "x", "x_2", "x_3"… instead of overwriting each other, so wide
 * sheets with one column group per event survive (see `expandEventGroups`).
 */
function toRecords(cells: readonly (readonly unknown[])[]): Record<string, string>[] {
  const [headerRow, ...rows] = cells;
  if (isBlankRow(headerRow)) return [];
  const counts = new Map<string, number>();
  const headers = headerRow.map((cell) => {
    const header = normalizeHeader(String(cell ?? ""));
    const count = (counts.get(header) ?? 0) + 1;
    counts.set(header, count);
    return count === 1 ? header : `${header}_${count}`;
  });
  return rows
    .filter((values) => !isBlankRow(values))
    .map((values) => Object.fromEntries(headers.map((header, i) => [header, cellText(values[i])])));
}

/** Splits one CSV line, honouring double quotes and escaped `""`. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') cur += line[i++];
      else inQuotes = false;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Header-keyed rows from CSV text; the first line is the header row. */
export function parseCsv(text: string): Record<string, string>[] {
  return toRecords(text.split(/\r?\n/).map(parseCsvLine));
}

/** Header-keyed rows from an Excel worksheet matrix (same shape as `parseCsv`). */
export function excelRowsToRecords(cells: Row[]): Record<string, string>[] {
  return toRecords(cells);
}

/** First non-empty value among the given normalized header aliases, else "". */
export function pickField(row: Record<string, string>, ...aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[alias]?.trim();
    if (value) return value;
  }
  return "";
}

/**
 * "₱1,500.00" / "1,500" / "1500" -> 1500. `null` for empty or invalid input so
 * callers can tell an empty cell from a real zero.
 */
export function parseAmount(value: string): number | null {
  const cleaned = value.trim().replace(/[₱$,\s]/g, "");
  const amount = Number(cleaned);
  return /^-?\d+(?:\.\d+)?$/.test(cleaned) && Number.isFinite(amount) ? amount : null;
}

/**
 * An "Amount Paid" cell (also accepts a "PHP"/"Php"/"P" prefix), rounded to
 * centavos; `null` for blank, non-numeric, zero or negative values ("no payment").
 */
export function parsePositiveAmount(value: string): number | null {
  const amount = parseAmount(value.trim().replace(/^(?:php|p)(?=\s*[\d.,])/i, ""));
  return amount !== null && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

/** Lowercase, accent- and punctuation-free name tokens ("Samborayan, Sitti R." -> samborayan sitti r). */
function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Exact (case/punctuation/whitespace-insensitive) name key. */
export function exactNameKey(value: string): string {
  return nameTokens(value).join(" ");
}

/**
 * Name key ignoring initials and word order ("Samborayan, Norkesa A." matches
 * "Norkesa Samborayan"). Callers must treat keys shared by several students as ambiguous.
 */
export function looseNameKey(value: string): string {
  return nameTokens(value)
    .filter((token) => token.length > 1)
    .sort()
    .join(" ");
}

/** "2026- 00040" -> "2026-00040" (hand-typed sheets often have stray spaces). */
export function normalizeStudentId(value: string): string {
  return value.replace(/\s+/g, "");
}

/** One (Event, Required Amount, Amount Paid) group read off an import row. */
export interface EventAmountGroup {
  eventName: string;
  requiredAmount: string;
  amountPaid: string;
}

const EVENT_ALIASES = ["event", "eventname", "activity", "contributionfor"];
const REQUIRED_ALIASES = ["requiredamount", "required", "amount", "fee", "contribution", "contributionamount"];
const PAID_ALIASES = ["amountpaid", "paid", "paidamount", "amountcollected", "collected", "collection", "payment", "paymentamount"];

/**
 * Reads every (Event, Required Amount, Amount Paid) group in a row. Narrow sheets
 * (one row per student per event) yield one group; the wide official "Student Body"
 * sheet repeats the group per event. Columns are walked left to right (record keys
 * keep insertion order): each Event column starts a group and the first Required /
 * Paid column after it belongs to that group, so any number of groups and mixed
 * header spellings work. Groups with a blank Event cell are omitted; Amount Paid is
 * returned raw (possibly "") so the caller decides what counts as paid.
 */
export function expandEventGroups(row: Record<string, string>): EventAmountGroup[] {
  const groups: EventAmountGroup[] = [];
  let current: EventAmountGroup | null = null;
  let hasRequired = false;
  let hasPaid = false;

  for (const [key, rawValue] of Object.entries(row)) {
    const base = key.replace(/_\d+$/, "");
    const value = (rawValue ?? "").trim();
    if (EVENT_ALIASES.includes(base)) {
      current = { eventName: value, requiredAmount: "", amountPaid: "" };
      if (value) groups.push(current);
      hasRequired = hasPaid = false;
    } else if (current && !hasPaid && PAID_ALIASES.includes(base)) {
      current.amountPaid = value;
      hasPaid = true;
    } else if (current && !hasRequired && REQUIRED_ALIASES.includes(base)) {
      current.requiredAmount = value;
      hasRequired = true;
    }
  }
  return groups;
}
