import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DataColumn<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Classes for the body cells. */
  className?: string;
  /** Right-aligns header and cells (amounts, actions). */
  right?: boolean;
}

interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  className?: string;
}

/** A `data-table` in its own scroll area (pinned header), one row per item. */
export default function DataTable<T>({ columns, rows, rowKey, className }: DataTableProps<T>) {
  return (
    <div data-lenis-prevent className="table-scroll">
      <table className={cn("data-table", className)}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={c.right ? "text-right" : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c, i) => (
                <td key={i} className={cn(c.className, c.right && "text-right")}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
