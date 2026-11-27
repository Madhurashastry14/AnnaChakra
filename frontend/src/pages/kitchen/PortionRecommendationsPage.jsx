import { useEffect, useMemo, useState } from "react";
import {
  Filter,
  Info,
  Lightbulb,
  Scale,
  TrendingUp,
  Users,
} from "lucide-react";
import { getPortionRecommendations } from "../../services/analytics.js";
import { listForecasts } from "../../services/forecasts.js";
import { listFoodItems } from "../../services/foodItems.js";
import { getErrorMessage } from "../../utils/errors.js";
import {
  MEAL_TYPES,
  formatDate,
  formatNumber,
  mealTypeLabel,
  menuModeLabel,
  percent,
  unitLabel,
} from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { SelectInput, TextInput } from "../../components/ui/Form.jsx";
import { FoodSelect } from "../../components/kitchen/FoodSelectors.jsx";

export default function PortionRecommendationsPage() {
  const [foods, setFoods] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [filters, setFilters] = useState({
    start_date: "",
    end_date: "",
    meal_type: "",
    menu_mode: "",
    food_item_id: "",
    forecast_id: "",
  });
  const [data, setData] = useState({ forecast_id: null, recommendations: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.allSettled([listFoodItems({ limit: 100 }), listForecasts()]).then((results) => {
      if (!active) return;
      if (results[0].status === "fulfilled") setFoods(results[0].value.items ?? []);
      if (results[1].status === "fulfilled") {
        setForecasts(Array.isArray(results[1].value) ? results[1].value : []);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const params = {};
    for (const key of ["start_date", "end_date", "meal_type", "food_item_id"]) {
      if (filters[key]) params[key] = filters[key];
    }
    if (filters.menu_mode && filters.menu_mode !== "LEGACY") params.menu_mode = filters.menu_mode;
    if (filters.forecast_id) params.forecast_id = filters.forecast_id;

    getPortionRecommendations(params)
      .then((result) => {
        if (!active) return;
        const legacyOnly = filters.menu_mode === "LEGACY";
        const recommendations = (result.recommendations ?? []).filter(
          (row) => !legacyOnly || row.observed_metrics?.menu_mode === null,
        );
        setData({ ...result, recommendations });
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, "We couldn’t load portion recommendations."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters, reloadKey]);

  const selectedForecast = useMemo(
    () => forecasts.find((forecast) => String(forecast.id) === String(filters.forecast_id)) ?? null,
    [forecasts, filters.forecast_id],
  );

  const hasFilters = Object.values(filters).some(Boolean);
  const recommendations = data.recommendations ?? [];

  function setFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters({
      start_date: "",
      end_date: "",
      meal_type: "",
      menu_mode: "",
      food_item_id: "",
      forecast_id: "",
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="INSIGHTS"
        title="Portion recommendations"
        description="Advisory preparation guidance from catalogue defaults and this kitchen’s recorded service history."
        actions={
          <Button variant="secondary" to="/kitchen/analytics" icon={TrendingUp}>
            Waste intelligence
          </Button>
        }
      />

      <Card>
        <div className="k-filter-bar">
          <div className="k-filter-grid">
            <TextInput
              label="From meal date"
              type="date"
              value={filters.start_date}
              onChange={(event) => setFilter("start_date", event.target.value)}
            />
            <TextInput
              label="To meal date"
              type="date"
              value={filters.end_date}
              onChange={(event) => setFilter("end_date", event.target.value)}
            />
            <SelectInput
              label="Meal type"
              value={filters.meal_type}
              onChange={(event) => setFilter("meal_type", event.target.value)}
              placeholder="All meals"
              options={MEAL_TYPES.map((value) => ({ value, label: mealTypeLabel(value) }))}
            />
            <SelectInput
              label="Menu mode"
              value={filters.menu_mode}
              onChange={(event) => setFilter("menu_mode", event.target.value)}
              placeholder="All modes"
              options={[
                { value: "CHOICE_BASED", label: menuModeLabel("CHOICE_BASED") },
                { value: "FIXED_MEAL", label: menuModeLabel("FIXED_MEAL") },
                { value: "LEGACY", label: "Legacy (mode not recorded)" },
              ]}
            />
            <FoodSelect
              foods={foods}
              value={filters.food_item_id}
              onChange={(value) => setFilter("food_item_id", value)}
              label="Food item"
              allowAll
              allLabel="All foods"
            />
            <SelectInput
              label="Forecast context"
              value={filters.forecast_id}
              onChange={(event) => setFilter("forecast_id", event.target.value)}
              placeholder="No forecast"
              options={forecasts.map((forecast) => ({
                value: forecast.id,
                label: `#${forecast.id} · ${formatDate(forecast.meal_date)} · ${mealTypeLabel(forecast.meal_type)}`,
              }))}
              hint="Optional. Adds forecast quantities and expected attendance."
            />
          </div>
          <div className="k-filter-actions">
            <span className="k-muted-text">
              {recommendations.length} {recommendations.length === 1 ? "recommendation" : "recommendations"}
            </span>
            {hasFilters ? (
              <Button variant="ghost" size="sm" icon={Filter} onClick={resetFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="k-callout k-callout-info">
        <Info size={17} aria-hidden="true" />
        <div>
          <strong>Per-attendee quantities respect the serving unit</strong>
          <p>
            For serving-based foods, per-attendee figures are servings per attendee. For
            piece-based foods, they are pieces per attendee. The two are never combined.
            Recommendations are advisory and do not override your kitchen’s judgement.
          </p>
          {selectedForecast ? (
            <p className="k-callout-meta">
              <Users size={14} aria-hidden="true" /> Forecast #{selectedForecast.id} ·{" "}
              {formatDate(selectedForecast.meal_date)} · {mealTypeLabel(selectedForecast.meal_type)} ·{" "}
              {formatNumber(selectedForecast.expected_people, 0)} expected diners
            </p>
          ) : null}
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton variant="page" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : recommendations.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No portion recommendations"
          description="Recommendations appear once the catalogue or recorded service history can support them. Try a different filter or record more meals."
          action={<Button to="/kitchen/meal-records/new">Record a meal</Button>}
        />
      ) : (
        <div className="k-recommendation-grid">
          {recommendations.map((recommendation) => (
            <article className="k-recommendation-card" key={recommendation.food_item_id}>
              <header className="k-recommendation-head">
                <div>
                  <h2>{recommendation.food_item_name}</h2>
                  <Badge tone="outline">{unitLabel(recommendation.serving_unit)}</Badge>
                </div>
                <Badge tone={recommendation.records_analyzed > 0 ? "info" : "neutral"}>
                  {recommendation.records_analyzed > 0
                    ? `${recommendation.records_analyzed} records`
                    : "Catalogue only"}
                </Badge>
              </header>

              <div className="k-recommendation-banner">
                <Lightbulb size={18} aria-hidden="true" />
                <div>
                  <strong>{recommendation.portion_recommendation}</strong>
                  <p>{recommendation.preparation_recommendation}</p>
                </div>
              </div>

              <dl className="k-stat-grid k-stat-grid-compact">
                <div>
                  <dt>Catalogue per person</dt>
                  <dd>
                    {formatNumber(recommendation.catalogue_servings_per_person)}{" "}
                    {unitLabel(recommendation.serving_unit)}
                  </dd>
                </div>
                <div>
                  <dt>Observed per attendee</dt>
                  <dd>
                    {recommendation.uncensored_served_per_attendee === null
                      ? "Not available"
                      : `${formatNumber(recommendation.uncensored_served_per_attendee)} ${unitLabel(recommendation.serving_unit)}`}
                  </dd>
                </div>
                <div>
                  <dt>Uncensored records</dt>
                  <dd>{formatNumber(recommendation.uncensored_records, 0)}</dd>
                </div>
                <div>
                  <dt>Expected attendees</dt>
                  <dd>
                    {recommendation.expected_people === null
                      ? "—"
                      : formatNumber(recommendation.expected_people, 0)}
                  </dd>
                </div>
                <div>
                  <dt>Forecast preparation</dt>
                  <dd>
                    {recommendation.forecast_preparation_quantity === null
                      ? "—"
                      : `${formatNumber(recommendation.forecast_preparation_quantity, 0)} ${unitLabel(recommendation.serving_unit)}`}
                  </dd>
                </div>
                <div>
                  <dt>Plate-waste coverage</dt>
                  <dd>
                    {recommendation.observed_metrics
                      ? percent(recommendation.observed_metrics.plate_waste_measurement_coverage)
                      : "—"}
                  </dd>
                </div>
              </dl>

              {recommendation.observed_metrics ? (
                <dl className="k-stat-grid k-stat-grid-compact k-recommendation-rates">
                  <div>
                    <dt>Overproduction</dt>
                    <dd>{percent(recommendation.observed_metrics.overproduction_rate)}</dd>
                  </div>
                  <div>
                    <dt>Plate waste</dt>
                    <dd>{percent(recommendation.observed_metrics.plate_waste_rate)}</dd>
                  </div>
                  <div>
                    <dt>Acceptance proxy</dt>
                    <dd>{percent(recommendation.observed_metrics.food_acceptance_rate)}</dd>
                  </div>
                  <div>
                    <dt>Shortage frequency</dt>
                    <dd>{percent(recommendation.observed_metrics.shortage_frequency)}</dd>
                  </div>
                </dl>
              ) : null}

              {recommendation.suggested_actions?.length > 0 ? (
                <div className="k-recommendation-section">
                  <h3>Suggested actions</h3>
                  <ul className="k-check-list">
                    {recommendation.suggested_actions.map((action, index) => (
                      <li key={`${action}-${index}`}>{action}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {recommendation.warnings?.length > 0 ? (
                <div className="k-warning-list">
                  {recommendation.warnings.map((warning, index) => (
                    <p key={`${warning}-${index}`}>{warning}</p>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <p className="k-page-footer-note">
        <Info size={14} aria-hidden="true" />
        <span>
          “Catalogue only” means no usable kitchen history contributed to the recommendation.
          Missing or censored observations are reported, not filled in.
        </span>
      </p>
    </>
  );
}
