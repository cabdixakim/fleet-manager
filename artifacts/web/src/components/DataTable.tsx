import { cn } from "@/lib/utils";

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  loading?: boolean;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  emptyMessage = "No data",
  loading = false,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider",
                  col.className
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-12 text-muted-foreground text-sm">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={i}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "border-b border-border/50 last:border-0 transition-colors",
                  onRowClick && "cursor-pointer hover:bg-secondary/40"
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-4 py-3 text-foreground", col.className)}>
                    {col.render ? col.render(row) : String(row[col.key] ?? "-")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
