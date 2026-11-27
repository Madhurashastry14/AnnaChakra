import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Edit3,
  ImageOff,
  Trash2,
} from "lucide-react";
import { getWasteLog } from "../../services/wasteLogs.js";
import { getErrorMessage, isNotFound } from "../../utils/errors.js";
import {
  formatDateTime,
  formatNumber,
  formatQuantity,
  wasteTypeLabel,
} from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { RedistributionBadge } from "../../components/ui/Badge.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import AuthenticatedImage from "../../components/ui/AuthenticatedImage.jsx";

function imageSource(log) {
  if (log.image_url) return log.image_url;
  if (log.image_id) return `/api/v1/vision/images/${log.image_id}`;
  return "";
}

export default function WasteLogDetailPage() {
  const { id } = useParams();
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setNotFound(false);

    getWasteLog(id)
      .then((data) => {
        if (!active) return;
        setLog(data);
      })
      .catch((requestError) => {
        if (!active) return;
        if (isNotFound(requestError)) setNotFound(true);
        else setError(getErrorMessage(requestError, "We couldn’t load this waste log."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="OPERATIONS" title="Waste log" backTo="/kitchen/waste-logs" backLabel="Waste logs" />
        <LoadingSkeleton variant="page" />
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <PageHeader eyebrow="OPERATIONS" title="Waste log" backTo="/kitchen/waste-logs" backLabel="Waste logs" />
        <EmptyState
          icon={Trash2}
          title="Waste log not found"
          description="This log does not exist for your kitchen, or it may have been removed."
          action={<Button to="/kitchen/waste-logs">Back to waste logs</Button>}
        />
      </>
    );
  }

  if (error || !log) {
    return (
      <>
        <PageHeader eyebrow="OPERATIONS" title="Waste log" backTo="/kitchen/waste-logs" backLabel="Waste logs" />
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="OPERATIONS"
        title={`Waste log #${log.id}`}
        description={`${wasteTypeLabel(log.waste_type)} · ${formatDateTime(log.created_at)}`}
        backTo="/kitchen/waste-logs"
        backLabel="Waste logs"
        actions={
          <>
            <Button variant="secondary" to={`/kitchen/waste-logs/${log.id}/edit`} icon={Edit3}>
              Edit log
            </Button>
            <Button to="/kitchen/waste-logs/new" icon={Trash2}>Log waste</Button>
          </>
        }
      />

      <section className="k-result-hero k-waste-hero">
        <div className="k-result-hero-main">
          <p className="k-eyebrow">RECORDED WASTE</p>
          <h2>{log.food_name}</h2>
          <p>
            {wasteTypeLabel(log.waste_type)} ·{" "}
            {formatQuantity(log.confirmed_servings, log.serving_unit)}
          </p>
        </div>
        <dl className="k-result-hero-stats">
          {log.is_simulated ? <span className="k-demo-label">Demonstration data only. Not approved for actual consumption.</span> : null}
          <div>
            <dt>Redistribution</dt>
            <dd><RedistributionBadge status={log.safety_status} wasteType={log.waste_type} /></dd>
          </div>
          <div>
            <dt>Available for redistribution</dt>
            <dd>{formatQuantity(log.available_servings, log.serving_unit)}</dd>
          </div>
          <div>
            <dt>Redistribution deadline</dt>
            <dd>{log.safe_until ? formatDateTime(log.safe_until) : "Not set"}</dd>
          </div>
        </dl>
      </section>

      <div className="k-detail-layout">
        <Card>
          <CardHeader icon={Trash2} title="Recorded details" />
          <div className="k-card-body">
            <dl className="k-detail-grid">
              <div>
                <dt>Food item</dt>
                <dd>{log.food_name}</dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>{formatQuantity(log.confirmed_servings, log.serving_unit)}</dd>
              </div>
              <div>
                <dt>Waste type</dt>
                <dd>{wasteTypeLabel(log.waste_type)}</dd>
              </div>
              <div>
                <dt>Recorded at</dt>
                <dd>{formatDateTime(log.created_at)}</dd>
              </div>
              <div>
                <dt>Predicted food</dt>
                <dd>{log.predicted_food ?? "Not from a scanner"}</dd>
              </div>
              <div>
                <dt>Classification confidence</dt>
                <dd>
                  {log.confidence_score === null || log.confidence_score === undefined
                    ? "—"
                    : `${(Number(log.confidence_score) * 100).toFixed(1)}%`}
                </dd>
              </div>
              <div>
                <dt>Model version</dt>
                <dd>{log.model_version ?? "—"}</dd>
              </div>
              <div>
                <dt>Estimated quantity</dt>
                <dd>
                  {log.estimated_servings === null || log.estimated_servings === undefined
                    ? "Not estimated"
                    : formatNumber(log.estimated_servings)}
                </dd>
              </div>
              <div>
                <dt>Meal record item</dt>
                <dd>
                  {log.meal_record_item_id ? (
                    <span className="k-mono">#{log.meal_record_item_id}</span>
                  ) : (
                    "Not linked"
                  )}
                </dd>
              </div>
              <div>
                <dt>Scanner reference</dt>
                <dd>{log.image_id ? <span className="k-mono">{log.image_id}</span> : "None"}</dd>
              </div>
            </dl>

            {log.notes ? (
              <div className="k-record-notes">
                <h3>Notes</h3>
                <p>{log.notes}</p>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={ImageOff}
            title="Scanner image"
            subtitle="Private to your kitchen. The image is not a safety assessment."
          />
          <div className="k-card-body">
            {imageSource(log) ? (
              <AuthenticatedImage
                src={imageSource(log)}
                alt={`Scanner image for waste log ${log.id}`}
                className="k-detail-image"
              />
            ) : (
              <EmptyState
                icon={ImageOff}
                title="No scanner image"
                description="This waste log was recorded manually."
                className="k-empty-compact"
              />
            )}
          </div>
        </Card>
      </div>

    </>
  );
}
