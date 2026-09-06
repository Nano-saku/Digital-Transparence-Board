import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { readSheet } from "read-excel-file/browser";
import { parseCsv, excelRowsToRecords } from "@/lib/spreadsheet";

/**
 * Shared CSV / Excel import shell used by the management sections.
 *
 * This hook extracts the duplicated file-reading flow that previously lived in
 * both StudentManagementSection and ContributionManagementSection:
 *   - grab the selected file and reset the input value so the same file can be
 *     re-selected,
 *   - validate the extension (.csv / .xlsx),
 *   - parse the file into header-keyed row objects (CSV or Excel),
 *   - delegate those rows to the section's own `onRows` importer,
 *   - manage the `importing` spinner state and surface any parse/read error.
 *
 * It intentionally does NOT contain any row-mapping, deduping, persistence, or
 * success/`skipped` accounting logic — each section keeps its own importer so
 * the two (genuinely different) data shapes and rules stay intact. Only the
 * identical file-read shell is shared here.
 */
export function useSpreadsheetImport(options: {
  /** Per-section importer that maps, dedupes, persists, and reports its own results. */
  onRows: (rows: Record<string, string>[]) => Promise<void>;
}): {
  importing: boolean;
  handleFileSelected: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  importInputRef: React.RefObject<HTMLInputElement | null>;
} {
  const { onRows } = options;
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const isExcel = file.name.toLowerCase().endsWith(".xlsx");
    if (!isCsv && !isExcel) {
      toast.error("Please upload a .csv or .xlsx file");
      return;
    }

    try {
      setImporting(true);
      const rows = isCsv
        ? parseCsv(await file.text())
        : excelRowsToRecords(await readSheet(file));
      await onRows(rows);
    } catch (error) {
      console.error(`Error importing ${isCsv ? "CSV" : "Excel"} file:`, error);
      toast.error(`Failed to import ${isCsv ? "CSV" : "Excel"} file`);
    } finally {
      setImporting(false);
    }
  };

  return { importing, handleFileSelected, importInputRef };
}
