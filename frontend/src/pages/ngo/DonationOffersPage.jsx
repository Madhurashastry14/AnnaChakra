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

const FILTERS = [
  ["ALL", "All offers"],
  ["PENDING", "Pending"],
  ["ACCEPTED", "Accepted"],
  ["ASSIGNED", "Assigned"],
  ["IN_TRANSIT", "In transit"],
  ["DELIVERED", "Delivered"],
  ["COMPLETED", "Completed"],
  ["REJECTED", "Rejected"],
  ["CANCELLED", "Cancelled"],
];

function tone(status) {
  if (status === "COMPLETED" || status === "DELIVERED") return "success";
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  if (status === "PENDING") return "warning";
  return "info";
}

function quantities(items) {
  const grouped = new Map();
  for (const item of items ?? []) grouped.set(item.serving_unit, (grouped.get(item.serving_unit) ?? 0) + Number(item.offered_servings));
  return [...grouped].map(([unit, amount]) => formatQuantity(amount, unit)).join(" · ");
}

export default function DonationOffersPage() {
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
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError, "We couldn’t load donation offers.")); })
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
        eyebrow="NGO OPERATIONS"
        title="Donation offers"
        description="Review offers sent to your organization. Accept or reject pending offers from their detail page."
        actions={<Button variant="secondary" to="/ngo/deliveries">Incoming deliveries</Button>}
      />
      <Card>
        <div className="k-redistribution-filter-row">
          <label className="k-field">
            <span className="k-label">Offer status</span>
            <select className="k-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
              {FILTERS.map(([value, name]) => <option value={value} key={value}>{name}</option>)}
            </select>
          </label>
          <Button size="sm" variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>Refresh offers</Button>
        </div>
        <div className="k-card-body">
          {loading ? <LoadingSkeleton rows={5} /> : error ? (
            <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
          ) : filtered.length ? (
            <div className="k-portal-list">
              {filtered.map((donation) => (
                <article className="k-portal-list-item" key={donation.id}>
                  <div className="k-redistribution-batch-heading">
                    <div>
                      <h3>Offer #{donation.id} · {donation.kitchen_name}</h3>
                      <p>Sent {formatDateTime(donation.created_at)} · {quantities(donation.items)}</p>
                    </div>
                    <Badge tone={tone(donation.status)}>{donation.expired ? "Expired" : labelFor(donation.status)}</Badge>
                  </div>
                  <ul className="k-portal-food-list">
                    {(donation.items ?? []).map((item) => (
                      <li key={item.id}>
                        <span>{item.food_name}</span>
                        <strong>{formatQuantity(item.offered_servings, item.serving_unit)}</strong>
                      </li>
                    ))}
                  </ul>
                  <dl className="k-redistribution-facts">
                    <div><dt>Kitchen</dt><dd>{donation.kitchen_name}</dd></div>
                    <div><dt>Offer expiry</dt><dd>{donation.expires_at ? formatDateTime(donation.expires_at) : "Not provided"}</dd></div>
                    {donation.match_score !== null && donation.match_score !== undefined ? (
                      <div><dt>Matching score</dt><dd>{donation.match_score} / 100 · heuristic</dd></div>
                    ) : null}
                  </dl>
                  {donation.notes ? <p className="k-portal-notes"><strong>Kitchen notes:</strong> {donation.notes}</p> : null}
                  {donation.is_simulated ? <span className="k-demo-label">Demonstration data only. Not approved for actual consumption.</span> : null}
                  {donation.status !== "COMPLETED" ? (
                    <div className="k-redistribution-card-actions">
                      <Button size="sm" to={`/ngo/donations/${donation.id}`}>Review offer</Button>
                      {donation.expired ? <span className="k-muted-text">This offer has expired.</span> : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={HandHeart}
              title={filter === "ALL" ? "No donation offers yet" : `No ${labelFor(filter).toLowerCase()} offers`}
              description="New offers from kitchens will appear here."
            />
          )}
        </div>
      </Card>
    </>
  );
}
