import { useEffect, useMemo, useState } from "react";
import { Building2, HandHeart, PackageCheck, Truck, Users } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { listAdminOrganizations } from "../../services/admin.js";
import { getRedistributionTrends } from "../../services/analytics.js";
import { getRedistributionSummary, listAllDeliveries, listAllDonations } from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDate, formatNumber } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import MetricCard from "../../components/ui/MetricCard.jsx";
import ChartContainer from "../../components/ui/ChartContainer.jsx";
import { LoadingSkeleton } from "../../components/ui/States.jsx";

const empty = { kitchens: null, ngos: null, pendingKitchens: null, pendingNGOs: null, verifiedKitchens: null, verifiedNGOs: null, summary: null, trends: [], deliveries: [], donations: [] };

export default function AdminDashboardPage() {
  const [data, setData] = useState(empty);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const orgCount = (type, verification_status) => listAdminOrganizations(type, { limit: 1, offset: 0, verification_status });
    const requests = [
      ["kitchens", orgCount("kitchens")],
      ["ngos", orgCount("ngos")],
      ["pendingKitchens", orgCount("kitchens", "PENDING")],
      ["pendingNGOs", orgCount("ngos", "PENDING")],
      ["verifiedKitchens", orgCount("kitchens", "VERIFIED")],
      ["verifiedNGOs", orgCount("ngos", "VERIFIED")],
      ["summary", getRedistributionSummary()],
      ["trends", getRedistributionTrends({ granularity: "weekly" })],
      ["deliveries", listAllDeliveries()],
      ["donations", listAllDonations()],
    ];
    Promise.allSettled(requests.map(([, request]) => request))
      .then((results) => {
        if (!active) return;
        const next = { ...empty };
        const nextErrors = [];
        results.forEach((result, index) => {
          const [key] = requests[index];
          if (result.status === "rejected") nextErrors.push(`${key}: ${getErrorMessage(result.reason)}`);
          else if (key === "trends") next.trends = result.value.items ?? [];
          else next[key] = result.value;
        });
        setData(next);
        setErrors(nextErrors);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const trendData = useMemo(() => data.trends.map((period) => {
    const totals = { serving: 0, piece: 0 };
    for (const item of period.quantities ?? []) {
      if (item.serving_unit === "serving") totals.serving += Number(item.received_quantity) || 0;
      if (item.serving_unit === "piece") totals.piece += Number(item.received_quantity) || 0;
    }
    return { date: formatDate(period.date), ...totals };
  }), [data.trends]);
  const summary = data.summary?.summary;
  const donationIds = new Set(data.donations.filter((donation) => donation.is_simulated === summary?.is_simulated).map((donation) => donation.id));
  const activeDeliveryCount = data.deliveries.filter((delivery) => donationIds.has(delivery.donation_id) && ["ASSIGNED", "IN_TRANSIT"].includes(delivery.status)).length;
  const pendingCount = (data.pendingKitchens?.total ?? 0) + (data.pendingNGOs?.total ?? 0);
  const verifiedCount = (data.verifiedKitchens?.total ?? 0) + (data.verifiedNGOs?.total ?? 0);
  const labels = {
    kitchens: "registered kitchens",
    ngos: "registered NGOs",
    pendingKitchens: "pending kitchen verification",
    pendingNGOs: "pending NGO verification",
    verifiedKitchens: "verified kitchens",
    verifiedNGOs: "verified NGOs",
    summary: "donation analytics",
    trends: "redistribution trends",
    deliveries: "delivery assignments",
    donations: "donations",
  };

  return (
    <>
      <PageHeader eyebrow="PLATFORM OVERVIEW" title="Admin dashboard" description="Monitor organization verification and redistribution activity from live platform data." actions={<Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>Refresh data</Button>} />
      {loading ? <LoadingSkeleton variant="page" /> : (
        <>
          {errors.length ? (
            <div className="k-callout k-callout-warning">
              <div><strong>Some platform data could not be loaded</strong><ul>{errors.map((error) => <li key={error}>{labels[error.split(":")[0]] ?? error}</li>)}</ul><Button size="sm" variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>Retry</Button></div>
            </div>
          ) : null}
          <div className="k-metric-grid k-portal-metrics">
            <MetricCard label="Registered kitchens" value={data.kitchens ? formatNumber(data.kitchens.total, 0) : "Unavailable"} hint={errors.find((error) => error.startsWith("kitchens:")) ?? "All registered kitchens"} icon={Building2} />
            <MetricCard label="Registered NGOs" value={data.ngos ? formatNumber(data.ngos.total, 0) : "Unavailable"} hint={errors.find((error) => error.startsWith("ngos:")) ?? "All registered NGOs"} icon={HandHeart} />
            <MetricCard label="Pending verification" value={data.pendingKitchens && data.pendingNGOs ? formatNumber(pendingCount, 0) : "Unavailable"} hint="Kitchens and NGOs awaiting review" icon={Users} tone="warning" />
            <MetricCard label="Verified organizations" value={data.verifiedKitchens && data.verifiedNGOs ? formatNumber(verifiedCount, 0) : "Unavailable"} hint="Kitchens and NGOs approved" icon={PackageCheck} tone="success" />
            <MetricCard label="Total donations" value={summary ? formatNumber(summary.total_donation_offers, 0) : "Unavailable"} hint="Backend donation offer count" icon={HandHeart} />
            <MetricCard label="Active deliveries" value={errors.some((error) => error.startsWith("deliveries:") || error.startsWith("donations:") || error.startsWith("summary:")) ? "Unavailable" : formatNumber(activeDeliveryCount, 0)} hint="Assigned or in transit in the selected backend environment" icon={Truck} />
            <MetricCard label="Completed donations" value={summary ? formatNumber(summary.completed_donations, 0) : "Unavailable"} hint="Receipt confirmed" icon={PackageCheck} tone="success" />
          </div>
          <ChartContainer title="Redistribution trends" subtitle="Weekly quantities recorded on completed receipts. Units are not converted." empty={!trendData.length} emptyDescription="No completed receipt quantities are available yet.">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--k-line)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value, name) => [`${formatNumber(value)} ${name === "Servings" ? "servings" : "pieces"}`, name]} />
                <Line type="monotone" dataKey="serving" name="Servings" stroke="#397251" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="piece" name="Pieces" stroke="#c28a47" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </>
      )}
    </>
  );
}
