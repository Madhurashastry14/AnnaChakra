import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Building2, Info, Truck } from "lucide-react";
import {
  getDonationStatusSummary,
  getNGOImpact,
  getRedistributionTrends,
} from "../../services/analytics.js";
import { getRedistributionSummary, listAllDeliveries, listAllDonations } from "../../services/redistribution.js";
import { listFoodItems } from "../../services/foodItems.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDate, formatNumber } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card } from "../../components/ui/Card.jsx";
import MetricCard from "../../components/ui/MetricCard.jsx";
import ChartContainer from "../../components/ui/ChartContainer.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { SelectInput } from "../../components/ui/Form.jsx";

const EMPTY = { summary: null, statuses: null, trends: [], impact: [], donations: [], deliveries: [], foods: [] };

function sumUnitRows(rows) {
  const totals = { serving: 0, piece: 0 };
  for (const row of rows ?? []) {
    if (row.serving_unit === "serving") totals.serving += Number(row.received_quantity) || 0;
    if (row.serving_unit === "piece") totals.piece += Number(row.received_quantity) || 0;
  }
  return totals;
}

export default function PlatformAnalyticsPage() {
  const [data, setData] = useState(EMPTY);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [simulated, setSimulated] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = simulated === "" ? {} : { simulated: simulated === "true" };
    const requests = [
      ["summary", getRedistributionSummary(params)],
      ["statuses", getDonationStatusSummary(params)],
      ["trends", getRedistributionTrends({ ...params, granularity: "weekly" })],
      ["impact", getNGOImpact(params)],
      ["donations", listAllDonations()],
      ["deliveries", listAllDeliveries()],
      ["foods", fetchAllFoods()],
    ];
    Promise.allSettled(requests.map(([, request]) => request))
      .then((results) => {
        if (!active) return;
        const next = { ...EMPTY };
        const nextErrors = [];
        results.forEach((result, index) => {
          const [key] = requests[index];
          if (result.status === "rejected") {
            nextErrors.push(`${key}: ${getErrorMessage(result.reason)}`);
            return;
          }
          if (key === "trends") next.trends = result.value.items ?? [];
          else if (key === "impact") next.impact = result.value.items ?? [];
          else next[key] = result.value;
        });
        setData(next);
        setErrors(nextErrors);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey, simulated]);

  const summary = data.summary?.summary;
  const effectiveSimulation = summary?.is_simulated;
  const donations = useMemo(
    () => effectiveSimulation === undefined ? [] : data.donations.filter((donation) => donation.is_simulated === effectiveSimulation),
    [data.donations, effectiveSimulation],
  );
  const donationIds = new Set(donations.map((donation) => donation.id));
  const scopedDeliveries = data.deliveries.filter((delivery) => donationIds.has(delivery.donation_id));
  const completedDonations = donations.filter((donation) => (
    donation.status === "COMPLETED" && (donation.items ?? []).some((item) => Number(item.received_servings) > 0)
  ));
  const participatingKitchens = new Set(completedDonations.map((donation) => donation.kitchen_id)).size;
  const activeDeliveryCount = scopedDeliveries.filter((delivery) => ["ASSIGNED", "IN_TRANSIT"].includes(delivery.status)).length;
  const deliveryStatusChart = Object.entries(scopedDeliveries.reduce((counts, delivery) => {
    counts[delivery.status] = (counts[delivery.status] ?? 0) + 1;
    return counts;
  }, {})).map(([status, count]) => ({ status: status.replaceAll("_", " "), count }));
  const statusChart = Object.entries(data.statuses?.statuses ?? {}).map(([status, count]) => ({ status: status.replaceAll("_", " "), count }));
  const trendChart = data.trends.map((period) => ({ date: formatDate(period.date), ...sumUnitRows(period.quantities) }));
  const categoryChart = useMemo(() => {
    const catalog = new Map(data.foods.map((food) => [food.id, food]));
    const categories = new Map();
    for (const row of summary?.quantities ?? []) {
      const food = catalog.get(row.food_item_id);
      const category = food?.category ?? "Category unavailable";
      const total = categories.get(category) ?? { category, serving: 0, piece: 0 };
      if (row.serving_unit === "serving") total.serving += Number(row.received_quantity) || 0;
      if (row.serving_unit === "piece") total.piece += Number(row.received_quantity) || 0;
      categories.set(category, total);
    }
    return [...categories.values()].sort((a, b) => a.category.localeCompare(b.category));
  }, [data.foods, summary]);

  return (
    <>
      <PageHeader
        eyebrow="PLATFORM INSIGHTS"
        title="Platform analytics"
        description="Read platform redistribution, receipt quantities, delivery progress and participating organizations."
        actions={<Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>Refresh data</Button>}
      />
      <Card className="k-analytics-filter-card">
        <SelectInput
          label="Transaction environment"
          value={simulated}
          onChange={(event) => setSimulated(event.target.value)}
          options={[
            { value: "", label: "Backend default" },
            { value: "true", label: "Simulated demo only" },
            { value: "false", label: "Non-simulated only" },
          ]}
        />
        <p className="k-muted-text">Analytics use backend environment filters. Donation and delivery detail lists are restricted to the same environment in this view.</p>
      </Card>
      {loading ? <LoadingSkeleton variant="page" /> : (
        <>
          {errors.length ? (
            <div className="k-callout k-callout-warning">
              <Info size={17} aria-hidden="true" />
              <div><strong>Some platform analytics could not be loaded</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul><Button size="sm" variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>Retry</Button></div>
            </div>
          ) : null}
          {summary?.is_simulated ? <div className="k-callout k-callout-warning"><Info size={17} aria-hidden="true" /><div><strong>Simulated demo transactions</strong><p>These analytics are scoped to the backend’s simulated demo environment.</p></div></div> : null}
          <div className="k-metric-grid k-portal-metrics">
            <MetricCard label="Total donation offers" value={summary ? formatNumber(summary.total_donation_offers, 0) : "Unavailable"} hint="Backend-reported offers in the selected environment" icon={BarChart3} />
            <MetricCard label="Completed donations" value={summary ? formatNumber(summary.completed_donations, 0) : "Unavailable"} hint="Receipt confirmed" icon={BarChart3} tone="success" />
            <MetricCard label="Average delivery duration" value={summary?.average_delivery_minutes === null || summary?.average_delivery_minutes === undefined ? "—" : `${formatNumber(summary.average_delivery_minutes)} min`} hint="Recorded dispatch-to-delivery duration" icon={Truck} />
            <MetricCard label="Active deliveries" value={errors.some((error) => ["deliveries:", "donations:", "summary:"].some((prefix) => error.startsWith(prefix))) ? "Unavailable" : formatNumber(activeDeliveryCount, 0)} hint="Assigned or in transit in the selected backend environment" icon={Truck} />
            <MetricCard label="Participating kitchens" value={errors.some((error) => error.startsWith("donations:") || error.startsWith("summary:")) ? "Unavailable" : formatNumber(participatingKitchens, 0)} hint="Kitchens with positive received quantities on completed donations" icon={Building2} />
            <MetricCard label="Participating NGOs" value={errors.some((error) => error.startsWith("impact:")) ? "Unavailable" : formatNumber(data.impact.length, 0)} hint="NGOs with completed receipts in analytics" icon={Building2} />
          </div>
          <div className="k-callout k-callout-info"><Info size={17} aria-hidden="true" /><div><strong>Reported quantities only</strong><p>Servings and pieces remain separate. No people-fed counts, food-weight conversions or carbon savings are calculated.</p></div></div>
          <div className="k-chart-grid">
            <ChartContainer title="Donation status distribution" subtitle="Current backend donation statuses for the selected environment." empty={!statusChart.length} emptyDescription="No donation status data is available.">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={statusChart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                  <XAxis dataKey="status" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={55} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Donations" fill="#397251" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
            <ChartContainer title="Completed donation trend" subtitle="Weekly received quantities, separated by unit." empty={!trendChart.length} emptyDescription="No positive completed receipt quantities are available.">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendChart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value, name) => [`${formatNumber(value)} ${name === "Servings" ? "servings" : "pieces"}`, name]} />
                  <Line type="monotone" dataKey="serving" name="Servings" stroke="#397251" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="piece" name="Pieces" stroke="#c28a47" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
            <ChartContainer title="Food redistributed by category" subtitle="Categories from the authenticated food catalogue; bars are separate units." empty={!categoryChart.length} emptyDescription="No received quantities or catalogue categories are available.">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={categoryChart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                  <XAxis dataKey="category" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={55} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value, name) => [`${formatNumber(value)} ${name === "Servings" ? "servings" : "pieces"}`, name]} />
                  <Bar dataKey="serving" name="Servings" fill="#397251" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="piece" name="Pieces" fill="#c28a47" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
            <ChartContainer title="Delivery performance" subtitle="Recorded current delivery assignment statuses." empty={!deliveryStatusChart.length} emptyDescription="No delivery records are available.">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={deliveryStatusChart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                  <XAxis dataKey="status" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={55} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Deliveries" fill="#5a8194" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
          {errors.some((error) => error.startsWith("foods:")) ? <Card><div className="k-card-body"><ErrorState title="Food categories unavailable" message={errors.find((error) => error.startsWith("foods:"))} /></div></Card> : null}
          {!data.impact.length && !errors.some((error) => error.startsWith("impact:")) ? <EmptyState title="No participating NGOs yet" description="NGOs with completed, positive receipts will appear in platform impact analytics." /> : null}
        </>
      )}
    </>
  );
}

async function fetchAllFoods() {
  const rows = [];
  for (let offset = 0; ; offset += 100) {
    const page = await listFoodItems({ limit: 100, offset });
    rows.push(...(page.items ?? []));
    if (rows.length >= (page.total ?? 0) || (page.items ?? []).length < 100) return rows;
  }
}
