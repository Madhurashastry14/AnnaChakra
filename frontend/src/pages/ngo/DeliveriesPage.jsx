import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Truck } from "lucide-react";
import {
  listAllDeliveries,
  listAllDonations,
} from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import {
  formatDateTime,
  formatQuantity,
  labelFor,
} from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "../../components/ui/States.jsx";

function statusTone(status) {
  if (status === "COMPLETED" || status === "DELIVERED") return "success";
  if (status === "CANCELLED" || status === "REJECTED") return "danger";
  if (status === "PENDING") return "warning";
  return "info";
}

export default function NgoDeliveriesPage() {
  const [deliveries, setDeliveries] = useState([]);
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([listAllDeliveries(), listAllDonations()])
      .then(([deliveryRows, donationRows]) => {
        if (!active) return;
        setDeliveries(deliveryRows);
        setDonations(donationRows);
      })
      .catch((requestError) => {
        if (active)
          setError(
            getErrorMessage(
              requestError,
              "We couldn’t load incoming deliveries.",
            ),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const active = deliveries.some((delivery) =>
    ["ASSIGNED", "IN_TRANSIT"].includes(delivery.status),
  );
  useEffect(() => {
    if (!active) return undefined;
    const intervalId = window.setInterval(
      () => setReloadKey((key) => key + 1),
      30000,
    );
    return () => window.clearInterval(intervalId);
  }, [active]);

  const donationsById = new Map(
    donations.map((donation) => [donation.id, donation]),
  );

  return (
    <>
      <PageHeader
        eyebrow="NGO OPERATIONS"
        title="Incoming deliveries"
        description={
          active
            ? "Delivery status refreshes every 30 seconds while an assignment is active. No live GPS tracking is available."
            : "Review delivery assignments, handoff timestamps and completed receipts."
        }
        actions={
          <Button
            variant="secondary"
            icon={Truck}
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Refresh
          </Button>
        }
      />
      <Card>
        <CardHeader
          icon={Truck}
          title="Deliveries and handoffs"
          subtitle="Personnel names and timestamps are shown when returned by the backend."
        />
        <div className="k-card-body">
          {loading ? (
            <LoadingSkeleton rows={5} />
          ) : error ? (
            <ErrorState
              message={error}
              onRetry={() => setReloadKey((key) => key + 1)}
            />
          ) : deliveries.length ? (
            <div className="k-portal-list">
              {[...deliveries]
                .sort(
                  (a, b) => new Date(b.assigned_at) - new Date(a.assigned_at),
                )
                .map((delivery) => {
                  const donation = donationsById.get(delivery.donation_id);
                  return (
                    <article className="k-portal-list-item" key={delivery.id}>
                      <div className="k-redistribution-batch-heading">
                        <div>
                          <h3>
                            <Link to={`/ngo/donations/${delivery.donation_id}`}>
                              Donation #{delivery.donation_id}
                            </Link>{" "}
                            · {donation?.kitchen_name ?? "Kitchen"}
                          </h3>
                          <p>
                            {(donation?.items ?? [])
                              .map(
                                (item) =>
                                  `${item.food_name} · ${formatQuantity(item.offered_servings, item.serving_unit)}`,
                              )
                              .join(", ") || "Food details unavailable"}
                          </p>
                        </div>
                        <Badge
                          tone={
                            donation?.failed_at
                              ? "danger"
                              : statusTone(delivery.status)
                          }
                        >
                          {donation?.failed_at
                            ? "Failed"
                            : labelFor(delivery.status)}
                        </Badge>
                      </div>
                      <dl className="k-redistribution-facts">
                        <div>
                          <dt>Assigned</dt>
                          <dd>
                            {delivery.assigned_at
                              ? formatDateTime(delivery.assigned_at)
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>Dispatched</dt>
                          <dd>
                            {delivery.dispatched_at
                              ? formatDateTime(delivery.dispatched_at)
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>Delivered</dt>
                          <dd>
                            {delivery.delivered_at
                              ? formatDateTime(delivery.delivered_at)
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>Donation status</dt>
                          <dd>{labelFor(donation?.status)}</dd>
                        </div>
                      </dl>
                      {delivery.notes ? (
                        <p className="k-portal-notes">
                          <strong>Kitchen instructions:</strong>{" "}
                          {delivery.notes}
                        </p>
                      ) : null}
                      {donation?.failure_reason ? (
                        <p className="k-callout k-callout-warning">
                          <strong>Delivery failure:</strong>{" "}
                          {donation.failure_reason}
                          {donation.failed_at
                            ? ` · ${formatDateTime(donation.failed_at)}`
                            : ""}
                        </p>
                      ) : null}
                      {donation?.cancellation_reason && !donation?.failed_at ? (
                        <p className="k-callout k-callout-warning">
                          <strong>Cancellation:</strong>{" "}
                          {donation.cancellation_reason}
                        </p>
                      ) : null}
                      {donation?.is_simulated ? (
                        <span className="k-demo-label">
                          Demonstration data only. Not approved for actual
                          consumption.
                        </span>
                      ) : null}
                      {donation?.status === "DELIVERED" ? (
                        <p className="k-callout k-callout-info">
                          Food delivery is recorded. Confirm inspected receipt
                          from the donation details page.
                        </p>
                      ) : null}
                      <div className="k-redistribution-card-actions">
                        <Button
                          size="sm"
                          to={`/ngo/donations/${delivery.donation_id}`}
                        >
                          {delivery.delivered_at ||
                          donation?.status === "DELIVERED" ||
                          donation?.status === "COMPLETED"
                            ? "View details"
                            : "View donation and timeline"}
                        </Button>
                      </div>
                    </article>
                  );
                })}
            </div>
          ) : (
            <EmptyState
              icon={Truck}
              title="No incoming deliveries"
              description="Deliveries appear here after a kitchen assigns a delivery person to an accepted offer."
              action={
                <Button variant="secondary" to="/ngo/donations">
                  Review donation offers
                </Button>
              }
            />
          )}
        </div>
      </Card>
      <p className="k-page-footer-note">
        Delivery locations are not tracked live.
      </p>
    </>
  );
}
