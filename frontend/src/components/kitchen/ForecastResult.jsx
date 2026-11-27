import { useMemo } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  History,
  Info,
  Printer,
  Users,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Badge, MethodBadge, RoleBadge } from "../ui/Badge.jsx";
import Button from "../ui/Button.jsx";
import { EmptyState } from "../ui/States.jsx";
import {
  formatDate,
  formatNumber,
  formatQuantity,
  labelFor,
  mealTypeLabel,
  menuModeLabel,
  percent,
  unitLabel,
} from "../../utils/format.js";

const DINER_COLORS = [
  "#3f7a58",
  "#d8a45d",
  "#c47064",
  "#5d8ba8",
  "#8b78a5",
  "#879f69",
];

const METHOD_NOTES = {
  BASELINE:
    "Uses catalogue defaults and uptake assumptions. It does not learn from this kitchen’s recorded history.",
  LOCAL_HISTORY: "Uses this kitchen’s recorded meal history.",
  ML: "Uses the platform’s machine-learning model. Treat the result as guidance, not a guarantee.",
};

function DinerTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const dish = payload[0].payload;
  return (
    <div className="k-chart-tooltip">
      <strong>{dish.name}</strong>
      <p>Estimated diners: {formatNumber(dish.estimated_diners, 0)}</p>
      <p>
        Preference share:{" "}
        {dish.preference_share == null
          ? "Not returned"
          : percent(Number(dish.preference_share) * 100)}
      </p>
    </div>
  );
}

