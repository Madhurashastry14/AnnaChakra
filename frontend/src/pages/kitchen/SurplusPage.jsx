import { useEffect, useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";
import { getAvailableSurplus } from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDateTime, formatQuantity } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";

function BatchCard({ batch }) {
  return (
    <article className="k-redistribution-batch">
      <div className="k-redistribution-batch-heading">
        <div>
          <h3>{batch.food_name}</h3>
          <p>Batch #{batch.waste_log_id}</p>
        </div>
      </div>
      <dl className="k-redistribution-facts">
        <div>
          <dt>Available quantity</dt>
          <dd>{formatQuantity(batch.available_quantity, batch.serving_unit)}</dd>
        </div>
        <div>
          <dt>Redistribution deadline</dt>
          <dd>{formatDateTime(batch.safe_until)}</dd>
        </div>
      </dl>
      {batch.is_simulated ? <p className="k-demo-label">Demonstration data only. Not approved for actual consumption.</p> : null}
      <div className="k-redistribution-card-actions">
        <Button to={`/kitchen/matching?waste_log_id=${batch.waste_log_id}`} iconRight={ArrowRight}>
          Find NGOs
        </Button>
      </div>
    </article>
  );
}

export default function SurplusPage() {
  const [batches, setBatches] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setBatches(null);
    setError("");
    getAvailableSurplus()
      .then((available) => {
        if (active) setBatches(available);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, "We couldn?t load surplus batches."));
      });
    return () => { active = false; };
  }, [reloadKey]);

  return (
    <>
      <PageHeader
        eyebrow="REDISTRIBUTION"
        title="Available surplus"
        actions={<Button variant="secondary" to="/kitchen/waste-logs" icon={Trash2}>Waste logs</Button>}
      />
      {error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : batches === null ? <LoadingSkeleton rows={5} /> : (
        <Card className="k-redistribution-section">
          <div className="k-card-body">
            {batches.length ? (
              <div className="k-redistribution-batch-grid">
                {batches.map((batch) => <BatchCard key={batch.waste_log_id} batch={batch} />)}
              </div>
            ) : (
              <EmptyState
                title="No surplus available"
                description="Confirmed unserved batches with quantities available to offer will appear here."
                action={<Button to="/kitchen/waste-logs/new">Log surplus</Button>}
              />
            )}
          </div>
        </Card>
      )}
    </>
  );
}
