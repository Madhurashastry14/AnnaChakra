import { Lightbulb, TriangleAlert } from "lucide-react";
import { Badge } from "./Badge.jsx";
import {
  classNames,
  labelFor,
  menuModeLabel,
  mealTypeLabel,
  percent,
  severityTone,
} from "../../utils/format.js";

export default function InsightCard({ insight, className = "" }) {
  const isInsufficient = insight.insight_type === "INSUFFICIENT_HISTORY";
  const tone = severityTone(insight.severity);
  const Icon = isInsufficient ? Lightbulb : TriangleAlert;

  return (
    <article className={classNames("k-insight-card", `k-insight-${tone}`, className)}>
      <div className="k-insight-top">
        <span className="k-insight-icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <div className="k-insight-badges">
          <Badge tone={tone}>{labelFor(insight.severity)}</Badge>
          <Badge tone="outline">{labelFor(insight.evidence_quality)}</Badge>
        </div>
      </div>
      <h3>{insight.title}</h3>
      <p>{insight.description}</p>
      {insight.recommendation ? (
        <div className="k-insight-recommendation">
          <strong>Suggested action</strong>
          <p>{insight.recommendation}</p>
        </div>
      ) : null}
      <dl className="k-insight-meta">
        <div>
          <dt>Food</dt>
          <dd>{insight.food_item_name}</dd>
        </div>
        <div>
          <dt>Meal</dt>
          <dd>{mealTypeLabel(insight.meal_type)}</dd>
        </div>
        <div>
          <dt>Menu mode</dt>
          <dd>{menuModeLabel(insight.menu_mode)}</dd>
        </div>
        <div>
          <dt>Observed</dt>
          <dd>{percent(insight.observed_rate)}</dd>
        </div>
        <div>
          <dt>Threshold</dt>
          <dd>{percent(insight.threshold)}</dd>
        </div>
        <div>
          <dt>Records</dt>
          <dd>{insight.records_analyzed}</dd>
        </div>
      </dl>
    </article>
  );
}
