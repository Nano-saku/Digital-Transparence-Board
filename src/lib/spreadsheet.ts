/**
 * Shared CSV / Excel (spreadsheet) import helpers.
 *
 * These were previously declared inside section components (e.g.
 * StudentManagementSection); import them from here so CSV/Excel parsing
 * stays in one place across the app.
 */

import type { Row } from 'read-excel-file/browser';

/** Lowercases a header and strips non-alphanumerics so "Student ID" -> "studentid". */
function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * De-duplicates a list of (already-normalized) headers by suffixing repeats
 * "_2", "_3", ... — the first occurrence keeps its plain name. Without this,
 * a sheet with repeated column groups (e.g. "Event / Required Amount /
 * Amount Paid" listed once per event, side by side, as in the official
 * "Student Body" contribution tracking sheet) would silently lose every
 * occurrence but the last when the row is built into a header-keyed object,
 * since later columns would overwrite earlier ones under the same key.
 */
function dedupeHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((header) => {
    const count = (counts.get(header) ?? 0) + 1;
    counts.set(header, count);
    return count === 1 ? header : `${header}_${count}`;
  });
}

/**
 * Parses CSV text (supports double-quoted fields, commas and escaped quotes)
 * into an array of header-keyed row objects. Repeated headers are kept (see
 * {@link dedupeHeaders}) rather than overwritten, so {@link expandEventGroups}
 * can read them back out.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headerValues = parseLine(lines[0]);
  if (headerValues.every((value) => value.trim() === "")) return [];

  const headers = dedupeHeaders(headerValues.map(normalizeHeader));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.every((value) => value.trim() === "")) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Converts an Excel cell matrix into header-keyed records (same shape as
 * parseCsv, including the repeated-header handling described there).
 */
