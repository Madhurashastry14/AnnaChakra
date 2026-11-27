import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { HandHeart, ShieldCheck, Truck } from "lucide-react";
import { getDonation, getDelivery, updateDonation } from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import { fromDateTimeLocal, formatDateTime, formatQuantity, isWholeNumber, labelFor } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import { ConfirmDialog, Modal } from "../../components/ui/Modal.jsx";
import {
  CheckboxField,
  FormError,
  FormGrid,
  SelectInput,
  TextInput,
  TextareaInput,
  TriStateField,
} from "../../components/ui/Form.jsx";
import { ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

const STORAGE_METHODS = ["HOT_HOLDING", "REFRIGERATED", "FROZEN", "AMBIENT"];

function blankReceiptLine() {
  return {
    received: "",
    rejectionReason: "",
    unserved: "",
    storageVerified: "",
    contamination: "",
    storageMethod: "",
    storageTemperature: "",
    safeHandling: false,
    measuredAt: "",
    historyStartedAt: "",
    historyMin: "",
    historyMax: "",
    historyReference: "",
    uncontrolledMinutes: "",
    discardAt: "",
  };
}

function statusTone(status) {
  if (status === "COMPLETED" || status === "DELIVERED") return "success";
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  if (status === "PENDING") return "warning";
  return "info";
}

function timelineFor(donation, delivery) {
  return [
    { title: "Offer received", at: donation.created_at },
    { title: "Offer accepted", at: donation.accepted_at },
    { title: "Delivery assigned", at: delivery?.assigned_at },
    { title: "In transit", at: delivery?.dispatched_at },
    { title: "Delivered", at: delivery?.delivered_at },
    { title: "Receipt confirmed", at: donation.completed_at },
  ];
}

function quantitySummary(items) {
  const totals = new Map();
  for (const item of items ?? []) totals.set(item.serving_unit, (totals.get(item.serving_unit) ?? 0) + Number(item.offered_servings));
  return [...totals].map(([unit, value]) => formatQuantity(value, unit)).join(" · ");
}

export default function NgoDonationDetailPage() {
  const { id } = useParams();
  const { notify } = useToast();
  const [donation, setDonation] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [receiptLines, setReceiptLines] = useState({});
  const [receiptNotes, setReceiptNotes] = useState("");
  const [inspected, setInspected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getDonation(id)
      .then(async (result) => {
        const deliveryRecord = result.delivery?.id ? await getDelivery(result.delivery.id) : null;
        if (!active) return;
        setDonation(result);
        setDelivery(deliveryRecord);
        setReceiptLines(Object.fromEntries((result.items ?? []).map((item) => [item.id, blankReceiptLine()])));
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, "We couldn’t load this donation and its delivery details."));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, reloadKey]);

  async function runAction(action, payload) {
    setSaving(true);
    setActionError("");
    try {
      const updated = await updateDonation(id, action, payload);
      setDonation(updated);
      setDelivery(updated.delivery ?? null);
      setConfirmAccept(false);
      setRejectOpen(false);
      notify(action === "accept" ? "Donation offer accepted." : action === "reject" ? "Donation offer rejected." : "Receipt confirmed.");
      if (action === "confirm-receipt") setReloadKey((key) => key + 1);
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "The backend could not complete this action."));
    } finally {
      setSaving(false);
    }
  }

  function setLineField(itemId, field, value) {
    setReceiptLines((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] ?? blankReceiptLine()), [field]: value },
    }));
    setActionError("");
  }

  function buildEvidence(line) {
    const received = Number(line.received);
    if (received === 0) return null;
    const required = [
      ["unserved", "Confirm that the food was never served."],
      ["storageVerified", "Confirm the storage conditions were verified."],
      ["contamination", "Record whether contamination is suspected."],
      ["storageMethod", "Select the actual food storage method."],
      ["storageTemperature", "Enter the measured storage temperature."],
      ["measuredAt", "Enter when the food temperature was measured."],
      ["historyStartedAt", "Enter when the recorded temperature history began."],
      ["historyMin", "Enter the minimum temperature from the documented history."],
      ["historyMax", "Enter the maximum temperature from the documented history."],
      ["historyReference", "Enter the reference for the documented temperature history."],
      ["uncontrolledMinutes", "Enter the actual time outside controlled storage."],
    ];
    for (const [field, message] of required) {
      if (line[field] === "") throw new Error(message);
    }
    if (!line.historyReference.trim() || line.historyReference.trim().length > 255) {
      throw new Error("Temperature history reference must contain 1 to 255 non-space characters.");
    }
    if (line.unserved !== "true" || line.storageVerified !== "true" || line.contamination !== "false") {
      throw new Error("Positive receipt requires verified unserved food, verified storage, and no suspected contamination.");
    }
    if (!line.safeHandling) throw new Error("Confirm safe handling only if it was actually followed.");
    const temperature = Number(line.storageTemperature);
    const minimum = Number(line.historyMin);
    const maximum = Number(line.historyMax);
    const uncontrolled = Number(line.uncontrolledMinutes);
    if (![temperature, minimum, maximum].every(Number.isFinite) || minimum > maximum || temperature < minimum || temperature > maximum) {
      throw new Error("Enter valid temperature measurements with the measured temperature within the documented history range.");
    }
    if (!Number.isInteger(uncontrolled) || uncontrolled < 0 || uncontrolled > 525600) {
      throw new Error("Time outside controlled storage must be a whole number from 0 to 525600 minutes.");
    }
    const measuredAt = fromDateTimeLocal(line.measuredAt);
    const historyStartedAt = fromDateTimeLocal(line.historyStartedAt);
    if (!measuredAt || !historyStartedAt || new Date(measuredAt).getTime() > Date.now()) {
      throw new Error("Enter valid temperature history times; the measurement cannot be in the future.");
    }
    if (delivery?.delivered_at && new Date(measuredAt).getTime() < new Date(delivery.delivered_at).getTime()) {
      throw new Error("The temperature measurement must be taken at or after the recorded delivery time.");
    }
    if (new Date(historyStartedAt).getTime() >= new Date(measuredAt).getTime()) {
      throw new Error("Temperature history must begin before the receipt measurement.");
    }
    const evidence = {
      unserved_confirmed: true,
      storage_verified: true,
      contamination_suspected: false,
      storage_method: line.storageMethod,
      storage_temperature: temperature,
      safe_handling_confirmed: true,
      temperature_measured_at: measuredAt,
      temperature_history_started_at: historyStartedAt,
      temperature_history_min_c: minimum,
      temperature_history_max_c: maximum,
      temperature_history_reference: line.historyReference.trim(),
      uncontrolled_minutes: uncontrolled,
    };
    if (line.discardAt) evidence.discard_at = fromDateTimeLocal(line.discardAt);
    return evidence;
  }

  async function handleReceipt(event) {
    event.preventDefault();
    setActionError("");
    if (!inspected) {
      setActionError("Confirm that you verified the delivery before submitting receipt.");
      return;
    }
    const items = [];
    try {
      for (const item of donation.items) {
        const line = receiptLines[item.id] ?? blankReceiptLine();
        if (line.received === "") throw new Error(`Enter the actual received quantity for ${item.food_name}.`);
        const received = Number(line.received);
        if (!Number.isFinite(received) || received < 0 || received > Number(item.offered_servings)) {
          throw new Error(`${item.food_name}: received quantity must be between zero and the offered amount.`);
        }
        if (item.serving_unit === "piece" && !isWholeNumber(received)) {
          throw new Error(`${item.food_name}: piece quantities must be whole numbers.`);
        }
        const rejectionReason = line.rejectionReason.trim();
        if (received < Number(item.offered_servings) && !rejectionReason) {
          throw new Error(`${item.food_name}: provide a reason for any quantity not received.`);
        }
        items.push({
          donation_item_id: item.id,
          received_servings: received,
          rejection_reason: rejectionReason || null,
          ...(donation.is_simulated ? {} : { evidence: buildEvidence(line) }),
        });
      }
    } catch (validationError) {
      setActionError(validationError.message);
      return;
    }
    if (receiptNotes.trim().length > 1000) {
      setActionError("Receipt notes must be 1,000 characters or fewer.");
      return;
    }
    await runAction("confirm-receipt", {
      inspected: true,
      items,
      notes: receiptNotes.trim() || null,
    });
  }

  if (loading) {
    return <><PageHeader eyebrow="NGO OPERATIONS" title="Donation details" backTo="/ngo/donations" backLabel="Donation offers" /><LoadingSkeleton variant="page" /></>;
  }
  if (error || !donation) {
    return <><PageHeader eyebrow="NGO OPERATIONS" title="Donation details" backTo="/ngo/donations" backLabel="Donation offers" /><ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} /></>;
  }

  const timeline = timelineFor(donation, delivery);
  const pending = donation.status === "PENDING" && !donation.expired;

  return (
    <>
      <PageHeader
        eyebrow="NGO OPERATIONS"
        title={`Donation offer #${donation.id}`}
        description={`From ${donation.kitchen_name} · ${formatDateTime(donation.created_at)}`}
        backTo="/ngo/donations"
        backLabel="Donation offers"
        actions={donation.status === "DELIVERED" ? <Button to="/ngo/deliveries" icon={Truck}>Incoming deliveries</Button> : null}
      />
      {donation.is_simulated ? (
        <div className="k-callout k-callout-warning"><ShieldCheck size={18} aria-hidden="true" /><div><strong>Simulated demo transaction</strong><p>This offer belongs to the backend’s simulated demo environment.</p></div></div>
      ) : null}
      <section className="k-result-hero">
        <div className="k-result-hero-main">
          <p className="k-eyebrow">OFFER STATUS</p>
          <h2>{donation.kitchen_name}</h2>
          <p>{donation.kitchen_address || "Kitchen address not provided"}</p>
          <Badge tone={statusTone(donation.status)}>{donation.expired ? "Expired" : labelFor(donation.status)}</Badge>
        </div>
        <dl className="k-result-hero-stats">
          <div><dt>Food items</dt><dd>{donation.items?.length ?? 0}</dd></div>
          <div><dt>Offered quantities</dt><dd>{quantitySummary(donation.items)}</dd></div>
          <div><dt>Offer expires</dt><dd>{donation.expires_at ? formatDateTime(donation.expires_at) : "Not provided"}</dd></div>
          {donation.match_score !== null && donation.match_score !== undefined ? <div><dt>Matching score</dt><dd>{donation.match_score} / 100 · heuristic</dd></div> : null}
        </dl>
      </section>

      <div className="k-redistribution-detail-grid">
        <Card>
          <CardHeader icon={HandHeart} title="Food offered" />
          <div className="k-card-body">
            <div className="k-redistribution-offer-lines">
              {(donation.items ?? []).map((item) => (
                <article className="k-redistribution-offer-line" key={item.id}>
                  <div className="k-redistribution-batch-heading">
                    <div><h3>{item.food_name}</h3><p>Batch #{item.waste_log_id}</p></div>
                    <strong>{formatQuantity(item.offered_servings, item.serving_unit)}</strong>
                  </div>
                  {item.received_servings !== null ? <p className="k-muted-text">Received: {formatQuantity(item.received_servings, item.serving_unit)}</p> : null}
                </article>
              ))}
            </div>
            {donation.notes ? <p className="k-portal-notes"><strong>Kitchen notes:</strong> {donation.notes}</p> : null}
            {!donation.is_simulated ? <p className="k-callout k-callout-warning k-ngo-safety-note">
              Per-batch safety deadlines are not included in the NGO donation response. The backend rechecks current safety when accepting and confirming receipt.
            </p> : null}
            {donation.rejection_reason ? <p className="k-portal-notes"><strong>Rejection reason:</strong> {donation.rejection_reason}</p> : null}
          </div>
        </Card>
        <Card>
          <CardHeader icon={Truck} title="Delivery progress" />
          <div className="k-card-body">
            <ol className="k-redistribution-timeline">
              {timeline.map((step) => (
                <li className={step.at ? "is-complete" : ""} key={step.title}>
                  <span className="k-timeline-marker" aria-hidden="true" />
                  <div><strong>{step.title}</strong><small>{step.at ? formatDateTime(step.at) : "Not yet recorded"}</small></div>
                </li>
              ))}
              {["REJECTED", "CANCELLED"].includes(donation.status) ? (
                <li className="is-complete"><span className="k-timeline-marker" aria-hidden="true" /><div><strong>{donation.expired ? "Offer expired" : labelFor(donation.status)}</strong><small>{donation.failure_reason || donation.cancellation_reason || donation.rejection_reason || "Backend status"} · {formatDateTime(donation.updated_at)}</small></div></li>
              ) : null}
            </ol>
            {delivery ? (
              <dl className="k-redistribution-facts">
                <div><dt>Delivery person</dt><dd>{delivery.delivery_person_name || "Not provided"}</dd></div>
                <div><dt>Instructions</dt><dd>{delivery.notes || "None provided"}</dd></div>
              </dl>
            ) : null}
            {donation.status === "DELIVERED" ? <p className="k-callout k-callout-info">Delivery is recorded. Confirm receipt only after inspecting the food and recording the required evidence below.</p> : null}
          </div>
        </Card>
      </div>

      {pending ? (
        <Card>
          <CardHeader title="Respond to offer" subtitle="Acceptance is rechecked by the backend for current status, capacity and food safety." />
          <div className="k-card-body">
            <FormError message={actionError} />
            <div className="k-redistribution-card-actions">
              <Button onClick={() => setConfirmAccept(true)} loading={saving}>Accept offer</Button>
              <Button variant="secondary" onClick={() => { setRejectReason(""); setRejectOpen(true); }}>Reject offer</Button>
            </div>
          </div>
        </Card>
      ) : null}

      {donation.status === "DELIVERED" ? (
        <Card id="receipt">
          <CardHeader
            icon={ShieldCheck}
            title="Inspect and confirm receipt"
            subtitle={donation.is_simulated
              ? "Confirm the quantities received in this demonstration."
              : "Record the holding evidence for each accepted batch."}
          />
          <div className="k-card-body">
            {!donation.is_simulated ? <p className="k-note">
              Obtain the batch’s actual preparation and temperature history from the kitchen. The donation API does not include those original records. Do not estimate measurements or confirm handling facts you cannot verify.
            </p> : null}
            <form className="k-form" onSubmit={handleReceipt} noValidate>
              <CheckboxField
                label={donation.is_simulated ? "I verified the simulated delivery" : "I inspected the delivered food"}
                description="This must be confirmed before a receipt can be submitted."
                checked={inspected}
                onChange={(event) => setInspected(event.target.checked)}
              />
              {(donation.items ?? []).map((item) => {
                const line = receiptLines[item.id] ?? blankReceiptLine();
                return (
                  <section className="k-receipt-line" key={item.id}>
                    <div className="k-redistribution-batch-heading">
                      <div><h3>{item.food_name}</h3><p>Offered {formatQuantity(item.offered_servings, item.serving_unit)}</p></div>
                    </div>
                    <FormGrid columns={2}>
                      <TextInput
                        label={`Actual quantity received (${item.serving_unit})`}
                        type="number"
                        min="0"
                        max={item.offered_servings}
                        step={item.serving_unit === "piece" ? "1" : "any"}
                        value={line.received}
                        onChange={(event) => setLineField(item.id, "received", event.target.value)}
                        required
                      />
                      <TextInput
                        label="Reason for quantity not received"
                        value={line.rejectionReason}
                        onChange={(event) => setLineField(item.id, "rejectionReason", event.target.value)}
                        maxLength={1000}
                        hint="Required when received quantity is below the offer."
                      />
                    </FormGrid>
                    {!donation.is_simulated && line.received !== "" && Number(line.received) > 0 ? (
                      <div className="k-receipt-evidence">
                        <h4>Food safety evidence</h4>
                        <p>Record actual inspection observations and documented holding history for this batch.</p>
                        <FormGrid columns={2}>
                          <TriStateField label="Food was never served" value={line.unserved} onChange={(value) => setLineField(item.id, "unserved", value)} yesLabel="Yes" noLabel="No" />
                          <TriStateField label="Storage conditions verified" value={line.storageVerified} onChange={(value) => setLineField(item.id, "storageVerified", value)} yesLabel="Yes" noLabel="No" />
                          <TriStateField label="Contamination suspected" value={line.contamination} onChange={(value) => setLineField(item.id, "contamination", value)} yesLabel="Yes" noLabel="No" />
                          <SelectInput
                            label="Actual storage method"
                            value={line.storageMethod}
                            onChange={(event) => setLineField(item.id, "storageMethod", event.target.value)}
                            placeholder="Select storage method"
                            options={STORAGE_METHODS.map((method) => ({ value: method, label: labelFor(method) }))}
                          />
                          <TextInput label="Storage temperature (°C)" type="number" step="any" value={line.storageTemperature} onChange={(event) => setLineField(item.id, "storageTemperature", event.target.value)} />
                          <TextInput label="Temperature measured at" type="datetime-local" value={line.measuredAt} onChange={(event) => setLineField(item.id, "measuredAt", event.target.value)} />
                          <TextInput label="Temperature history began at" type="datetime-local" value={line.historyStartedAt} onChange={(event) => setLineField(item.id, "historyStartedAt", event.target.value)} />
                          <TextInput label="Minimum recorded temperature (°C)" type="number" step="any" value={line.historyMin} onChange={(event) => setLineField(item.id, "historyMin", event.target.value)} />
                          <TextInput label="Maximum recorded temperature (°C)" type="number" step="any" value={line.historyMax} onChange={(event) => setLineField(item.id, "historyMax", event.target.value)} />
                          <TextInput label="Temperature history reference" value={line.historyReference} maxLength={255} onChange={(event) => setLineField(item.id, "historyReference", event.target.value)} />
                          <TextInput label="Minutes outside controlled storage" type="number" min="0" max="525600" step="1" value={line.uncontrolledMinutes} onChange={(event) => setLineField(item.id, "uncontrolledMinutes", event.target.value)} />
                          <TextInput label="Optional discard deadline" type="datetime-local" value={line.discardAt} onChange={(event) => setLineField(item.id, "discardAt", event.target.value)} />
                        </FormGrid>
                        <CheckboxField
                          label="Safe handling procedures were followed"
                          description="Only confirm this when verified."
                          checked={line.safeHandling}
                          onChange={(event) => setLineField(item.id, "safeHandling", event.target.checked)}
                        />
                      </div>
                    ) : null}
                  </section>
                );
              })}
              <TextareaInput label="Receipt notes" value={receiptNotes} onChange={(event) => setReceiptNotes(event.target.value)} maxLength={1000} hint="Optional, up to 1,000 characters." />
              <FormError message={actionError} />
              <div className="k-form-actions">
                <Button type="submit" loading={saving}>Confirm receipt</Button>
              </div>
            </form>
          </div>
        </Card>
      ) : null}

      {donation.status === "COMPLETED" ? <p className="k-callout k-callout-success">Receipt is confirmed. Received quantities are included in your impact analytics.</p> : null}

      <ConfirmDialog
        open={confirmAccept}
        title={`Accept offer #${donation.id}?`}
        description="The backend will recheck the offer, capacity and current safety eligibility before acceptance."
        confirmLabel="Accept offer"
        loading={saving}
        onConfirm={() => runAction("accept")}
        onCancel={() => { setConfirmAccept(false); setActionError(""); }}
      >
        <FormError message={actionError} />
      </ConfirmDialog>

      <Modal
        open={rejectOpen}
        onClose={() => { if (!saving) setRejectOpen(false); }}
        title={`Reject offer #${donation.id}?`}
        description="Provide a reason for the kitchen."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)} disabled={saving}>Keep offer</Button>
            <Button variant="danger" loading={saving} onClick={() => {
              if (!rejectReason.trim()) {
                setActionError("Enter a rejection reason.");
                return;
              }
              runAction("reject", { reason: rejectReason.trim() });
            }}>Reject offer</Button>
          </>
        }
      >
        <TextareaInput label="Rejection reason" value={rejectReason} onChange={(event) => { setRejectReason(event.target.value); setActionError(""); }} maxLength={1000} required />
        <FormError message={actionError} />
      </Modal>
    </>
  );
}
