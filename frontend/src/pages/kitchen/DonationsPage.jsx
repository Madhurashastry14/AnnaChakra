import { useEffect, useMemo, useState } from "react";
import { HandHeart, Plus } from "lucide-react";
import { listAllDonations } from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDateTime, formatQuantity, labelFor } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";

const FILTERS = [
  ["ALL", "All donations"],
  ["PENDING", "Pending"],
  ["ACCEPTED", "Accepted"],
  ["ASSIGNED", "Assigned"],
  ["IN_TRANSIT", "In transit"],
  ["DELIVERED", "Delivered"],
  ["COMPLETED", "Completed"],
  ["REJECTED", "Rejected"],
  ["CANCELLED", "Cancelled"],
];

function donationQuantity(items) {
  const totals = new Map();
  for (const item of items ?? []) {
    const key = item.serving_unit;
    totals.set(key, (totals.get(key) ?? 0) + Number(item.offered_servings));
  }
  return [...totals].map(([unit, quantity]) => formatQuantity(quantity, unit)).join(" · ") || "—";
}

function statusTone(status) {
  if (status === "COMPLETED" || status === "DELIVERED") return "success";
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  if (status === "PENDING") return "warning";
  return "info";
}

export default function DonationsPage() {
  const [donations, setDonations] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listAllDonations()
      .then((rows) => { if (active) setDonations(rows); })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError, "We couldn’t load donations.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const filtered = useMemo(
    () => filter === "ALL" ? donations : donations.filter((donation) => donation.status === filter),
    [donations, filter],
  );

  return (
    <>
      <PageHeader
        eyebrow="REDISTRIBUTION"
        title="Donations"
        description="Track kitchen offers using the status recorded by the backend."
        actions={<Button to="/kitchen/surplus" icon={Plus}>Find an NGO</Button>}
      />
      <Card>
        <div className="k-redistribution-filter-row">
          <label className="k-field">
            <span className="k-label">Donation status</span>
            <select className="k-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
              {FILTERS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <span className="k-muted-text">{filtered.length} {filtered.length === 1 ? "donation" : "donations"}</span>
        </div>
        <div className="k-card-body k-card-body-flush">
          {loading ? <LoadingSkeleton variant="table" rows={6} /> : error ? (
            <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
          ) : (
            <DataTable
              rows={filtered}
              rowKey={(row) => row.id}
              columns={[
                {
                  key: "id",
                  label: "Donation",
                  render: (row) => <div className="k-table-primary"><strong>#{row.id}</strong>{row.is_simulated ? <small className="k-demo-label">Simulated demo</small> : null}</div>,
                },
                { key: "ngo", label: "NGO", render: (row) => row.ngo_name },
                {
                  key: "items",
                  label: "Food items",
                  render: (row) => (
                    <div className="k-table-primary">
                      <strong>{row.items?.map((item) => item.food_name).join(", ") || "—"}</strong>
                      <small>{donationQuantity(row.items)}</small>
                    </div>
                  ),
                },
                { key: "created", label: "Offer date", render: (row) => formatDateTime(row.created_at) },
                { key: "status", label: "Status", render: (row) => <Badge tone={statusTone(row.status)}>{labelFor(row.status)}</Badge> },
                { key: "action", label: "", render: (row) => <Button variant="ghost" size="sm" to={`/kitchen/donations/${row.id}`}>Details</Button> },
              ]}
              empty={
                <EmptyState
                  icon={HandHeart}
                  title={filter === "ALL" ? "No donation offers yet" : `No ${labelFor(filter).toLowerCase()} donations`}
                  description={filter === "ALL" ? "Eligible surplus can be matched with an NGO to start an offer." : "Offers with this status will appear here."}
                  action={filter === "ALL" ? <Button to="/kitchen/surplus">Review available surplus</Button> : null}
                />
              }
            />
          )}
        </div>
      </Card>
    </>
  );
}
