import { classNames } from "../../utils/format.js";

export default function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  footer,
  className = "",
}) {
  return (
    <article className={classNames("k-metric-card", `k-metric-${tone}`, className)}>
      <div className="k-metric-top">
        <span className="k-metric-label">{label}</span>
        {Icon ? (
          <span className="k-metric-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
        ) : null}
      </div>
      <p className="k-metric-value">{value}</p>
      {hint ? <p className="k-metric-hint">{hint}</p> : null}
      {footer ? <div className="k-metric-footer">{footer}</div> : null}
    </article>
  );
}
