import { Info, ShieldCheck } from "lucide-react";
import { SafetyBadge } from "./Badge.jsx";
import { formatDateTime, formatQuantity } from "../../utils/format.js";

export default function SafetyScreeningPanel({
  status,
  notes = [],
  screenedAt,
  policyVersion,
  safeUntil,
  availableServings,
  servingUnit,
  compact = false,
}) {
  if (!status && !notes?.length) return null;

  return (
    <section className={`k-safety-panel${compact ? " k-safety-compact" : ""}`}>
      <div className="k-safety-heading">
        <span className="k-safety-icon" aria-hidden="true">
          <ShieldCheck size={19} />
        </span>
        <div>
          <h2>Food safety screening</h2>
          <p>The backend evaluates redistribution eligibility from the information recorded below.</p>
        </div>
        <SafetyBadge status={status} />
      </div>

      <p className="k-safety-disclaimer">
        <Info size={15} aria-hidden="true" />
        Eligibility is a screening result, not a guarantee that food is safe. Follow your
        kitchen’s food-safety procedures.
      </p>

      {notes?.length > 0 ? (
        <div className="k-safety-reasons">
          <h3>Why this status was returned</h3>
          <ul>
            {notes.map((note, index) => (
              <li key={`${note}-${index}`}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="k-detail-grid k-safety-meta">
        <div>
          <dt>Available for redistribution</dt>
          <dd>{formatQuantity(availableServings, servingUnit)}</dd>
        </div>
        <div>
          <dt>Redistribution deadline</dt>
          <dd>{safeUntil ? formatDateTime(safeUntil) : "Not set"}</dd>
        </div>
        <div>
          <dt>Screened at</dt>
          <dd>{screenedAt ? formatDateTime(screenedAt) : "Not screened"}</dd>
        </div>
        <div>
          <dt>Safety policy version</dt>
          <dd>{policyVersion ?? "Not configured"}</dd>
        </div>
      </dl>
    </section>
  );
}
