import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, ShieldCheck, Trash2 } from "lucide-react";
import { listWasteLogs } from "../../services/wasteLogs.js";
import { getAvailableSurplus } from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDateTime, formatQuantity, labelFor } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";

const PAGE_SIZE = 100;

async function getSurplusLogs() {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await listWasteLogs({
      waste_type: "UNSERVED_SURPLUS",
      limit: PAGE_SIZE,
      offset,
    });
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function classifyLogs(logs, available) {
  const availableById = new Map(available.map((row) => [row.waste_log_id, row]));
  const now = Date.now();
  const groups = { available: [], pending: [], expired: [], ineligible: [], reserved: [] };

  for (const log of logs) {
    const current = availableById.get(log.id);
    if (current) {
      groups.available.push({ ...log, ...current });
    } else if (log.safe_until && new Date(log.safe_until).getTime() <= now) {
      groups.expired.push(log);
    } else if (log.safety_status === "INELIGIBLE") {
      groups.ineligible.push(log);
    } else if (log.safety_status === "PENDING") {
      groups.pending.push(log);
    } else {
      groups.reserved.push(log);
    }
  }
  return groups;
}

function BatchCard({ batch, eligible = false }) {
  return (
    <article className="k-redistribution-batch">
      <div className="k-redistribution-batch-heading">
        <div>
          <h3>{batch.food_name}</h3>
          <p>Batch #{batch.waste_log_id ?? batch.id}</p>
        </div>
        <Badge tone={eligible ? "success" : batch.safety_status === "INELIGIBLE" ? "danger" : "warning"}>
          {eligible ? "Eligible" : labelFor(batch.safety_status)}
        </Badge>
      </div>
      <dl className="k-redistribution-facts">
        <div>
          <dt>{eligible ? "Available quantity" : "Recorded quantity"}</dt>
          <dd>{formatQuantity(eligible ? batch.available_quantity : batch.available_servings ?? batch.confirmed_servings, batch.serving_unit)}</dd>
        </div>
        <div>
          <dt>Prepared</dt>
          <dd>{batch.prepared_at ? formatDateTime(batch.prepared_at) : "Not recorded"}</dd>
        </div>
        <div>
          <dt>Safety deadline</dt>
          <dd>{batch.safe_until ? formatDateTime(batch.safe_until) : "Not set"}</dd>
        </div>
        {eligible ? (
          <div>
            <dt>Eligible time remaining</dt>
            <dd><Clock3 size={14} aria-hidden="true" /> {Math.max(0, Math.ceil(batch.remaining_eligible_seconds / 60))} min</dd>
          </div>
        ) : null}
      </dl>
      {!eligible && batch.safety_status === "INELIGIBLE" ? (
        <div className="k-redistribution-reasons">
          <strong>Not eligible for redistribution</strong>
          <ul>
            {(batch.safety_notes?.length ? batch.safety_notes : ["The latest safety screening did not approve this batch."]).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!eligible && batch.safety_status === "PENDING" ? (
        <p className="k-muted-text">Safety screening is pending. This batch cannot be matched yet.</p>
      ) : null}
      {eligible ? (
        <div className="k-redistribution-card-actions">
          <Button to={`/kitchen/matching?waste_log_id=${batch.waste_log_id}`} icon={ArrowRight} iconRight={ArrowRight}>
            Find NGOs
          </Button>
          {batch.is_simulated ? <span className="k-demo-label">Simulated demo batch</span> : null}
        </div>
      ) : null}
    </article>
  );
}

export default function SurplusPage() {
  const [groups, setGroups] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([getAvailableSurplus(), getSurplusLogs()])
      .then(([available, logs]) => {
        if (active) setGroups(classifyLogs(logs, available));
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, "We couldn’t load surplus batches."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const sections = useMemo(() => [
    { key: "available", title: "Available now", subtitle: "Only batches returned as eligible by the live safety and availability check.", icon: ShieldCheck, eligible: true },
    { key: "pending", title: "Safety screening pending", subtitle: "These batches cannot proceed to NGO matching yet.", icon: Clock3 },
    { key: "expired", title: "Past safety deadline", subtitle: "The recorded deadline has passed; these batches are not available for matching.", icon: Clock3 },
    { key: "ineligible", title: "Ineligible", subtitle: "The backend safety screening did not approve these batches.", icon: ShieldCheck },
    { key: "reserved", title: "No longer available", subtitle: "Eligible batches not currently returned as available may be fully reserved or otherwise unavailable.", icon: Trash2 },
  ], []);

  return (
    <>
      <PageHeader
        eyebrow="REDISTRIBUTION"
        title="Available surplus"
        description="Review recorded batches and their current backend eligibility before finding an NGO."
        actions={<Button variant="secondary" to="/kitchen/waste-logs" icon={Trash2}>Waste logs</Button>}
      />
      {loading ? <LoadingSkeleton rows={5} /> : error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : (
        sections.map((section) => (
          <Card className="k-redistribution-section" key={section.key}>
            <CardHeader icon={section.icon} title={section.title} subtitle={section.subtitle} />
            <div className="k-card-body">
              {groups[section.key].length ? (
                <div className="k-redistribution-batch-grid">
                  {groups[section.key].map((batch) => (
                    <BatchCard key={batch.waste_log_id ?? batch.id} batch={batch} eligible={section.eligible} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={section.icon}
                  title={`No ${section.title.toLowerCase()} batches`}
                  description={section.eligible ? "Eligible unreserved surplus will appear here." : ""}
                  className="k-empty-compact"
                />
              )}
            </div>
          </Card>
        ))
      )}
    </>
  );
}