export default function ForecastResult({
  forecast,
  foods = [],
  showActions = true,
}) {
  const methods = useMemo(
    () => [
      ...new Set(
        (forecast?.items ?? [])
          .map((item) => item.prediction_method)
          .filter(Boolean),
      ),
    ],
    [forecast],
  );

  const foodNames = useMemo(
    () => new Map((foods ?? []).map((food) => [food.id, food.name])),
    [foods],
  );

  const dinerDistribution = useMemo(() => {
    if (forecast?.menu_mode !== "CHOICE_BASED") return [];
    return (forecast?.items ?? [])
      .filter(
        (item) =>
          (item.food_role === "MAIN_DISH" || item.food_role == null) &&
          item.estimated_diners != null &&
          Number.isFinite(Number(item.estimated_diners)),
      )
      .map((item, index) => ({
        food_item_id: item.food_item_id,
        name: item.name,
        estimated_diners: Number(item.estimated_diners),
        preference_share: item.preference_share,
        color: DINER_COLORS[index % DINER_COLORS.length],
      }));
  }, [forecast]);

  if (!forecast) return null;

  const items = forecast.items ?? [];
  const chartData = dinerDistribution.filter(
    (item) => item.estimated_diners > 0,
  );

  return (
    <div className="k-forecast-result print-area">
      <section className="k-result-hero">
        <div className="k-result-hero-main">
          <p className="k-eyebrow">FORECAST OVERVIEW</p>
          <h2>Forecast #{forecast.id}</h2>
          <p>
            {mealTypeLabel(forecast.meal_type)} ·{" "}
            {formatDate(forecast.meal_date)} ·{" "}
            {menuModeLabel(forecast.menu_mode)}
          </p>
          {showActions ? (
            <div className="k-result-actions k-no-print">
              <Button
                to={`/kitchen/meal-records/new?forecast_id=${forecast.id}`}
                icon={ClipboardCheck}
              >
                Record meal feedback
              </Button>
              <Button
                variant="secondary"
                icon={Printer}
                onClick={() => window.print()}
              >
                Print forecast
              </Button>
              <Button
                variant="secondary"
                to="/kitchen/forecasts"
                icon={History}
              >
                Forecast history
              </Button>
            </div>
          ) : null}
        </div>
        <dl className="k-result-hero-stats">
          <div>
            <dt>Meal date</dt>
            <dd>{formatDate(forecast.meal_date)}</dd>
          </div>
          <div>
            <dt>Meal type</dt>
            <dd>{mealTypeLabel(forecast.meal_type)}</dd>
          </div>
          <div>
            <dt>Expected attendance</dt>
            <dd>{formatNumber(forecast.expected_people)}</dd>
          </div>
          <div>
            <dt>Menu mode</dt>
            <dd>{menuModeLabel(forecast.menu_mode)}</dd>
          </div>
          <div>
            <dt>Selected dishes</dt>
            <dd>{items.length}</dd>
          </div>
          <div>
            <dt>Forecast ID</dt>
            <dd>#{forecast.id}</dd>
          </div>
        </dl>
      </section>

      {forecast.menu_mode === "CHOICE_BASED" ? (
        <section className="k-card k-diner-distribution">
          <div className="k-card-header">
            <div className="k-card-heading">
              <span className="k-card-icon" aria-hidden="true">
                <Users size={18} />
              </span>
              <div>
                <h2>Expected diner distribution</h2>
              </div>
            </div>
          </div>
          <div className="k-card-body">
            {dinerDistribution.length === 0 ? (
              <p className="k-muted-text">
                No main-dish diner allocation was returned for this forecast.
              </p>
            ) : (
              <div className="k-diner-distribution-layout">
                <div className="k-diner-chart">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey="estimated_diners"
                          nameKey="name"
                          innerRadius="58%"
                          outerRadius="82%"
                          paddingAngle={2}
                          stroke="var(--k-paper)"
                          strokeWidth={2}
                        >
                          {chartData.map((dish) => (
                            <Cell key={dish.food_item_id} fill={dish.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<DinerTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="k-muted-text">
                      No positive estimated-diner values were returned for the
                      chart.
                    </p>
                  )}
                </div>
                <ul className="k-diner-legend">
                  {dinerDistribution.map((dish) => (
                    <li key={dish.food_item_id}>
                      <span
                        className="k-diner-legend-swatch"
                        style={{ backgroundColor: dish.color }}
                        aria-hidden="true"
                      />
                      <span className="k-diner-legend-text">
                        <strong>{dish.name}</strong>
                        <small>
                          {formatNumber(dish.estimated_diners, 0)} estimated
                          diners · preference share{" "}
                          {dish.preference_share == null
                            ? "not returned"
                            : percent(Number(dish.preference_share) * 100)}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="No dish results returned"
          description="The backend did not include any dish preparation details in this forecast."
        />
      ) : (
        <div className="k-forecast-items">
          {items.map((item) => (
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
                      <Badge tone="danger" icon={AlertTriangle}>
                        No preparation recommended
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="k-forecast-prep">
                  <span>Recommended preparation</span>
                  <strong>
                    {formatQuantity(
                      item.recommended_servings,
                      item.serving_unit,
                    )}
                  </strong>
                </div>
              </header>

              <dl className="k-stat-grid k-stat-grid-compact">
                <div>
                  <dt>Estimated diners</dt>
                  <dd>{formatNumber(item.estimated_diners, 0)}</dd>
                </div>
                <div>
                  <dt>Predicted servings</dt>
                  <dd>
                    {formatQuantity(
                      item.predicted_servings,
                      item.serving_unit,
                      { approximate: true },
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Historical observations</dt>
                  <dd>
                    {item.historical_observation_count ?? "Not available"}
                  </dd>
                </div>
                <div>
                  <dt>Serving unit</dt>
                  <dd>{unitLabel(item.serving_unit)}</dd>
                </div>
              </dl>

              {item.preference_share != null ? (
                <p className="k-note">
                  <Info size={14} aria-hidden="true" />
                  Allocation share is the portion of expected diners assigned to
                  this dish. It is not a probability that someone will choose
                  it.
                </p>
              ) : null}

              {item.food_role === "ACCOMPANIMENT" &&
              item.compatible_main_food_item_ids != null ? (
                <p className="k-note">
                  <Info size={14} aria-hidden="true" />
                  Compatible main dishes:{" "}
                  {item.compatible_main_food_item_ids.length > 0
                    ? item.compatible_main_food_item_ids
                        .map((id) => foodNames.get(id) ?? `#${id}`)
                        .join(", ")
                    : "none returned"}
                </p>
              ) : null}

              <details className="k-ingredient-details" open>
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
                            <td data-label="Ingredient">{ingredient.name}</td>
                            <td data-label="Quantity">
                              {formatNumber(ingredient.quantity)}
                            </td>
                            <td data-label="Unit">{ingredient.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="k-muted-text">
                    No ingredient data was returned for this dish.
                  </p>
                )}
              </details>
            </article>
          ))}
        </div>
      )}

      <section className="k-method-legend k-card">
        <div className="k-card-header">
          <div className="k-card-heading">
            <span className="k-card-icon" aria-hidden="true">
              <Info size={18} />
            </span>
            <div>
              <h2>Prediction explanation</h2>
              <p>Methods and allocation details returned by the backend.</p>
            </div>
          </div>
        </div>
        <div className="k-card-body k-prediction-explanation">
          <div className="k-method-grid">
            {methods.map((method) => (
              <div className="k-method-note" key={method}>
                <MethodBadge method={method} />
                <p>
                  {METHOD_NOTES[method] ??
                    "Prediction method returned by the backend."}
                </p>
              </div>
            ))}
          </div>
          <div className="k-table-wrap">
            <table className="k-table k-table-compact">
              <thead>
                <tr>
                  <th>Dish</th>
                  <th>Prediction method</th>
                  <th>Allocation method</th>
                  <th>Historical observations</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.food_item_id}>
                    <td data-label="Dish">{item.name}</td>
                    <td data-label="Prediction method">
                      <MethodBadge method={item.prediction_method} />
                    </td>
                    <td data-label="Allocation method">
                      {labelFor(item.allocation_method, "Not returned")}
                    </td>
                    <td data-label="Historical observations">
                      {item.historical_observation_count ?? "Not available"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="k-note">
            <Info size={14} aria-hidden="true" />
            Forecast quantities are planning estimates. Review them with your
            kitchen team before preparation.
          </p>
        </div>
      </section>
    </div>
  );
}
