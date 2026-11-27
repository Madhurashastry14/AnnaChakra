import { useMemo } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  Info,
  Printer,
} from "lucide-react";
import { Badge, MethodBadge, RoleBadge } from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatQuantity,
  labelFor,
  mealTypeLabel,
  menuModeLabel,
  percent,
  unitLabel,
} from "../../utils/format.js";
import { consolidateIngredients } from "../../utils/ingredients.js";

const METHOD_NOTES = {
  BASELINE: "Uses catalogue defaults and uptake assumptions. It does not learn from this kitchen’s recorded history.",
  LOCAL_HISTORY: "Uses this kitchen’s recorded meal history.",
  ML: "Uses the platform’s machine-learning model. Treat the result as guidance, not a guarantee.",
};

export default function ForecastResult({ forecast, showActions = true }) {
  const consolidated = useMemo(
    () => consolidateIngredients(forecast?.items ?? []),
    [forecast],
  );

  const warnings = useMemo(() => {
    const unique = new Map();
    for (const item of forecast?.items ?? []) {
      for (const warning of item.warnings ?? []) {
        const key = `${item.food_item_id}-${warning}`;
        unique.set(key, { food: item.name, warning });
      }
    }
    return [...unique.values()];
  }, [forecast]);

  const methods = useMemo(
    () => [...new Set((forecast?.items ?? []).map((item) => item.prediction_method))],
    [forecast],
  );

  if (!forecast) return null;

  return (
    <div className="k-forecast-result print-area">
      <section className="k-result-hero">
        <div className="k-result-hero-main">
          <p className="k-eyebrow">FORECAST SAVED</p>
          <h2>Forecast #{forecast.id}</h2>
          <p>
            {mealTypeLabel(forecast.meal_type)} · {formatDate(forecast.meal_date)} ·{" "}
            {menuModeLabel(forecast.menu_mode)}
          </p>
        </div>
        <dl className="k-result-hero-stats">
          <div>
            <dt>Expected attendance</dt>
            <dd>{formatNumber(forecast.expected_people)}</dd>
          </div>
          <div>
            <dt>Dishes</dt>
            <dd>{forecast.items?.length ?? 0}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDateTime(forecast.created_at)}</dd>
          </div>
        </dl>
        {showActions ? (
          <div className="k-result-actions k-no-print">
            <Button
              to={`/kitchen/meal-records/new?forecast_id=${forecast.id}`}
              icon={ClipboardCheck}
            >
              Record meal feedback
            </Button>
            <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
              Print forecast
            </Button>
          </div>
        ) : null}
      </section>

      {warnings.length > 0 ? (
        <section className="k-callout k-callout-warning">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <h3>Warnings returned with this forecast</h3>
            <ul>
              {warnings.map((item) => (
                <li key={`${item.food}-${item.warning}`}>
                  <strong>{item.food}:</strong> {item.warning}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <div className="k-forecast-items">
        {(forecast.items ?? []).map((item) => (
          <article
            className={`k-forecast-item${item.recommended_servings === 0 ? " has-warning" : ""}`}
            key={item.food_item_id}
          >
            <header className="k-forecast-item-head">
              <div>
                <h3>{item.name}</h3>
                <div className="k-badge-row">
                  <RoleBadge role={item.food_role} />
                  <MethodBadge method={item.prediction_method} />
                  {item.recommended_servings === 0 ? (
                    <Badge tone="danger" icon={AlertTriangle}>No preparation recommended</Badge>
                  ) : null}
                </div>
              </div>
              <div className="k-forecast-prep">
                <span>Recommended preparation</span>
                <strong>{formatQuantity(item.recommended_servings, item.serving_unit)}</strong>
              </div>
            </header>

            <dl className="k-stat-grid k-stat-grid-compact">
              <div>
                <dt>Estimated diners</dt>
                <dd>{formatNumber(item.estimated_diners, 0)}</dd>
              </div>
              <div>
                <dt>Predicted quantity</dt>
                <dd>{formatQuantity(item.predicted_servings, item.serving_unit, { approximate: true })}</dd>
              </div>
              <div>
                <dt>Allocation share</dt>
                <dd>
                  {item.preference_share === null || item.preference_share === undefined
                    ? "—"
                    : percent(item.preference_share * 100)}
                </dd>
              </div>
              <div>
                <dt>Historical observations</dt>
                <dd>{item.historical_observation_count ?? "Not available"}</dd>
              </div>
              <div>
                <dt>Serving unit</dt>
                <dd>{unitLabel(item.serving_unit)}</dd>
              </div>
              <div>
                <dt>Model version</dt>
                <dd className="k-mono">{item.model_version ?? "—"}</dd>
              </div>
            </dl>

            {item.preference_share !== null && item.preference_share !== undefined ? (
              <p className="k-note">
                <Info size={14} aria-hidden="true" />
                Allocation share is the portion of expected diners assigned to this dish. It is
                not a probability that someone will choose it.
              </p>
            ) : null}

            {item.warnings?.length > 0 ? (
              <ul className="k-warning-list">
                {item.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>
                    <AlertTriangle size={14} aria-hidden="true" /> {warning}
                  </li>
                ))}
              </ul>
            ) : null}

            <details className="k-ingredient-details">
              <summary>
                Ingredient requirements
                <span>{item.ingredients?.length ?? 0} ingredients</span>
              </summary>
              {item.ingredients?.length > 0 ? (
                <div className="k-table-wrap">
                  <table className="k-table k-table-compact">
                    <thead>
                      <tr>
                        <th>Ingredient</th>
                        <th>Quantity</th>
                        <th>Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.ingredients.map((ingredient, index) => (
                        <tr key={`${ingredient.name}-${index}`}>
                          <td>{ingredient.name}</td>
                          <td>{formatNumber(ingredient.quantity)}</td>
                          <td>{ingredient.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="k-muted-text">No ingredient data was returned for this dish.</p>
              )}
            </details>
          </article>
        ))}
      </div>

      <section className="k-card">
        <div className="k-card-header">
          <div className="k-card-heading">
            <span className="k-card-icon" aria-hidden="true"><Info size={18} /></span>
            <div>
              <h2>Consolidated ingredient list</h2>
              <p>Combined across every dish in this forecast.</p>
            </div>
          </div>
        </div>
        <div className="k-card-body">
          {consolidated.length > 0 ? (
            <>
              <div className="k-table-wrap">
                <table className="k-table k-table-compact">
                  <thead>
                    <tr>
                      <th>Ingredient</th>
                      <th>Total quantity</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidated.map((ingredient) => (
                      <tr key={`${ingredient.name}-${ingredient.dimension}-${ingredient.unit}`}>
                        <td>{ingredient.name}</td>
                        <td>{formatNumber(ingredient.quantity, 3)}</td>
                        <td>{ingredient.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="k-note">
                <Info size={14} aria-hidden="true" />
                Compatible units are combined only within the same measurement type (g/kg or
                ml/l). Weight, volume, and piece counts are never mixed.
              </p>
            </>
          ) : (
            <p className="k-muted-text">No ingredient requirements were returned for these dishes.</p>
          )}
        </div>
      </section>

      <section className="k-method-legend">
        <h3>How to read these estimates</h3>
        <div className="k-method-grid">
          {methods.map((method) => (
            <div key={method}>
              <MethodBadge method={method} />
              <p>{METHOD_NOTES[method] ?? "Prediction method returned by the backend."}</p>
            </div>
          ))}
        </div>
        <p className="k-note">
          <Info size={14} aria-hidden="true" />
          Forecast quantities are planning estimates. Review them with your kitchen team before
          preparation. The platform does not claim that any model is validated on real kitchen
          demand beyond the evidence returned above.
        </p>
        <p className="k-note">
          Menu mode: <strong>{labelFor(forecast.menu_mode)}</strong> —{" "}
          {forecast.menu_mode === "FIXED_MEAL"
            ? "everyone receives the same main dishes."
            : "diners choose between alternative main dishes, so preparation is allocated across the menu."}
        </p>
      </section>
    </div>
  );
}
