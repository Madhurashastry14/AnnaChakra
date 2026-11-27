import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Clock3,
  Leaf,
  Plus,
  ScanLine,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Users,
  Utensils,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useKitchen } from "../../components/kitchen/KitchenLayout.jsx";
import { listForecasts } from "../../services/forecasts.js";
import { listMealRecords } from "../../services/mealRecords.js";
import { listWasteLogs } from "../../services/wasteLogs.js";
import { getWasteInsights, getWasteSummary } from "../../services/analytics.js";
import { getErrorMessage } from "../../utils/errors.js";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatQuantity,
  groupBy,
  mealTypeLabel,
  menuModeLabel,
  percent,
  sumByUnit,
  todayISO,
  truncate,
  wasteTypeLabel,
  weightedRate,
} from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import MetricCard from "../../components/ui/MetricCard.jsx";
import ChartContainer from "../../components/ui/ChartContainer.jsx";
import InsightCard from "../../components/ui/InsightCard.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { EmptyState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { SafetyBadge, VerificationBadge } from "../../components/ui/Badge.jsx";

const MEAL_ORDER = { BREAKFAST: 0, LUNCH: 1, DINNER: 2 };

function hasNumeric(rows, field) {
  return (rows ?? []).some((row) => row?.[field] !== null && row?.[field] !== undefined);
}

function aggregateByFood(rows) {
  const groups = groupBy(rows ?? [], (row) => row.food_item_id);
  return [...groups.values()]
    .map((group) => ({
      name: truncate(group[0].food_item_name, 18),
      fullName: group[0].food_item_name,
      overproduction: weightedRate(group, "overproduction_rate"),
      plateWaste: weightedRate(group, "plate_waste_rate"),
      acceptance: weightedRate(group, "food_acceptance_rate"),
      records: group.reduce((total, row) => total + (row.records_analyzed ?? 0), 0),
    }))
    .filter(
      (row) =>
        row.overproduction !== null || row.plateWaste !== null || row.acceptance !== null,
    );
}

function RateTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="k-chart-tooltip">
      <strong>{payload[0]?.payload?.fullName ?? label}</strong>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.value === null || entry.value === undefined ? "—" : `${Number(entry.value).toFixed(1)}%`}
        </p>
      ))}
    </div>
  );
}

