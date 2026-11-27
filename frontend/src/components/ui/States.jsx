import { Inbox, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { classNames } from "../../utils/format.js";

export function LoadingSkeleton({ rows = 3, variant = "card", className = "" }) {
  if (variant === "table") {
    return (
      <div className={classNames("k-skeleton-table", className)} aria-label="Loading" role="status">
        <div className="k-skeleton k-skeleton-row k-skeleton-head" />
        {Array.from({ length: rows }).map((_, index) => (
          <div className="k-skeleton k-skeleton-row" key={index} />
        ))}
      </div>
    );
  }

  if (variant === "page") {
    return (
      <div className={classNames("k-skeleton-page", className)} aria-label="Loading" role="status">
        <div className="k-skeleton k-skeleton-title" />
        <div className="k-skeleton k-skeleton-subtitle" />
        <div className="k-metric-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="k-skeleton k-skeleton-card" key={index} />
          ))}
        </div>
        <div className="k-skeleton k-skeleton-block" />
      </div>
    );
  }

  return (
    <div className={classNames("k-skeleton-stack", className)} aria-label="Loading" role="status">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="k-skeleton k-skeleton-line" key={index} />
      ))}
    </div>
  );
}

export function InlineLoader({ label = "Loading…" }) {
  return (
    <span className="k-inline-loader">
      <Loader2 className="k-spin" size={15} aria-hidden="true" /> {label}
    </span>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className = "" }) {
  return (
    <div className={classNames("k-empty-state", className)}>
      <span className="k-empty-icon" aria-hidden="true"><Icon size={24} /></span>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="k-empty-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry, action }) {
  return (
    <div className="k-error-state" role="alert">
      <span className="k-error-icon" aria-hidden="true"><TriangleAlert size={22} /></span>
      <div>
        <h3>{title}</h3>
        {message ? <p>{message}</p> : null}
        <div className="k-error-actions">
          {onRetry ? (
            <button type="button" className="k-btn k-btn-secondary k-btn-sm" onClick={onRetry}>
              <RefreshCw size={14} aria-hidden="true" /> Try again
            </button>
          ) : null}
          {action}
        </div>
      </div>
    </div>
  );
}
