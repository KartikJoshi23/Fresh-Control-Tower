/**
 * TableView: the accessible table behind every chart (plan §6.5: a table-view toggle on every chart).
 * Tabular numerals; headers scoped for screen readers.
 */
export interface Column<Row> {
  key: string;
  label: string;
  value: (row: Row) => string | number | null;
  numeric?: boolean;
}

interface TableViewProps<Row> {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  /** Cap on rendered rows (long daily series); the caption states the cap. */
  maxRows?: number;
}

export function formatCell(value: string | number | null): string {
  if (value === null) return "—";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return value;
}

export function TableView<Row>({ caption, columns, rows, maxRows = 400 }: TableViewProps<Row>) {
  const shown = rows.slice(0, maxRows);
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={`${caption} (table)`}>
      <table className="data-table">
        <caption className="sr-only">
          {caption}
          {rows.length > maxRows ? ` (first ${maxRows} of ${rows.length} rows)` : ""}
        </caption>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={c.numeric ? "num" : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => <td key={c.key} className={c.numeric ? "num" : undefined}>{formatCell(c.value(row))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
