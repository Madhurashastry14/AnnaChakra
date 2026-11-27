import { useEffect, useMemo, useState } from "react";
import { HandHeart } from "lucide-react";
import { listAllDonations } from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDateTime, formatQuantity, labelFor } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { SelectInput, TextInput } from "../../components/ui/Form.jsx";

const STATUSES = ["PENDING", "ACCEPTED", "ASSIGNED", "IN_TRANSIT", "DELIVERED", "COMPLETED", "REJECTED", "CANCELLED"];

function statusTone(status) {
  if (status === "COMPLETED" || status === "DELIVERED") return "success";
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  if (status === "PENDING") return "warning";
  return "info";
}

function quantities(items, field = "offered_servings") {
  const grouped = new Map();
  for (const item of items ?? []) grouped.set(item.serving_unit, (grouped.get(item.serving_unit) ?? 0) + Number(item[field] ?? 0));
  return [...grouped].map(([unit, amount]) => formatQuantity(amount, unit)).join(" · ") || "—";
}

export default function DonationMonitoringPage() {
  const [donations, setDonations] = useState([]);
  const [filters, setFilters] = useState({ status: "", date_from: "", date_to: "", kitchen_id: "", ngo_id: "" });
  const [applied, setApplied] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listAllDonations(applied)
      .then((rows) => { if (active) setDonations(rows); })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError, "We couldn’t load donations.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied, reloadKey]);

  const filtered = useMemo(() => donations, [donations]);

  function applyFilters(event) {
    event.preventDefault();
    setFilterError("");
    if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
      setFilterError("The start date must be on or before the end date.");
      return;
    }
    for (const key of ["kitchen_id", "ngo_id"]) {
      if (filters[key] && (!Number.isInteger(Number(filters[key])) || Number(filters[key]) < 1)) {
        setFilterError("Organization IDs must be positive whole numbers.");
        return;
      }
    }
    setApplied(Object.fromEntries(
      Object.entries(filters)
        .filter(([, value]) => value)
        .map(([key, value]) => [key, ["kitchen_id", "ngo_id"].includes(key) ? Number(value) : value]),
    ));
  }

  return (
    <>
      <PageHeader eyebrow="PLATFORM REDISTRIBUTION" title="Donation monitoring" description="Read-only view of offers, receipt quantities, backend status and recorded delivery progress." />
      <Card>
        <form className="k-filter-bar" onSubmit={applyFilters}>
          <div className="k-filter-grid">
            <SelectInput label="Donation status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} placeholder="All statuses" options={STATUSES.map((status) => ({ value: status, label: labelFor(status) }))} />
            <TextInput label="Offer date from" type="date" value={filters.date_from} onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))} />
            <TextInput label="Offer date to" type="date" value={filters.date_to} onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))} />
            <TextInput label="Kitchen ID" type="number" min="1" value={filters.kitchen_id} onChange={(event) => setFilters((current) => ({ ...current, kitchen_id: event.target.value }))} />
            <TextInput label="NGO ID" type="number" min="1" value={filters.ngo_id} onChange={(event) => setFilters((current) => ({ ...current, ngo_id: event.target.value }))} />
          </div>
          <div className="k-filter-actions"><span className="k-muted-text">Date range filters offer creation time.</span><Button type="submit">Apply filters</Button></div>
        </form>
        <div className="k-card-body">
          {filterError ? <p className="k-form-error" role="alert">{filterError}</p> : null}
          {loading ? <LoadingSkeleton rows={5} /> : error ? <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} /> : filtered.length ? (
            <div className="k-portal-list">
              {filtered.map((donation) => (
                <article className="k-portal-list-item" key={donation.id}>
                  <div className="k-redistribution-batch-heading">
                    <div><h3>Donation #{donation.id}</h3><p>{donation.kitchen_name} → {donation.ngo_name} · Offered {formatDateTime(donation.created_at)}</p></div>
                    <Badge tone={statusTone(donation.status)}>{donation.expired ? "Expired" : labelFor(donation.status)}</Badge>
                  </div>
                  <ul className="k-portal-food-list">
                    {(donation.items ?? []).map((item) => <li key={item.id}><span>{item.food_name}</span><strong>{formatQuantity(item.offered_servings, item.serving_unit)}</strong><small>{item.received_servings === null ? "Receipt pending" : `Received ${formatQuantity(item.received_servings, item.serving_unit)}`}</small></li>)}
                  </ul>
                  <dl className="k-redistribution-facts">
                    <div><dt>Kitchen</dt><dd>{donation.kitchen_name} · #{donation.kitchen_id}</dd></div>
                    <div><dt>NGO</dt><dd>{donation.ngo_name} · #{donation.ngo_id}</dd></div>
                    <div><dt>Quantity offered</dt><dd>{quantities(donation.items)}</dd></div>
                    <div><dt>Offer expiry</dt><dd>{donation.expires_at ? formatDateTime(donation.expires_at) : "Not provided"}</dd></div>
                    <div><dt>Accepted</dt><dd>{donation.accepted_at ? formatDateTime(donation.accepted_at) : "—"}</dd></div>
                    <div><dt>Completed</dt><dd>{donation.completed_at ? formatDateTime(donation.completed_at) : "—"}</dd></div>
                    {donation.delivery ? <div><dt>Delivery progress</dt><dd>{labelFor(donation.delivery.status)} · {donation.delivery.dispatched_at ? `Dispatched ${formatDateTime(donation.delivery.dispatched_at)}` : "Not dispatched"}{donation.delivery.delivered_at ? ` · Delivered ${formatDateTime(donation.delivery.delivered_at)}` : ""}</dd></div> : null}
                    {donation.failed_at ? <div><dt>Delivery failure</dt><dd>{donation.failure_reason || "Failure reported"} · {formatDateTime(donation.failed_at)}</dd></div> : null}
                    {donation.cancellation_reason && !donation.failed_at ? <div><dt>Cancellation</dt><dd>{donation.cancellation_reason}</dd></div> : null}
                  </dl>
                  <p className="k-muted-text k-ngo-safety-note">The donation listing does not expose individual food-batch safety deadlines. Backend safety checks remain authoritative.</p>
                  {donation.is_simulated ? <span className="k-demo-label">Demonstration data only. Not approved for actual consumption.</span> : null}
                </article>
              ))}
            </div>
          ) : <EmptyState icon={HandHeart} title="No donations found" description="Change the filters to see matching platform donations." />}
          {!loading && !error ? <div className="k-admin-result-footer"><span>{filtered.length} donations</span><Button size="sm" variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>Refresh</Button></div> : null}
        </div>
      </Card>
    </>
  );
}
