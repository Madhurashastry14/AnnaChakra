import { useEffect, useState } from "react";
import PageHeader from "../../components/ui/PageHeader.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import api from "../../services/api.js";

const root = "/api/v1";

export default function DonationsPage() {
  const { user, logout } = useAuth();
  const isKitchen = user?.role === "KITCHEN_STAFF";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const get = (path) => api.get(root + path, { signal: controller.signal }).then(({ data }) => data);
    Promise.all([
      get("/donations"),
      get("/analytics/redistribution-summary"),
      get(isKitchen ? "/waste-logs/available-surplus" : "/ngo-requirements"),
    ]).then(([donations, impact, availability]) => {
      if (!controller.signal.aborted) setData({ donations, impact, availability });
    }).catch((response) => {
      if (!controller.signal.aborted) {
        const detail = response.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Could not load redistribution records.");
      }
    });
    return () => controller.abort();
  }, [isKitchen, user?.id]);

  const availability = data?.availability?.items ?? data?.availability ?? [];

  return (
    <div className="k-page">
      <PageHeader title={isKitchen ? "Donations" : "NGO donations"}
        description={data?.impact.is_simulated ? "Simulated redistribution records" : undefined}
        actions={!isKitchen && <button className="k-btn k-btn-secondary" onClick={logout}>Sign out</button>} />
      {error && <p role="alert">{error}</p>}
      {!error && !data && <p role="status">Loading redistribution records…</p>}
      {data && <>
        <Card>
          <div className="k-card-body">
            <h2>{isKitchen ? "Available surplus" : "Food requirements"}</h2>
            {availability.length === 0 ? <p>No records available.</p> : <ul>
              {availability.map((row) => isKitchen ? (
                <li key={row.waste_log_id}>{row.food_name} · {row.available_quantity} {row.serving_unit}(s)
                  · eligible until {new Date(row.safe_until).toLocaleString()}</li>
              ) : (
                <li key={row.id}>Requirement #{row.id} · {row.people_to_feed} people ·{" "}
                  {row.remaining_capacity_by_unit.serving} servings and {row.remaining_capacity_by_unit.piece} pieces remaining</li>
              ))}
            </ul>}
          </div>
        </Card>
        <Card>
          <div className="k-card-body">
            <h2>Donation progress</h2>
            {data.donations.length === 0 ? <p>No donations yet.</p> : <ul>
              {data.donations.map((row) => (
                <li key={row.id}>Donation #{row.id} · {row.status.replaceAll("_", " ")}
                  {row.delivery && ` · Delivery #${row.delivery.id}`}</li>
              ))}
            </ul>}
          </div>
        </Card>
        <Card>
          <div className="k-card-body">
            <h2>Redistribution impact</h2>
            <p>{data.impact.completed_donations} completed donations</p>
            {data.impact.quantities.length > 0 && <ul>
              {data.impact.quantities.map((row) => (
                <li key={`${row.food_item_id}:${row.serving_unit}`}>
                  {row.food_name} · {row.received_quantity} {row.serving_unit}(s) received
                </li>
              ))}
            </ul>}
          </div>
        </Card>
      </>}
    </div>
  );
}
