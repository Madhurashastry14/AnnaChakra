import { LoadingSkeleton } from "./States.jsx";

export default function DataTable({ columns, rows, rowKey, empty, loading = false, caption, className = "" }) {
  if (loading) return <LoadingSkeleton variant="table" rows={5} />;
  if (!rows || rows.length === 0) return empty ?? null;

  return (
    <div className={`k-table-wrap ${className}`}>
      <table className="k-table">
        {caption ? <caption className="k-sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.className}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey ? rowKey(row) : row.id ?? index}>
              {columns.map((column) => (
                <td key={column.key} data-label={column.label} className={column.className}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
