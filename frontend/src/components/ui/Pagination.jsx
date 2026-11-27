import { ChevronLeft, ChevronRight } from "lucide-react";
import { classNames } from "../../utils/format.js";

export default function Pagination({ page, totalPages, onChange, totalItems, pageSize, className = "" }) {
  if (!Number.isFinite(totalPages) || totalPages <= 1) return null;

  const pages = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  for (let index = start; index <= end; index += 1) pages.push(index);

  return (
    <nav className={classNames("k-pagination", className)} aria-label="Pagination">
      <button
        type="button"
        className="k-pagination-button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </button>
      {start > 1 ? <span className="k-pagination-gap">…</span> : null}
      {pages.map((pageNumber) => (
        <button
          type="button"
          key={pageNumber}
          className={classNames("k-pagination-button", pageNumber === page && "is-active")}
          aria-current={pageNumber === page ? "page" : undefined}
          onClick={() => onChange(pageNumber)}
        >
          {pageNumber}
        </button>
      ))}
      {end < totalPages ? <span className="k-pagination-gap">…</span> : null}
      <button
        type="button"
        className="k-pagination-button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight size={16} />
      </button>
      {totalItems !== undefined && pageSize ? (
        <span className="k-pagination-summary">
          {Math.min(totalItems, (page - 1) * pageSize + 1)}–{Math.min(totalItems, page * pageSize)} of {totalItems}
        </span>
      ) : null}
    </nav>
  );
}