export function excelRowsToRecords(cells: Row[]): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  if (cells.length === 0) return rows;

  // The reader returns the complete worksheet matrix, including rows between
  // the header and the final populated row. Do not use a fixed row count or
  // stop at the first blank cell: an empty Amount Paid cell is valid input and
  // must not hide later event/payment columns or later student rows.
  const headerRow = cells[0];
  if (!headerRow || headerRow.every((cell) => cell === null || String(cell).trim() === "")) {
    return rows;
  }

  const headers = dedupeHeaders(
    headerRow.map((cell) => normalizeHeader(String(cell ?? ""))),
  );
  for (let i = 1; i < cells.length; i++) {
    const rowValues = cells[i];
    if (!rowValues || rowValues.every((cell) => cell === null || String(cell).trim() === "")) {
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      const cell = rowValues[index];
      row[header] = cell === null || cell === undefined ? "" : String(cell).trim();
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Returns the first non-empty value for the given normalized header aliases,
 * e.g. `pickField(row, 'studentid', 'lrn', 'id')`. Empty string when nothing
 * matches.
 */
export function pickField(row: Record<string, string>, ...aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[alias];
    if (value && value.trim() !== '') return value.trim();
  }
  return '';
}

/**
 * Parses a user-entered money value like "₱1,500.00", "1,500" or "1500" into
 * a non-negative number. Returns null for empty/invalid input so callers can
 * distinguish an empty spreadsheet cell from a real zero amount.
 */
export function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/[₱$,\s]/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;

  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

/**
 * Parses a spreadsheet "Amount Paid" cell. Accepts peso signs ("₱", "PHP",
 * "Php", "P"), thousands separators and decimals ("₱1,500.50"). Returns null
 * for blank, non-numeric, zero, or negative values — i.e. "no payment".
 */
export function parsePositiveAmount(value: string): number | null {
  const withoutCurrency = value.trim().replace(/^(?:php|p)(?=\s*[\d.,])/i, "");
  const amount = parseAmount(withoutCurrency);
  if (amount === null || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

/**
 * Tokenizes a person's name for matching: lowercase, punctuation removed
 * (so "Samborayan, Sitti Aisah R." and "Sitti Aisah R Samborayan" produce the
 * same tokens), whitespace collapsed.
 */
function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Exact (case/punctuation/whitespace-insensitive) name key. */
export function exactNameKey(value: string): string {
  return nameTokens(value).join(" ");
}

/**
 * Loose name key that ignores middle initials and word order, so
 * "Norkesa Samborayan", "Norkesa A. Samborayan" and "Samborayan, Norkesa A."
 * all match. Callers must treat keys shared by several students as ambiguous.
 */
export function looseNameKey(value: string): string {
  return nameTokens(value)
    .filter((token) => token.length > 1)
    .sort()
    .join(" ");
}

/**
 * Strips stray internal whitespace from an ID, e.g. "2026- 00040" ->
 * "2026-00040". Real-world exports of hand-maintained sheets frequently have
 * an accidental space typed next to the dash; this keeps those rows matching
 * the clean Student ID stored in the system instead of being skipped as
 * unmatched.
 */
export function normalizeStudentId(value: string): string {
  return value.replace(/\s+/g, '');
}

/** One (Event, Required Amount, Amount Paid) group read off an import row. */
export interface EventAmountGroup {
  eventName: string;
  requiredAmount: string;
  amountPaid: string;
}

const EVENT_NAME_ALIASES = ['event', 'eventname', 'activity', 'contributionfor'];
const REQUIRED_AMOUNT_ALIASES = [
  'requiredamount',
  'required',
  'amount',
  'fee',
  'contribution',
  'contributionamount',
];
const PAID_AMOUNT_ALIASES = [
  'amountpaid',
  'paid',
  'paidamount',
  'amountcollected',
  'collected',
  'collection',
  'payment',
  'paymentamount',
];

/**
 * Reads however many (Event, Required Amount, Amount Paid) column groups a
 * row actually has.
 *
 * Most contribution sheets are "narrow": one row per student per event. The
 * official DSSC "Student Body" tracking sheet is "wide" instead — one row
 * per student, with every event's Event / Required Amount / Amount Paid
 * columns repeated side by side. `parseCsv` / `excelRowsToRecords` keep every
 * occurrence of a repeated header by suffixing it "_2", "_3", ... (see
 * `dedupeHeaders`), so this walks the row's columns in order and starts a new
 * group at every Event column, reading the Required Amount / Amount Paid
 * columns that follow it. A narrow-format row (a single trio) naturally comes
 * back as a single-item array, so both shapes are handled by the same call
 * site. Groups whose Event cell is blank are omitted; Amount Paid is returned
 * raw (possibly "") so the caller decides what counts as paid.
 */
export function expandEventGroups(row: Record<string, string>): EventAmountGroup[] {
  // Walk the columns in their original left-to-right order (records are
  // built header-by-header, and non-numeric string keys keep insertion
  // order). Every "Event" column starts a new group; the first Required
  // Amount / Amount Paid column after it (and before the next Event column)
  // belongs to that group. This handles any number of groups — no fixed cap,
  // no early stop at a blank cell — and also mixed header spellings such as
  // "Event" in one group and "Activity" in another.
  const baseName = (key: string) => key.replace(/_\d+$/, '');
  const groups: EventAmountGroup[] = [];
  let current: EventAmountGroup | null = null;
  let hasRequired = false;
  let hasPaid = false;

  const flush = () => {
    // A group whose Event cell is blank for this row cannot be matched.
    if (current && current.eventName) groups.push(current);
  };

  for (const [key, rawValue] of Object.entries(row)) {
    const base = baseName(key);
    const value = (rawValue ?? '').trim();

    if (EVENT_NAME_ALIASES.includes(base)) {
      flush();
      current = { eventName: value, requiredAmount: '', amountPaid: '' };
      hasRequired = false;
      hasPaid = false;
    } else if (current && !hasPaid && PAID_AMOUNT_ALIASES.includes(base)) {
      current.amountPaid = value;
      hasPaid = true;
    } else if (current && !hasRequired && REQUIRED_AMOUNT_ALIASES.includes(base)) {
      current.requiredAmount = value;
      hasRequired = true;
    }
  }
  flush();
  return groups;
}