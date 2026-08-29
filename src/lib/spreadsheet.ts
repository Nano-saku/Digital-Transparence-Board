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
 * Parses CSV text (supports double-quoted fields, commas and escaped quotes)
 * into an array of header-keyed row objects.
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

  const headers = parseLine(lines[0]).map(normalizeHeader);
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

/** Converts an Excel cell matrix into header-keyed records (same shape as parseCsv). */
export function excelRowsToRecords(cells: Row[]): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  if (cells.length < 2) return rows;

  const headers = cells[0].map(cell => normalizeHeader(String(cell ?? '')));
  for (let i = 1; i < cells.length; i++) {
    const rowValues = cells[i];
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      const cell = rowValues[index];
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
