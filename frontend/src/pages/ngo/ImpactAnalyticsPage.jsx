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
import { BarChart3, Info, TrendingUp } from "lucide-react";
import {
  getDonationStatusSummary,
  getNGOImpact,
  getRedistributionTrends,
} from "../../services/analytics.js";
import { getRedistributionSummary, listAllDonations } from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDate, formatNumber, formatQuantity, sumByUnit } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import MetricCard from "../../components/ui/MetricCard.jsx";
import ChartContainer from "../../components/ui/ChartContainer.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { TextInput } from "../../components/ui/Form.jsx";

function QuantityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="k-chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => <p key={entry.dataKey} style={{ color: entry.color }}>{entry.name}: {formatNumber(entry.value)}</p>)}
    </div>
  );
}

const EMPTY = { summary: null, statuses: null, trends: [], impact: [], donations: [] };

export default function ImpactAnalyticsPage() {
  const [data, setData] = useState(EMPTY);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [dateFilter, setDateFilter] = useState({ date_from: "", date_to: "" });
  const [appliedDates, setAppliedDates] = useState({ date_from: "", date_to: "" });

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = Object.fromEntries(Object.entries(appliedDates).filter(([, value]) => value));
    const requests = [
      ["summary", getRedistributionSummary(params)],
      ["statuses", getDonationStatusSummary(params)],
      ["trends", getRedistributionTrends({ ...params, granularity: "weekly" })],
      ["impact", getNGOImpact(params)],
      ["donations", listAllDonations()],
    ];
    Promise.allSettled(requests.map(([, request]) => request))
      .then((results) => {
        if (!active) return;
        const next = { ...EMPTY };
        const nextErrors = [];
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            nextErrors.push(`${requests[index][0]}: ${getErrorMessage(result.reason)}`);
            return;
          }
          const [key] = requests[index];
          if (key === "trends") next.trends = result.value.items ?? [];
          else if (key === "impact") next.impact = result.value.items ?? [];
          else if (key === "donations") next.donations = result.value;
          else next[key] = result.value;
        });
        setData(next);
        setErrors(nextErrors);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey, appliedDates]);

  const completedDonations = data.summary?.summary?.completed_donations;
  const received = sumByUnit(data.summary?.summary?.quantities, "received_quantity");
  const contributingKitchens = useMemo(() => {
    const names = new Set();
    for (const donation of data.donations) {
      const completedDate = String(donation.completed_at ?? "").slice(0, 10);
      if (
        donation.status === "COMPLETED"
        && (!appliedDates.date_from || completedDate >= appliedDates.date_from)
        && (!appliedDates.date_to || completedDate <= appliedDates.date_to)
        && (donation.items ?? []).some((item) => Number(item.received_servings) > 0)
      ) {
        names.add(donation.kitchen_name);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [data.donations, appliedDates]);
  const statusChart = Object.entries(data.statuses?.statuses ?? {}).map(([status, count]) => ({
    status: status.replaceAll("_", " "),
    count,
  }));
  const trendData = useMemo(() => {
    const totals = new Map();
    for (const period of data.trends) {
      const key = period.date;
      const row = totals.get(key) ?? { date: key, serving: 0, piece: 0 };
      for (const quantity of period.quantities ?? []) {
        if (quantity.serving_unit === "serving") row.serving += Number(quantity.received_quantity) || 0;
        if (quantity.serving_unit === "piece") row.piece += Number(quantity.received_quantity) || 0;
      }
      totals.set(key, row);
    }
    return [...totals.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((row) => ({
      ...row,
      date: formatDate(row.date),
    }));
  }, [data.trends]);

  function applyDates(event) {
    event.preventDefault();
    if (dateFilter.date_from && dateFilter.date_to && dateFilter.date_from > dateFilter.date_to) {
      setErrors(["The start date must be on or before the end date."]);
      return;
    }
    setAppliedDates(dateFilter);
    setErrors([]);
  }

  return (
    <>
      <PageHeader
        eyebrow="NGO INSIGHTS"
        title="Impact analytics"
        description="Confirmed receipt quantities and completed donations from your organization’s redistribution activity."
      />
      <Card>
        <form className="k-filter-bar" onSubmit={applyDates}>
          <div className="k-filter-grid">
            <TextInput label="Activity date from" type="date" value={dateFilter.date_from} onChange={(event) => setDateFilter((current) => ({ ...current, date_from: event.target.value }))} />
            <TextInput label="Activity date to" type="date" value={dateFilter.date_to} onChange={(event) => setDateFilter((current) => ({ ...current, date_to: event.target.value }))} />
          </div>
          <div className="k-filter-actions">
            <span className="k-muted-text">Offer counts use creation dates; receipt quantities use completion dates.</span>
            <Button type="submit" icon={BarChart3}>Apply dates</Button>
          </div>
        </form>
      </Card>
      {loading ? <LoadingSkeleton variant="page" /> : errors.length ? (
        <div className="k-callout k-callout-warning" role="status">
          <Info size={17} aria-hidden="true" />
          <div>
            <strong>Some analytics could not be loaded</strong>
            <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
            <Button size="sm" variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>Retry</Button>
          </div>
        </div>
      ) : null}
      {!loading ? (
        <>
          <div className="k-metric-grid">
            <MetricCard label="Completed donations" value={completedDonations === undefined ? "Unavailable" : formatNumber(completedDonations, 0)} hint="Offers with confirmed receipt" icon={TrendingUp} tone="success" />
            <MetricCard label="Servings received" value={errors.some((error) => error.startsWith("summary:")) ? "Unavailable" : formatQuantity(received.serving, "serving")} hint="Confirmed quantities; servings only" icon={BarChart3} />
            <MetricCard label="Pieces received" value={errors.some((error) => error.startsWith("summary:")) ? "Unavailable" : formatQuantity(received.piece, "piece")} hint="Confirmed quantities; pieces only" icon={BarChart3} />
            <MetricCard label="Contributing kitchens" value={errors.some((error) => error.startsWith("donations:")) ? "Unavailable" : formatNumber(contributingKitchens.length, 0)} hint="Kitchens with a completed donation and positive receipt" icon={TrendingUp} />
          </div>
          {errors.length ? null : (
            <div className="k-callout k-callout-info">
              <Info size={17} aria-hidden="true" />
              <div><strong>Measured impact only</strong><p>No people-fed counts, food-weight conversions or carbon savings are estimated. Quantities come from completed, inspected receipts.</p></div>
            </div>
          )}
          <div className="k-chart-grid">
            <ChartContainer title="Donation status" subtitle="Offers in the selected date range, grouped by current backend status." empty={!statusChart.length} emptyDescription="No donation status data is available for this period.">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={statusChart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                  <XAxis dataKey="status" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={55} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [formatNumber(value, 0), "Offers"]} />
                  <Bar dataKey="count" name="Offers" fill="#397251" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
            <ChartContainer title="Completed donation trend" subtitle="Weekly receipt quantities, separated by unit." empty={!trendData.length} emptyDescription="No completed receipt quantities are available for this period.">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<QuantityTooltip />} />
                  <Line type="monotone" dataKey="serving" name="Servings" stroke="#397251" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="piece" name="Pieces" stroke="#c28a47" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
          <Card>
            <CardHeader icon={BarChart3} title="Contributing kitchens" subtitle="Kitchens represented by completed offers with positive quantities received." />
            <div className="k-card-body">
              {errors.some((error) => error.startsWith("donations:")) ? <ErrorState message={errors.find((error) => error.startsWith("donations:"))} onRetry={() => setReloadKey((key) => key + 1)} /> : contributingKitchens.length ? (
                <ul className="k-portal-simple-list">{contributingKitchens.map((name) => <li key={name}>{name}</li>)}</ul>
              ) : <EmptyState icon={BarChart3} title="No completed receipts yet" description="Contributing kitchens will appear after donations have positive received quantities confirmed." />}
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}
