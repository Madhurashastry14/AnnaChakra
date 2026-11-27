import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, HandHeart } from "lucide-react";
import { getAvailableSurplus, createDonation } from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDateTime, formatQuantity, isWholeNumber } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { FormError, TextInput, TextareaInput } from "../../components/ui/Form.jsx";
import { ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";

export default function DonationOfferPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const match = location.state?.match;
  const selectedIds = useMemo(() => location.state?.selectedIds ?? [], [location.state]);
  const from = location.state?.from ?? "/kitchen/matching";
  const [available, setAvailable] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    if (!match?.requirement_id || !Array.isArray(match.suggested_allocation)) {
      setLoading(false);
      return () => { active = false; };
    }

    getAvailableSurplus()
      .then((rows) => {
        if (!active) return;
        const byId = new Map(rows.map((row) => [row.waste_log_id, row]));
        const included = match.suggested_allocation.filter((item) => selectedIds.includes(item.waste_log_id));
        setAvailable(included.map((item) => ({ ...item, current: byId.get(item.waste_log_id) ?? null })));
        setQuantities(Object.fromEntries(included.map((item) => [
          item.waste_log_id,
          String(Math.min(Number(item.offered_servings), Number(byId.get(item.waste_log_id)?.available_quantity ?? 0))),
        ])));
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, "We couldn’t verify current batch availability."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [match, selectedIds, reloadKey]);

  const offerLines = useMemo(() => available.map((item) => {
    const max = Math.min(Number(item.offered_servings), Number(item.current?.available_quantity ?? 0));
    return { ...item, max };
  }), [available]);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    if (!match?.requirement_id || !offerLines.length) {
      setFormError("No selected batch remains eligible for this offer. Return to matching and try again.");
      return;
    }
    if (offerLines.some((line) => !line.current)) {
      setFormError("At least one selected batch is no longer eligible or available. Run matching again before creating an offer.");
      return;
    }
    const items = [];
    for (const line of offerLines) {
      const quantity = Number(quantities[line.waste_log_id]);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > line.max) {
        setFormError(`${line.food_name}: enter a quantity above zero and no greater than the current available amount and suggested allocation.`);
        return;
      }
      if (line.serving_unit === "piece" && !isWholeNumber(quantity)) {
        setFormError(`${line.food_name}: piece quantities must be whole numbers.`);
        return;
      }
      items.push({ waste_log_id: line.waste_log_id, offered_servings: quantity });
    }
    if (notes.trim().length > 1000) {
      setFormError("Notes must be 1,000 characters or fewer.");
      return;
    }

    setSaving(true);
    try {
      const donation = await createDonation({
        requirement_id: match.requirement_id,
        items,
        notes: notes.trim() || null,
      });
      navigate(`/kitchen/donations/${donation.id}`, {
        replace: true,
        state: { created: true },
      });
    } catch (requestError) {
      setFormError(getErrorMessage(requestError, "The backend could not create this donation offer."));
    } finally {
      setSaving(false);
    }
  }

  if (!match) {
    return (
      <>
        <PageHeader eyebrow="REDISTRIBUTION" title="Create donation offer" backTo={from} backLabel="Matching results" />
        <ErrorState
          title="Matching selection unavailable"
          message="Choose an NGO from current matching results before creating an offer."
          action={<Button to="/kitchen/matching">Return to matching</Button>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="REDISTRIBUTION"
        title="Confirm donation offer"
        description="Review quantities before sending an offer. The backend checks live safety, capacity and availability again."
        backTo={from}
        backLabel="Matching results"
      />
      {loading ? <LoadingSkeleton rows={4} /> : error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : (
        <form className="k-redistribution-offer-form" onSubmit={handleSubmit} noValidate>
          <Card>
            <CardHeader icon={HandHeart} title="Selected NGO" />
            <div className="k-card-body">
              <h3 className="k-redistribution-ngo-name">{match.ngo_name}</h3>
              <p>{match.address || "Address not provided"}</p>
              <p className="k-note">
                Estimated {match.distance_km} km straight-line distance · about {match.estimated_travel_minutes} min travel estimate. This is not a verified route.
              </p>
            </div>
          </Card>
          <Card>
            <CardHeader
              title="Food items"
              subtitle="Offered quantity cannot exceed the current available quantity or the amount suggested for this NGO."
            />
            <div className="k-card-body">
              {offerLines.length ? (
                <div className="k-redistribution-offer-lines">
                  {offerLines.map((line) => (
                    <section className="k-redistribution-offer-line" key={line.waste_log_id}>
                      <div className="k-redistribution-batch-heading">
                        <div>
                          <h3>{line.food_name}</h3>
                          <p>Batch #{line.waste_log_id}</p>
                        </div>
                      </div>
                      <dl className="k-redistribution-facts">
                        <div><dt>Currently available</dt><dd>{line.current ? formatQuantity(line.current.available_quantity, line.serving_unit) : "No longer eligible or available"}</dd></div>
                        <div><dt>Suggested for this NGO</dt><dd>{formatQuantity(line.offered_servings, line.serving_unit)}</dd></div>
                        <div><dt>Safety deadline</dt><dd>{formatDateTime(line.current?.safe_until ?? line.safe_until)}</dd></div>
                      </dl>
                      <TextInput
                        label={`Offered quantity (${line.serving_unit === "piece" ? "whole pieces" : "servings"})`}
                        type="number"
                        min="0.01"
                        max={line.max}
                        step={line.serving_unit === "piece" ? "1" : "any"}
                        value={quantities[line.waste_log_id] ?? ""}
                        onChange={(event) => setQuantities((current) => ({ ...current, [line.waste_log_id]: event.target.value }))}
                        disabled={!line.current}
                        required
                      />
                      {line.current.is_simulated ? <p className="k-demo-label">Simulated demo batch</p> : null}
                    </section>
                  ))}
                </div>
              ) : (
                <p className="k-callout k-callout-warning">
                  None of the matched batches is currently available. Re-run matching before creating an offer.
                </p>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Pickup and kitchen notes" subtitle="Optional information for the NGO." />
            <div className="k-card-body">
              <TextareaInput
                label="Notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={1000}
                hint="Up to 1,000 characters."
              />
              <FormError message={formError} />
              <div className="k-form-actions">
                <Button type="submit" loading={saving} disabled={!offerLines.length} iconRight={ArrowRight}>
                  Send donation offer
                </Button>
                <Button type="button" variant="secondary" to={from} disabled={saving}>Back to matching</Button>
              </div>
            </div>
          </Card>
        </form>
      )}
    </>
  );
}
