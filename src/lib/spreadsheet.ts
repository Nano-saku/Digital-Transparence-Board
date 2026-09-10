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
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

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

  const headers = dedupeHeaders(parseLine(lines[0]).map(normalizeHeader));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
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
  if (cells.length < 2) return rows;

  const headers = dedupeHeaders(cells[0].map(cell => normalizeHeader(String(cell ?? ''))));
  for (let i = 1; i < cells.length; i++) {
    const rowValues = cells[i];
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      const cell = rowValues[index];
      console.log(
  `[Excel Import] ${header}:`,
  cell,
  typeof cell,
);
row[header] = cell === null || cell === undefined ? '' : String(cell).trim();
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
 * a non-negative number. Returns 0 for empty/invalid input.
 */
export function parseAmount(value: string): number {
  const cleaned = value.replace(/[^\d.]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
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
 * `dedupeHeaders`), so this walks "event", "event_2", "event_3", ... until a
 * group is missing, reading each group's amounts via the same suffix. A
 * narrow-format row (no numeric suffix at all) naturally comes back as a
 * single-item array, so both shapes are handled by the same call site.
 */
export function expandEventGroups(row: Record<string, string>): EventAmountGroup[] {
  const groups: EventAmountGroup[] = [];
  for (let occurrence = 1; occurrence <= 60; occurrence++) {
    const suffix = occurrence === 1 ? '' : `_${occurrence}`;
    const eventKeys = EVENT_NAME_ALIASES.map((alias) => `${alias}${suffix}`);
    const groupExists = eventKeys.some((key) => key in row);
    if (!groupExists) break;

    const eventName = pickField(row, ...eventKeys);
    if (!eventName) continue; // column group exists but this event slot is blank for this row

    groups.push({
      eventName,
      requiredAmount: pickField(row, ...REQUIRED_AMOUNT_ALIASES.map((alias) => `${alias}${suffix}`)),
      amountPaid: pickField(row, ...PAID_AMOUNT_ALIASES.map((alias) => `${alias}${suffix}`)),
    });
  }
  return groups;
}