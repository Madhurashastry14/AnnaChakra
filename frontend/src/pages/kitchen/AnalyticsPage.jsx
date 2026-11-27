import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Filter,
  Info,
  Lightbulb,
  Scale,
  TrendingDown,
  TrendingUp,
  Utensils,
} from "lucide-react";
import {
  getFoodAcceptance,
  getWasteInsights,
  getWasteSummary,
  getWasteTrends,
} from "../../services/analytics.js";
import { listFoodItems } from "../../services/foodItems.js";
import { getErrorMessage } from "../../utils/errors.js";
import {
  MEAL_TYPES,
  formatDate,
  formatNumber,
  groupBy,
  mealTypeLabel,
  menuModeLabel,
  percent,
  todayISO,
  truncate,
  weightedRate,
} from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import MetricCard from "../../components/ui/MetricCard.jsx";
import ChartContainer from "../../components/ui/ChartContainer.jsx";
import InsightCard from "../../components/ui/InsightCard.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { SelectInput, TextInput } from "../../components/ui/Form.jsx";
import { FoodSelect } from "../../components/kitchen/FoodSelectors.jsx";

function RateTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="k-chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value === null || entry.value === undefined ? "—" : `${Number(entry.value).toFixed(1)}%`}
        </p>
      ))}
    </div>
  );
}

function QuantityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="k-chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {formatNumber(entry.value)}
        </p>
      ))}
    </div>
  );
}

function aggregateRates(rows, keyFn) {
  const groups = groupBy(rows ?? [], keyFn);
  return [...groups.entries()].map(([key, group]) => ({
    key,
    label: group[0]?.food_item_name ?? group[0]?.date ?? key,
    fullLabel: group[0]?.food_item_name ?? group[0]?.date ?? key,
    overproduction: weightedRate(group, "overproduction_rate"),
    plateWaste: weightedRate(group, "plate_waste_rate"),
    acceptance: weightedRate(group, "food_acceptance_rate"),
    records: group.reduce((total, row) => total + (row.records_analyzed ?? 0), 0),
    rows: group,
  }));
}

