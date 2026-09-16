import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalizes a full name for order-agnostic comparison: lowercases, strips
 * commas/periods (so "Dela Cruz, Juan" and "Dela Cruz Juan" normalize the
 * same), splits into words, and sorts them.
 *
 * Sorting the words (rather than just swapping the first/last token) is
 * what lets this handle compound surnames like "Dela Cruz" correctly -
 * "Juan Dela Cruz", "Dela Cruz Juan", and "Cruz Dela Juan" all normalize
 * to the same string.
 */
export function normalizeNameForMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * True if two names refer to the same person regardless of word order
 * (e.g. "Juan Dela Cruz" vs "Dela Cruz Juan"). Use this instead of a plain
 * string comparison anywhere a student types their own name to verify
 * against a stored record.
 */
export function namesMatch(a: string, b: string): boolean {
  return normalizeNameForMatch(a) === normalizeNameForMatch(b);
}

/**
 * Canonical storage/display format for a student name: Title Case with
 * single-spaced words, word order preserved exactly as typed.
 *
 * "Word" here means a maximal run of letters/digits - the same rule
 * Postgres's initcap() uses - so hyphenated and multi-word surnames come
 * out right without a list of exceptions: "dela cruz" -> "Dela Cruz",
 * "santos-reyes" -> "Santos-Reyes", "o'brien" -> "O'Brien".
 *
 * This never reorders words. Guessing which word(s) are the surname to
 * reformat as "Last, First" isn't reliable from a single free-text name
 * field - compound Filipino surnames (Dela Cruz, De Guzman, Del Rosario)
 * make that guess wrong too often to risk on real student records. Order
 * doesn't affect verification anyway; see namesMatch above.
 *
 * Keep this in sync with the SQL backfill in
 * supabase/migrations/2026-09-16_normalize_student_names.sql, which uses
 * initcap() to apply the same rule to existing rows.
 */
export function normalizeStudentName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(
      /[a-z0-9]+/gi,
      (word) => word.charAt(0).toUpperCase() + word.slice(1),
    );
}

/**
 * Splits a search query into lowercase words, ignoring extra whitespace.
 * Shared by every "type to filter" search so a multi-word query matches
 * regardless of word order - see matchesSearchWords below.
 */
export function splitSearchWords(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * True if every word in `query` appears *somewhere* in `haystack`, in any
 * order - so typing "Cruz Juan" still matches "Juan Dela Cruz". Words can
 * be partial ("ju" matches "Juan"), which is what makes this fit a live
 * typeahead filter as someone is still typing.
 *
 * This is deliberately different from namesMatch above: namesMatch checks
 * two full names are the *same person* (exact, used for record
 * verification); this checks a partial, in-progress query against a list
 * to filter/suggest (used for search-as-you-type).
 */
export function matchesSearchWords(haystack: string, query: string): boolean {
  const words = splitSearchWords(query);
  if (words.length === 0) return true;
  const target = haystack.toLowerCase();
  return words.every((word) => target.includes(word));
}

/**
 * Escapes Postgres ILIKE wildcard characters (% _ \) so a search word is
 * matched literally rather than as a pattern. Use this on any user-typed
 * text before interpolating it into an .ilike() pattern.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
