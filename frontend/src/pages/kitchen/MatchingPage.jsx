import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { getAvailableSurplus, getMatches } from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatNumber, formatQuantity } from "../../utils/format.js";
import { useKitchen } from "../../components/kitchen/KitchenLayout.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { CheckboxField } from "../../components/ui/Form.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";

function hasCoordinates(value) {
  return value?.latitude !== null && value?.latitude !== undefined
    && value?.longitude !== null && value?.longitude !== undefined
    && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude));
}

function MatchMap({ kitchen, matches }) {
  const mappedMatches = matches.filter(hasCoordinates);
  if (!mappedMatches.length) return null;
  const center = hasCoordinates(kitchen)
    ? [Number(kitchen.latitude), Number(kitchen.longitude)]
    : [Number(mappedMatches[0].latitude), Number(mappedMatches[0].longitude)];

  return (
    <Card className="k-redistribution-map-card">
      <CardHeader
        icon={MapPin}
        title="Partner locations"
        subtitle="Markers show organization coordinates. No route is displayed."
      />
      <div className="k-redistribution-map">
        <MapContainer center={center} zoom={10} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {hasCoordinates(kitchen) ? (
            <CircleMarker center={[Number(kitchen.latitude), Number(kitchen.longitude)]} pathOptions={{ color: "#245c3e" }} radius={9}>
              <Popup>{kitchen.name} · kitchen</Popup>
            </CircleMarker>
          ) : null}
          {mappedMatches.map((match) => (
            <CircleMarker key={`${match.ngo_id}-${match.requirement_id}`} center={[Number(match.latitude), Number(match.longitude)]} pathOptions={{ color: "#b8792f" }} radius={8}>
              <Popup>{match.ngo_name}<br />{match.address || "Address not provided"}</Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <div className="k-card-body">
        <p className="k-note">
          Distance is a straight-line estimate and travel duration is a backend estimate, not an actual route or live traffic time.
        </p>
      </div>
    </Card>
  );
}

function MatchCard({ match, onChoose }) {
  const allocations = match.suggested_allocation ?? [];
  return (
    <article className="k-redistribution-match">
      <div className="k-redistribution-batch-heading">
        <div>
          <h3>{match.ngo_name}</h3>
          <p>{match.address || "Address not provided"}</p>
        </div>
        <div className="k-match-score">
          <strong>{formatNumber(match.match_score, 1)} / 100</strong>
          <small>Heuristic match score</small>
        </div>
      </div>
      <dl className="k-redistribution-facts">
        <div><dt>Estimated distance</dt><dd>{formatNumber(match.distance_km, 1)} km</dd></div>
        <div><dt>Estimated travel time</dt><dd>{formatNumber(match.estimated_travel_minutes, 0)} min</dd></div>
        <div><dt>People to feed</dt><dd>{formatNumber(match.people_to_feed, 0)}</dd></div>
        <div>
          <dt>Remaining compatible capacity</dt>
          <dd className="k-match-capacity">
            {Object.entries(match.remaining_capacity_by_unit ?? {}).map(([unit, quantity]) => (
              <span key={unit}>{formatQuantity(quantity, unit)}</span>
            ))}
          </dd>
        </div>
      </dl>
      <div className="k-match-allocation">
        <h4>Suggested allocation</h4>
        {allocations.length ? (
          <ul>
            {allocations.map((item) => (
              <li key={item.waste_log_id}>
                <span>{item.food_name}</span>
                <strong>{formatQuantity(item.offered_servings, item.serving_unit)}</strong>
              </li>
            ))}
          </ul>
        ) : <p>No allocation returned for the selected batches.</p>}
      </div>
      <div className="k-match-reasons">
        <h4>Why this match</h4>
        <ul>{(match.reasons ?? []).map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </div>
      <p className="k-note">
        Compatible foods are derived from the batches allocated by the backend. Estimated distance and travel time are not route information.
      </p>
      {match.is_simulated ? <p className="k-demo-label">Demonstration data only. Not approved for actual consumption.</p> : null}
      <div className="k-redistribution-card-actions">
        <Button
          icon={ArrowRight}
          disabled={!allocations.length}
          onClick={() => onChoose(match)}
        >
          Choose this NGO
        </Button>
      </div>
    </article>
  );
}

function BatchExclusions({ batches }) {
  if (!batches.length) return null;
  return (
    <ul>
      {batches.map((batch) => (
        <li key={batch.waste_log_id}>
          <strong>{batch.food_name} · Batch #{batch.waste_log_id}</strong>
          <ul>{batch.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </li>
      ))}
    </ul>
  );
}

export default function MatchingPage() {
  const { kitchen } = useKitchen();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedId = Number(searchParams.get("waste_log_id"));
  const [surplus, setSurplus] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [matches, setMatches] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");
  const [matchError, setMatchError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setMatches([]);
    setDiagnostics(null);
    setMatchError("");
    getAvailableSurplus()
      .then((rows) => {
        if (!active) return;
        setSurplus(rows);
        const availableIds = new Set(rows.map((row) => row.waste_log_id));
        const selected = requestedId && availableIds.has(requestedId) ? [requestedId] : [];
        setSelectedIds(selected);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, "We couldn’t load eligible surplus."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [requestedId, reloadKey]);

  function toggleBatch(id) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id]);
    setMatches([]);
    setDiagnostics(null);
    setMatchError("");
  }

  async function handleFindMatches() {
    setMatching(true);
    setMatchError("");
    setMatches([]);
    setDiagnostics(null);
    try {
      const result = await getMatches({ waste_log_ids: selectedIds });
      setMatches(result.items ?? []);
      setDiagnostics({
        exclusions: result.exclusions ?? [],
        unavailableBatches: result.unavailable_batches ?? [],
      });
    } catch (requestError) {
      setMatchError(getErrorMessage(requestError, "We couldn’t find suitable NGOs."));
    } finally {
      setMatching(false);
    }
  }

  function chooseMatch(match) {
    navigate("/kitchen/donations/new", {
      state: {
        match,
        selectedIds,
        from: location.pathname + location.search,
      },
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="REDISTRIBUTION"
        title="Find an NGO"
        description="Select currently eligible batches to receive backend-ranked partner alternatives."
        backTo="/kitchen/surplus"
        backLabel="Available surplus"
      />
      <Card>
        <CardHeader
          icon={Search}
          title="Choose eligible food"
          subtitle="Only batches returned by the live available-surplus endpoint can be matched."
        />
        <div className="k-card-body">
          {loading ? <LoadingSkeleton rows={3} /> : error ? (
            <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
          ) : surplus.length ? (
            <>
              <div className="k-redistribution-select-list">
                {surplus.map((batch) => (
                  <CheckboxField
                    key={batch.waste_log_id}
                    label={`${batch.food_name} · ${formatQuantity(batch.available_quantity, batch.serving_unit)}`}
                    description={`Safe until ${batch.safe_until ? new Date(batch.safe_until).toLocaleString() : "not set"} · ${Math.max(0, Math.ceil(batch.remaining_eligible_seconds / 60))} min eligible time remaining`}
                    checked={selectedIds.includes(batch.waste_log_id)}
                    disabled={matching}
                    onChange={() => toggleBatch(batch.waste_log_id)}
                  />
                ))}
              </div>
              <div className="k-redistribution-card-actions">
                <Button
                  onClick={handleFindMatches}
                  loading={matching}
                  disabled={!selectedIds.length}
                  icon={Search}
                >
                  Find suitable NGOs
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={Search}
              title="No eligible surplus available"
              description="Select confirmed surplus with quantities available to offer."
              action={<Button variant="secondary" to="/kitchen/surplus">Review surplus</Button>}
            />
          )}
          {matchError ? <p className="k-form-error" role="alert">{matchError}</p> : null}
        </div>
      </Card>

      {diagnostics && (diagnostics.exclusions.length > 0 || diagnostics.unavailableBatches.length > 0 || !matches.length) ? (
        <Card className="k-redistribution-section">
          <CardHeader title={matches.length ? "Matching exclusions" : "Why no matches were found"} />
          <div className="k-card-body k-match-reasons">
            {diagnostics.unavailableBatches.length > 0 ? (
              <>
                <h4>Unavailable batches</h4>
                <BatchExclusions batches={diagnostics.unavailableBatches} />
              </>
            ) : null}
            {diagnostics.exclusions.map((ngo) => (
              <div key={`${ngo.ngo_id}-${ngo.requirement_id}`}>
                <h4>{ngo.ngo_name}{ngo.requirement_id ? ` · Requirement #${ngo.requirement_id}` : ""}</h4>
                {ngo.reasons.length > 0 ? (
                  <ul>{ngo.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                ) : null}
                <BatchExclusions batches={ngo.batches} />
              </div>
            ))}
            {!diagnostics.exclusions.length && !diagnostics.unavailableBatches.length ? (
              <p>No NGO requirements were returned for this selection.</p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {matches.length ? (
        <>
          <MatchMap kitchen={kitchen} matches={matches} />
          <Card className="k-redistribution-section">
            <CardHeader
              title="Matching results"
              subtitle={`${matches.length} suitable ${matches.length === 1 ? "option" : "options"} returned. Scores are matching heuristics, not probabilities.`}
            />
            <div className="k-card-body">
              <div className="k-redistribution-match-grid">
                {matches.map((match) => (
                  <MatchCard key={`${match.ngo_id}-${match.requirement_id}`} match={match} onChoose={chooseMatch} />
                ))}
              </div>
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}
