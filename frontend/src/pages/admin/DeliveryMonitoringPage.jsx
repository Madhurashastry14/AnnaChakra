import { useEffect, useMemo, useState } from "react";
import { Truck } from "lucide-react";
import { listAllDeliveries, listAllDonations } from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDateTime, formatQuantity, labelFor } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { SelectInput, TextInput } from "../../components/ui/Form.jsx";

const DELIVERY_STATUSES = ["ASSIGNED", "IN_TRANSIT", "DELIVERED", "CANCELLED"];

function tone(status) {
  if (status === "DELIVERED") return "success";
  if (status === "CANCELLED") return "danger";
  return "info";
}

export default function DeliveryMonitoringPage() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ status: "", kitchen_id: "", ngo_id: "", date_from: "", date_to: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([listAllDeliveries(), listAllDonations()])
      .then(([deliveries, donations]) => {
        if (!active) return;
        const byId = new Map(donations.map((donation) => [donation.id, donation]));
        setRows(deliveries.map((delivery) => ({ delivery, donation: byId.get(delivery.donation_id) })));
      })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError, "We couldn’t load platform deliveries.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const filtered = useMemo(() => rows.filter(({ delivery, donation }) => {
    if (!donation) return false;
    if (filters.status && delivery.status !== filters.status) return false;
    if (filters.kitchen_id && String(donation.kitchen_id) !== filters.kitchen_id) return false;
    if (filters.ngo_id && String(donation.ngo_id) !== filters.ngo_id) return false;
    const assigned = delivery.assigned_at ? String(delivery.assigned_at).slice(0, 10) : "";
    if (filters.date_from && (!assigned || assigned < filters.date_from)) return false;
    if (filters.date_to && (!assigned || assigned > filters.date_to)) return false;
    return true;
  }), [rows, filters]);

  return (
    <>
      <PageHeader eyebrow="PLATFORM REDISTRIBUTION" title="Delivery monitoring" description="Read-only delivery status, assigned personnel and recorded timestamps. Location is not tracked live." actions={<Button variant="secondary" icon={Truck} onClick={() => setReloadKey((key) => key + 1)}>Refresh</Button>} />
      <Card>
        <div className="k-filter-bar">
          <div className="k-filter-grid">
            <SelectInput label="Delivery status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} placeholder="All statuses" options={DELIVERY_STATUSES.map((status) => ({ value: status, label: labelFor(status) }))} />
            <TextInput label="Kitchen ID" type="number" min="1" value={filters.kitchen_id} onChange={(event) => setFilters((current) => ({ ...current, kitchen_id: event.target.value }))} />
            <TextInput label="NGO ID" type="number" min="1" value={filters.ngo_id} onChange={(event) => setFilters((current) => ({ ...current, ngo_id: event.target.value }))} />
            <TextInput label="Assigned from" type="date" value={filters.date_from} onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))} />
            <TextInput label="Assigned to" type="date" value={filters.date_to} onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))} />
          </div>
          <p className="k-muted-text">Delivery list has no server filters; these filters apply to the authorized records returned by the API.</p>
        </div>
        <div className="k-card-body">
          {loading ? <LoadingSkeleton rows={5} /> : error ? <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} /> : filtered.length ? (
            <div className="k-portal-list">
              {filtered.map(({ delivery, donation }) => (
                <article className="k-portal-list-item" key={delivery.id}>
                  <div className="k-redistribution-batch-heading">
                    <div><h3>Donation #{delivery.donation_id} · {donation.kitchen_name} → {donation.ngo_name}</h3><p>{(donation.items ?? []).map((item) => `${item.food_name} · ${formatQuantity(item.offered_servings, item.serving_unit)}`).join(", ")}</p></div>
                    <Badge tone={donation.failed_at ? "danger" : tone(delivery.status)}>{donation.failed_at ? "Failed" : labelFor(delivery.status)}</Badge>
                  </div>
                  <dl className="k-redistribution-facts">
                    <div><dt>Delivery person</dt><dd>{delivery.delivery_person_name || "Not provided"}</dd></div>
                    <div><dt>Assigned</dt><dd>{delivery.assigned_at ? formatDateTime(delivery.assigned_at) : "—"}</dd></div>
                    <div><dt>Dispatched</dt><dd>{delivery.dispatched_at ? formatDateTime(delivery.dispatched_at) : "—"}</dd></div>
                    <div><dt>Delivered</dt><dd>{delivery.delivered_at ? formatDateTime(delivery.delivered_at) : "—"}</dd></div>
                    <div><dt>Donation status</dt><dd>{labelFor(donation.status)}</dd></div>
                  </dl>
                  {delivery.notes ? <p className="k-portal-notes"><strong>Instructions:</strong> {delivery.notes}</p> : null}
                  {donation.failure_reason ? <p className="k-callout k-callout-warning"><strong>Delivery failure:</strong> {donation.failure_reason}{donation.failed_at ? ` · ${formatDateTime(donation.failed_at)}` : ""}</p> : null}
                  {donation.is_simulated ? <span className="k-demo-label">Simulated demo transaction</span> : null}
                </article>
              ))}
            </div>
          ) : <EmptyState icon={Truck} title="No deliveries found" description="No delivery records match these filters." />}
        </div>
      </Card>
    </>
  );
}