export default function KitchenDashboardPage() {
  const { kitchen } = useKitchen();
  const [data, setData] = useState({
    forecasts: [],
    meals: [],
    waste: [],
    summary: [],
    insights: [],
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      const requests = [
        ["forecasts", listForecasts()],
        ["meals", listMealRecords()],
        ["waste", listWasteLogs({ limit: 5 })],
        ["summary", getWasteSummary()],
        ["insights", getWasteInsights()],
      ];
      const results = await Promise.allSettled(requests.map(([, request]) => request));
      if (!active) return;

      const nextData = { forecasts: [], meals: [], waste: [], summary: [], insights: [] };
      const nextErrors = {};

      results.forEach((result, index) => {
        const key = requests[index][0];
        if (result.status === "fulfilled") {
          if (key === "insights") nextData.insights = result.value?.insights ?? [];
          else nextData[key] = Array.isArray(result.value) ? result.value : [];
        } else {
          nextErrors[key] = getErrorMessage(result.reason);
        }
      });

      setData(nextData);
      setErrors(nextErrors);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const today = todayISO();

  const upcoming = useMemo(() => {
    return [...data.forecasts]
      .filter((forecast) => forecast.meal_date >= today)
      .sort(
        (left, right) =>
          left.meal_date.localeCompare(right.meal_date) ||
          (MEAL_ORDER[left.meal_type] ?? 0) - (MEAL_ORDER[right.meal_type] ?? 0) ||
          left.id - right.id,
      )[0];
  }, [data.forecasts, today]);

  const recentForecasts = useMemo(
    () =>
      [...data.forecasts]
        .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
        .slice(0, 4),
    [data.forecasts],
  );

  const recentMeals = data.meals.slice(0, 4);
  const recentWaste = data.waste.slice(0, 4);
  const summary = data.summary;

  const unserved = sumByUnit(summary, "total_unserved");
  const plateWaste = sumByUnit(summary, "total_plate_waste");
  const acceptanceRate = weightedRate(summary, "food_acceptance_rate");
  const overproductionRate = weightedRate(summary, "overproduction_rate");
  const plateWasteRate = weightedRate(summary, "plate_waste_rate");
  const measurementCoverage = weightedRate(
    summary,
    "plate_waste_measurement_coverage",
    "records_analyzed",
  );
  const totalObservations = summary.reduce(
    (total, row) => total + (row.records_analyzed ?? 0),
    0,
  );

  const chartData = useMemo(() => aggregateByFood(summary), [summary]);
  const acceptanceData = useMemo(
    () => chartData.filter((row) => row.acceptance !== null),
    [chartData],
  );
  const wasteChartData = useMemo(
    () =>
      chartData.filter(
        (row) => row.overproduction !== null || row.plateWaste !== null,
      ),
    [chartData],
  );

  const failedSections = Object.entries(errors).map(([key]) => {
    const names = {
      forecasts: "forecasts",
      meals: "meal records",
      waste: "waste logs",
      summary: "waste analytics",
      insights: "waste insights",
    };
    return names[key] ?? key;
  });

  if (loading) {
    return (
      <>
        <PageHeader
          eyebrow="KITCHEN OVERVIEW"
          title={`Welcome, ${kitchen.name}`}
          description="A live view of forecasts, meal service and waste performance."
        />
        <LoadingSkeleton variant="page" />
      </>
    );
  }

  const quickActions = [
    { to: "/kitchen/forecast", label: "Plan a meal", icon: TrendingUp },
    { to: "/kitchen/meal-records/new", label: "Record meal feedback", icon: ClipboardList },
    { to: "/kitchen/scanner", label: "Scan food", icon: ScanLine },
    { to: "/kitchen/waste-logs/new", label: "Log waste", icon: Trash2 },
  ];

  return (
    <>
      <PageHeader
        eyebrow="KITCHEN OVERVIEW"
        title={`Welcome, ${kitchen.name}`}
        description="A live view of forecasts, meal service and waste performance. Every figure comes from your kitchen’s records."
        actions={
          <Button to="/kitchen/forecast" icon={TrendingUp}>
            Plan a meal
          </Button>
        }
      />

      {failedSections.length > 0 ? (
        <div className="k-callout k-callout-warning">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <h3>Some dashboard data could not load</h3>
            <p>{failedSections.join(", ")}. The remaining sections use live data.</p>
            <Button size="sm" variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      <div className="k-dashboard-top-grid">
        <Card className="k-upcoming-card">
          <CardHeader
            icon={CalendarDays}
            title="Upcoming meal"
            subtitle="The next forecast saved for today or later."
            action={<Button size="sm" variant="ghost" to="/kitchen/forecasts">All forecasts <ArrowRight size={14} /></Button>}
          />
          {upcoming ? (
            <div className="k-card-body">
              <div className="k-upcoming-heading">
                <div>
                  <p className="k-eyebrow">NEXT FORECAST</p>
                  <h2>{mealTypeLabel(upcoming.meal_type)} · {formatDate(upcoming.meal_date)}</h2>
                  <p>{menuModeLabel(upcoming.menu_mode)} · Forecast #{upcoming.id}</p>
                </div>
                <span className="k-upcoming-diners">
                  <Users size={17} aria-hidden="true" />
                  <strong>{formatNumber(upcoming.expected_people)}</strong>
                  <small>expected diners</small>
                </span>
              </div>
              <div className="k-upcoming-dishes">
                {(upcoming.items ?? []).slice(0, 5).map((item) => (
                  <span className="k-inline-chip" key={item.food_item_id}>{item.name}</span>
                ))}
                {(upcoming.items?.length ?? 0) > 5 ? (
                  <span className="k-muted-text">+{upcoming.items.length - 5} more</span>
                ) : null}
              </div>
              <div className="k-upcoming-actions">
                <Button size="sm" to={`/kitchen/forecasts/${upcoming.id}`}>View forecast</Button>
                <Button
                  size="sm"
                  variant="secondary"
                  to={`/kitchen/meal-records/new?forecast_id=${upcoming.id}`}
                >
                  Record feedback
                </Button>
              </div>
            </div>
          ) : (
            <div className="k-card-body">
              <EmptyState
                icon={CalendarDays}
                title="No upcoming forecast"
                description={
                  errors.forecasts
                    ? errors.forecasts
                    : "Generate a demand forecast to plan the next meal service."
                }
                action={<Button size="sm" to="/kitchen/forecast" icon={TrendingUp}>Generate a forecast</Button>}
              />
            </div>
          )}
        </Card>

        <Card className="k-quick-card">
          <CardHeader
            icon={Plus}
            title="Quick actions"
            subtitle="Jump into the most common kitchen tasks."
          />
          <div className="k-card-body">
            <div className="k-quick-actions">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link className="k-quick-action" to={action.to} key={action.to}>
                    <span><Icon size={18} /></span>
                    {action.label}
                    <ArrowRight size={14} className="k-quick-arrow" />
                  </Link>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      <div className="k-metric-grid">
        <MetricCard
          label="Recorded meals"
          value={formatNumber(data.meals.length)}
          hint={data.meals.length === 1 ? "Meal feedback record" : "Meal feedback records"}
          icon={ClipboardList}
        />
        <MetricCard
          label="Unserved surplus"
          className="k-metric-unserved"
          value={
            summary.length === 0 ? "—" : (
              <span className="k-metric-split">
                <span>{formatQuantity(unserved.serving, "serving")}</span>
                <small>{formatQuantity(unserved.piece, "piece")}</small>
              </span>
            )
          }
          hint="Recorded across measured food items"
          icon={Utensils}
        />
        <MetricCard
          label="Plate waste"
          value={
            !hasNumeric(summary, "total_plate_waste") ? "Not measured" : (
              <span className="k-metric-split">
                {formatQuantity(plateWaste.serving, "serving")}
                <small>{formatQuantity(plateWaste.piece, "piece")}</small>
              </span>
            )
          }
          hint={`Coverage ${percent(measurementCoverage)} of measured records`}
          icon={Trash2}
        />
        <MetricCard
          label="Food acceptance"
          value={percent(acceptanceRate)}
          hint="Consumption-based proxy, weighted across measured records"
          icon={Leaf}
          tone="success"
        />
        <MetricCard
          label="Overproduction rate"
          value={percent(overproductionRate)}
          hint={`${formatNumber(totalObservations)} observations · plate waste ${percent(plateWasteRate)}`}
          icon={BarChart3}
          tone="warning"
        />
        <MetricCard
          label="Kitchen verification"
          value={<VerificationBadge status={kitchen.verification_status} />}
          hint={
            kitchen.verification_status === "VERIFIED"
              ? "Redistribution still depends on food safety screening."
              : "Forecasting and analytics are available; redistribution is restricted."
          }
          icon={ShieldCheck}
          tone={kitchen.verification_status === "VERIFIED" ? "success" : "warning"}
        />
      </div>

      <div className="k-chart-grid">
        <ChartContainer
          title="Waste overview"
          subtitle="Overproduction and plate-waste rates by food. Rates are unitless and never mix servings with pieces."
          empty={wasteChartData.length === 0}
          emptyDescription={
            errors.summary
              ? errors.summary
              : "Record meal feedback with unserved and plate-waste quantities to see this comparison."
          }
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={wasteChartData}
              layout="vertical"
              margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e9e1" />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
                tick={{ fontSize: 12, fill: "#66736b" }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={124}
                tick={{ fontSize: 12, fill: "#3d4a42" }}
              />
              <Tooltip content={<RateTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="overproduction" name="Overproduction" fill="#287d50" radius={[0, 4, 4, 0]} />
              <Bar dataKey="plateWaste" name="Plate waste" fill="#d09347" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Food acceptance"
          subtitle="Consumption-based proxy by food. This is not a direct measure of diner satisfaction."
          empty={acceptanceData.length === 0}
          emptyDescription={
            errors.summary
              ? errors.summary
              : "Plate-waste measurements are needed to calculate acceptance."
          }
          icon={Leaf}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={acceptanceData}
              layout="vertical"
              margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e9e1" />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
                tick={{ fontSize: 12, fill: "#66736b" }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={124}
                tick={{ fontSize: 12, fill: "#3d4a42" }}
              />
              <Tooltip content={<RateTooltip />} />
              <Bar dataKey="acceptance" name="Food acceptance" fill="#a8cf5a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      <div className="k-dashboard-lists">
        <Card>
          <CardHeader
            icon={Clock3}
            title="Recent forecasts"
            subtitle="Newest saved forecasts."
            action={<Button size="sm" variant="ghost" to="/kitchen/forecasts">View all <ArrowRight size={14} /></Button>}
          />
          <div className="k-card-body k-card-body-flush">
            <DataTable
              rows={recentForecasts}
              rowKey={(row) => row.id}
              columns={[
                { key: "date", label: "Meal date", render: (row) => formatDate(row.meal_date) },
                { key: "meal", label: "Meal", render: (row) => mealTypeLabel(row.meal_type) },
                {
                  key: "dishes",
                  label: "Dishes",
                  render: (row) => (
                    <span className="k-table-clip">{row.items?.map((item) => item.name).join(", ")}</span>
                  ),
                },
                { key: "expected", label: "Expected", render: (row) => formatNumber(row.expected_people) },
                {
                  key: "action",
                  label: "",
                  render: (row) => <Link className="k-table-link" to={`/kitchen/forecasts/${row.id}`}>View</Link>,
                },
              ]}
              empty={
                <EmptyState
                  icon={TrendingUp}
                  title="No forecasts yet"
                  description="Generate your first demand forecast to see it here."
                  action={<Button size="sm" to="/kitchen/forecast">Generate a forecast</Button>}
                  className="k-empty-compact"
                />
              }
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={ClipboardList}
            title="Recent meal records"
            subtitle="Actual service feedback."
            action={<Button size="sm" variant="ghost" to="/kitchen/meal-records">View all <ArrowRight size={14} /></Button>}
          />
          <div className="k-card-body k-card-body-flush">
            <DataTable
              rows={recentMeals}
              rowKey={(row) => row.id}
              columns={[
                { key: "date", label: "Meal date", render: (row) => formatDate(row.meal_date) },
                { key: "meal", label: "Meal", render: (row) => mealTypeLabel(row.meal_type) },
                { key: "people", label: "Attended", render: (row) => formatNumber(row.actual_people) },
                { key: "items", label: "Dishes", render: (row) => row.items?.length ?? 0 },
                {
                  key: "action",
                  label: "",
                  render: (row) => <Link className="k-table-link" to={`/kitchen/meal-records/${row.id}`}>View</Link>,
                },
              ]}
              empty={
                <EmptyState
                  icon={ClipboardList}
                  title="No meal records yet"
                  description="Record what was prepared, served and left over after a meal."
                  action={<Button size="sm" to="/kitchen/meal-records/new">Record a meal</Button>}
                  className="k-empty-compact"
                />
              }
            />
          </div>
        </Card>
      </div>

      <div className="k-dashboard-lists">
        <Card>
          <CardHeader
            icon={Trash2}
            title="Recent waste logs"
            subtitle="Newest logged surplus, plate waste and spoiled food."
            action={<Button size="sm" variant="ghost" to="/kitchen/waste-logs">View all <ArrowRight size={14} /></Button>}
          />
          <div className="k-card-body k-card-body-flush">
            <DataTable
              rows={recentWaste}
              rowKey={(row) => row.id}
              columns={[
                { key: "food", label: "Food", render: (row) => row.food_name },
                {
                  key: "quantity",
                  label: "Quantity",
                  render: (row) => formatQuantity(row.confirmed_servings, row.serving_unit),
                },
                { key: "type", label: "Type", render: (row) => wasteTypeLabel(row.waste_type) },
                { key: "safety", label: "Safety", render: (row) => <SafetyBadge status={row.safety_status} /> },
                { key: "created", label: "Logged", render: (row) => formatDateTime(row.created_at) },
                {
                  key: "action",
                  label: "",
                  render: (row) => <Link className="k-table-link" to={`/kitchen/waste-logs/${row.id}`}>View</Link>,
                },
              ]}
              empty={
                <EmptyState
                  icon={Trash2}
                  title="No waste logs yet"
                  description="Log surplus or plate waste to start building waste intelligence."
                  action={<Button size="sm" to="/kitchen/waste-logs/new">Log waste</Button>}
                  className="k-empty-compact"
                />
              }
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={ChefHat}
            title="Recent waste intelligence"
            subtitle="Backend-generated insights from recorded meals."
            action={<Button size="sm" variant="ghost" to="/kitchen/analytics">View all <ArrowRight size={14} /></Button>}
          />
          <div className="k-card-body">
            {data.insights.length > 0 ? (
              <div className="k-insight-stack">
                {data.insights.slice(0, 3).map((insight, index) => (
                  <InsightCard
                    key={`${insight.food_item_id}-${insight.insight_type}-${index}`}
                    insight={insight}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={BarChart3}
                title="No insights available"
                description={
                  errors.insights
                    ? errors.insights
                    : "Insights appear after enough meal records exist. The backend will say when history is insufficient."
                }
                action={<Button size="sm" variant="secondary" to="/kitchen/analytics">Open waste intelligence</Button>}
                className="k-empty-compact"
              />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