function quantityTrend(rows, unit) {
  const groups = groupBy(
    (rows ?? []).filter((row) => row.serving_unit === unit),
    (row) => row.date,
  );
  return [...groups.entries()]
    .map(([date, group]) => ({
      date,
      prepared: group.reduce((total, row) => total + (row.total_prepared ?? 0), 0),
      served: group.reduce((total, row) => total + (row.total_served ?? 0), 0),
      unserved: group.reduce((total, row) => total + (row.total_unserved ?? 0), 0),
    }))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

function ModeTable({ mode, rows }) {
  if (!rows.length) return null;
  return (
    <section className="k-mode-group">
      <div className="k-mode-group-head">
        <h3>{menuModeLabel(mode)}</h3>
        <span>{rows.length} food/meal combinations</span>
      </div>
      <DataTable
        rows={rows}
        rowKey={(row) => `${row.food_item_id}-${row.meal_type}-${row.menu_mode ?? "legacy"}`}
        columns={[
          { key: "food", label: "Food", render: (row) => row.food_item_name },
          { key: "meal", label: "Meal", render: (row) => mealTypeLabel(row.meal_type) },
          { key: "unit", label: "Unit", render: (row) => (row.serving_unit === "piece" ? "Pieces" : "Servings") },
          { key: "records", label: "Records", render: (row) => formatNumber(row.records_analyzed, 0) },
          { key: "over", label: "Overproduction", render: (row) => percent(row.overproduction_rate) },
          { key: "plate", label: "Plate waste", render: (row) => percent(row.plate_waste_rate) },
          { key: "accept", label: "Acceptance proxy", render: (row) => percent(row.food_acceptance_rate) },
          { key: "coverage", label: "Plate-waste coverage", render: (row) => percent(row.plate_waste_measurement_coverage) },
        ]}
      />
    </section>
  );
}

export default function AnalyticsPage() {
  const [foods, setFoods] = useState([]);
  const [filters, setFilters] = useState({
    start_date: "",
    end_date: "",
    meal_type: "",
    menu_mode: "",
    food_item_id: "",
  });
  const [data, setData] = useState({ summary: [], trends: [], insights: [], acceptance: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    listFoodItems({ limit: 100 })
      .then((result) => {
        if (active) setFoods(result.items ?? []);
      })
      .catch(() => {
        if (active) setFoods([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setWarnings([]);

    const params = {};
    for (const key of ["start_date", "end_date", "meal_type", "food_item_id"]) {
      if (filters[key]) params[key] = filters[key];
    }
    if (filters.menu_mode && filters.menu_mode !== "LEGACY") params.menu_mode = filters.menu_mode;

    const legacyOnly = filters.menu_mode === "LEGACY";
    const keepMode = (row) => !legacyOnly || row.menu_mode === null;

    Promise.allSettled([
      getWasteSummary(params),
      getWasteTrends(params),
      getWasteInsights(params),
      getFoodAcceptance(params),
    ]).then((results) => {
      if (!active) return;
      const nextWarnings = [];
      const [summary, trends, insights, acceptance] = results;

      const next = { summary: [], trends: [], insights: [], acceptance: [] };
      if (summary.status === "fulfilled") next.summary = summary.value.filter(keepMode);
      else nextWarnings.push(getErrorMessage(summary.reason, "Waste summary unavailable."));
      if (trends.status === "fulfilled") next.trends = trends.value.filter(keepMode);
      else nextWarnings.push(getErrorMessage(trends.reason, "Waste trends unavailable."));
      if (insights.status === "fulfilled") {
        next.insights = (insights.value.insights ?? []).filter(keepMode);
      } else {
        nextWarnings.push(getErrorMessage(insights.reason, "Waste insights unavailable."));
      }
      if (acceptance.status === "fulfilled") next.acceptance = acceptance.value.filter(keepMode);
      else nextWarnings.push(getErrorMessage(acceptance.reason, "Food acceptance data unavailable."));

      setData(next);
      setWarnings(nextWarnings);
      if (results.every((result) => result.status === "rejected")) {
        setError(nextWarnings[0] ?? "We couldn’t load analytics.");
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [filters, reloadKey]);

  const summaryRows = useMemo(() => data.summary ?? [], [data.summary]);
  const trendRows = useMemo(() => data.trends ?? [], [data.trends]);

  const headline = useMemo(
    () => ({
      overproduction: weightedRate(summaryRows, "overproduction_rate"),
      plateWaste: weightedRate(summaryRows, "plate_waste_rate"),
      acceptance: weightedRate(data.acceptance, "food_acceptance_rate"),
      shortage: weightedRate(summaryRows, "shortage_frequency", "shortage_eligible_records"),
      records: summaryRows.reduce((total, row) => total + (row.records_analyzed ?? 0), 0),
      foods: new Set(summaryRows.map((row) => row.food_item_id)).size,
    }),
    [summaryRows, data.acceptance],
  );

  const trendChart = useMemo(
    () =>
      aggregateRates(trendRows, (row) => row.date)
        .sort((left, right) => String(left.key).localeCompare(String(right.key)))
        .map((row) => ({
          date: formatDate(row.key),
          overproduction: row.overproduction,
          plateWaste: row.plateWaste,
          acceptance: row.acceptance,
        })),
    [trendRows],
  );

  const foodChart = useMemo(
    () =>
      aggregateRates(summaryRows, (row) => row.food_item_id)
        .map((row) => ({
          name: truncate(row.label, 18),
          fullLabel: row.label,
          overproduction: row.overproduction,
          plateWaste: row.plateWaste,
          acceptance: row.acceptance,
        }))
        .filter((row) => row.overproduction !== null || row.plateWaste !== null || row.acceptance !== null)
        .sort((left, right) => (right.plateWaste ?? -1) - (left.plateWaste ?? -1))
        .slice(0, 10),
    [summaryRows],
  );

  const servingTrend = useMemo(() => quantityTrend(trendRows, "serving"), [trendRows]);
  const pieceTrend = useMemo(() => quantityTrend(trendRows, "piece"), [trendRows]);

  const modeGroups = useMemo(() => {
    const groups = groupBy(summaryRows, (row) => row.menu_mode ?? "LEGACY");
    return [...groups.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)));
  }, [summaryRows]);

  const hasFilters = Object.values(filters).some(Boolean);
  const hasData = summaryRows.length > 0 || trendRows.length > 0 || data.insights.length > 0;

  function setFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters({ start_date: "", end_date: "", meal_type: "", menu_mode: "", food_item_id: "" });
  }

  return (
    <>
      <PageHeader
        eyebrow="INSIGHTS"
        title="Waste intelligence"
        description="Unitless rates and quantities from recorded meals. Serving-based and piece-based quantities are kept separate."
        actions={
          <Button variant="secondary" to="/kitchen/recommendations" icon={Scale}>
            Portion recommendations
          </Button>
        }
      />

      <Card>
        <div className="k-filter-bar">
          <div className="k-filter-grid">
            <TextInput
              label="From meal date"
              type="date"
              max={todayISO()}
              value={filters.start_date}
              onChange={(event) => setFilter("start_date", event.target.value)}
            />
            <TextInput
              label="To meal date"
              type="date"
              max={todayISO()}
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
          </div>
          <div className="k-filter-actions">
            <span className="k-muted-text">
              {hasData ? `${formatNumber(headline.records, 0)} meal observations` : "No observations"}
            </span>
            {hasFilters ? (
              <Button variant="ghost" size="sm" icon={Filter} onClick={resetFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingSkeleton variant="page" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : (
        <>
          {warnings.length > 0 ? (
            <div className="k-callout k-callout-warning">
              <Info size={17} aria-hidden="true" />
              <div>
                <strong>Some analytics could not be loaded</strong>
                <ul>
                  {warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <div className="k-metric-grid">
            <MetricCard
              label="Overproduction rate"
              value={percent(headline.overproduction)}
              hint="Weighted by measured served quantity."
              icon={TrendingUp}
              tone="warning"
            />
            <MetricCard
              label="Plate-waste rate"
              value={percent(headline.plateWaste)}
              hint="Only records with measured plate waste contribute."
              icon={TrendingDown}
              tone="danger"
            />
            <MetricCard
              label="Acceptance proxy"
              value={percent(headline.acceptance)}
              hint="Consumed ÷ served. A proxy, not a direct preference measure."
              icon={Utensils}
              tone="success"
            />
            <MetricCard
              label="Shortage frequency"
              value={percent(headline.shortage)}
              hint="Shortage-eligible records only."
              icon={BarChart3}
              tone="info"
              footer={<span className="k-muted-text">{formatNumber(headline.foods, 0)} foods analysed</span>}
            />
          </div>

          <div className="k-callout k-callout-info">
            <Info size={17} aria-hidden="true" />
            <div>
              <strong>How to read these numbers</strong>
              <p>
                Overproduction and plate-waste rates are weighted by measured served quantity and
                are unitless. The acceptance proxy is consumed ÷ served; it is not a preference
                probability. If plate waste was not measured, the plate-waste rate excludes that
                record instead of treating it as zero.
              </p>
            </div>
          </div>

          {!hasData ? (
            <EmptyState
              icon={BarChart3}
              title="Not enough history yet"
              description="Record meal feedback with served and leftover quantities to build waste intelligence. Rates stay unavailable until enough measured records exist."
              action={<Button to="/kitchen/meal-records/new">Record a meal</Button>}
            />
          ) : (
            <>
              <div className="k-chart-grid">
                <ChartContainer
                  title="Rate trend"
                  subtitle="Weighted rates by meal date. Percentages are unitless."
                  empty={trendChart.length === 0}
                  emptyDescription="Record meals across more dates to see a trend."
                >
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={trendChart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip content={<RateTooltip />} />
                      <Legend />
                      <Line type="monotone" dataKey="overproduction" name="Overproduction" stroke="#c98a3c" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="plateWaste" name="Plate waste" stroke="#b4544a" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="acceptance" name="Acceptance proxy" stroke="#3f7a58" strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>

                <ChartContainer
                  title="Rates by food"
                  subtitle="Top foods by plate-waste rate. Unitless percentages."
                  empty={foodChart.length === 0}
                  emptyDescription="No food-level rates are available for these filters."
                >
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={foodChart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip content={<RateTooltip />} />
                      <Legend />
                      <Bar dataKey="overproduction" name="Overproduction" fill="#d8a45d" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="plateWaste" name="Plate waste" fill="#c47064" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="acceptance" name="Acceptance proxy" fill="#5b8f6d" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>

              <div className="k-chart-grid">
                <ChartContainer
                  title="Serving-based quantities"
                  subtitle="Prepared, served and unserved servings. Never combined with pieces."
                  empty={servingTrend.length === 0}
                  emptyDescription="No serving-based quantities match these filters."
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={servingTrend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(value) => formatDate(value)} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<QuantityTooltip />} labelFormatter={(value) => formatDate(value)} />
                      <Legend />
                      <Bar dataKey="prepared" name="Prepared" fill="#a9bfa7" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="served" name="Served" fill="#5b8f6d" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="unserved" name="Unserved" fill="#d8a45d" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>

                <ChartContainer
                  title="Piece-based quantities"
                  subtitle="Prepared, served and unserved pieces. Kept separate from servings."
                  empty={pieceTrend.length === 0}
                  emptyDescription="No piece-based quantities match these filters."
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={pieceTrend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(value) => formatDate(value)} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<QuantityTooltip />} labelFormatter={(value) => formatDate(value)} />
                      <Legend />
                      <Bar dataKey="prepared" name="Prepared" fill="#a9bfa7" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="served" name="Served" fill="#5b8f6d" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="unserved" name="Unserved" fill="#d8a45d" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>

              <Card>
                <CardHeader
                  icon={Utensils}
                  title="Food and meal breakdown"
                  subtitle="Grouped by menu mode. Legacy records without a recorded mode are kept separate."
                />
                <div className="k-card-body">
                  {modeGroups.length === 0 ? (
                    <EmptyState
                      icon={BarChart3}
                      title="No food-level metrics"
                      description="No measured meal records match these filters."
                      className="k-empty-compact"
                    />
                  ) : (
                    modeGroups.map(([mode, rows]) => (
                      <ModeTable key={mode} mode={mode} rows={rows} />
                    ))
                  )}
                </div>
              </Card>

              <section>
                <div className="k-section-heading-row">
                  <div>
                    <p className="k-eyebrow">GUIDANCE</p>
                    <h2>Waste insights</h2>
                  </div>
                  <span className="k-muted-text">
                    {data.insights.length} {data.insights.length === 1 ? "insight" : "insights"}
                  </span>
                </div>
                {data.insights.length === 0 ? (
                  <EmptyState
                    icon={Lightbulb}
                    title="No insights yet"
                    description="Insights appear when enough comparable records exist. Insufficient-history notes are shown honestly rather than replaced with guesses."
                    className="k-empty-compact"
                  />
                ) : (
                  <div className="k-insight-stack">
                    {data.insights.map((insight, index) => (
                      <InsightCard key={`${insight.food_item_id}-${insight.meal_type}-${index}`} insight={insight} />
                    ))}
                  </div>
                )}
              </section>

              <p className="k-page-footer-note">
                <Info size={14} aria-hidden="true" />
                <span>
                  Missing measurements stay missing rather than becoming zero, and legacy
                  menu-mode records are not merged with choice-based or fixed-meal records.
                </span>
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
