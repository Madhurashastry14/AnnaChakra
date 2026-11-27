import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowRight, HandHeart, ShieldCheck, Truck } from "lucide-react";
import { getDonation, updateDonation } from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDateTime, formatQuantity, labelFor } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import { FormError, TextareaInput } from "../../components/ui/Form.jsx";
import { ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";

function donationQuantity(items) {
  const totals = new Map();
  for (const item of items ?? []) {
    totals.set(item.serving_unit, (totals.get(item.serving_unit) ?? 0) + Number(item.offered_servings));
  }
  return [...totals].map(([unit, quantity]) => formatQuantity(quantity, unit)).join(" · ");
}

function timelineFor(donation) {
  const steps = [
    { title: "Offer sent", at: donation.created_at },
    { title: "Accepted by NGO", at: donation.accepted_at },
    { title: "Delivery assigned", at: donation.delivery?.assigned_at },
    { title: "Dispatched", at: donation.delivery?.dispatched_at },
    { title: "Delivered", at: donation.delivery?.delivered_at },
    { title: "Receipt confirmed", at: donation.completed_at },
  ];
  return steps;
}

export default function DonationDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const [donation, setDonation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getDonation(id)
      .then((result) => { if (active) setDonation(result); })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError, "We couldn’t load this donation.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, reloadKey]);

  async function handleCancel(event) {
    event.preventDefault();
    if (!reason.trim()) {
      setActionError("Enter a reason for cancelling this offer.");
      return;
    }
    setSaving(true);
    setActionError("");
    try {
      const updated = await updateDonation(id, "cancel", { reason: reason.trim() });
      setDonation(updated);
      setShowCancel(false);
      setReason("");
    } catch (requestError) {
      setActionError(getErrorMessage(requestError, "We couldn’t cancel this offer."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <><PageHeader eyebrow="REDISTRIBUTION" title="Donation details" backTo="/kitchen/donations" backLabel="Donations" /><LoadingSkeleton variant="page" /></>;
  }
  if (error || !donation) {
    return <><PageHeader eyebrow="REDISTRIBUTION" title="Donation details" backTo="/kitchen/donations" backLabel="Donations" /><ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} /></>;
  }

  const cancelable = ["PENDING", "ACCEPTED", "ASSIGNED"].includes(donation.status);
  const manageable = ["ACCEPTED", "ASSIGNED", "IN_TRANSIT"].includes(donation.status);
  const timeline = timelineFor(donation);

  return (
    <>
      <PageHeader
        eyebrow="REDISTRIBUTION"
        title={`Donation #${donation.id}`}
        description={`Offer to ${donation.ngo_name} · ${formatDateTime(donation.created_at)}`}
        backTo="/kitchen/donations"
        backLabel="Donations"
        actions={manageable ? <Button to="/kitchen/delivery" icon={Truck}>Manage delivery</Button> : null}
      />
      {location.state?.created ? (
        <div className="k-callout k-callout-success" role="status">
          <HandHeart size={18} aria-hidden="true" />
          <div><strong>Donation offer sent</strong><p>The offer is pending the NGO’s response. Its status will update from the backend.</p></div>
        </div>
      ) : null}
      {donation.is_simulated ? (
        <div className="k-callout k-callout-warning"><ShieldCheck size={18} aria-hidden="true" /><div><strong>Simulated demo transaction</strong><p>This offer belongs to the backend’s simulated demo environment.</p></div></div>
      ) : null}
      <section className="k-result-hero k-donation-hero">
        <div className="k-result-hero-main">
          <p className="k-eyebrow">DONATION STATUS</p>
          <h2>{donation.ngo_name}</h2>
          <p>{donation.ngo_address || "Address not provided"}</p>
        </div>
        <dl className="k-result-hero-stats">
          <div><dt>Status</dt><dd><Badge tone={donation.status === "COMPLETED" ? "success" : donation.status === "CANCELLED" || donation.status === "REJECTED" ? "danger" : "warning"}>{labelFor(donation.status)}</Badge></dd></div>
          <div><dt>Food items</dt><dd>{donation.items?.length ?? 0}</dd></div>
          <div><dt>Offered quantity</dt><dd>{donationQuantity(donation.items)}</dd></div>
          <div><dt>Offer expiry</dt><dd>{donation.expires_at ? formatDateTime(donation.expires_at) : "—"}</dd></div>
        </dl>
      </section>

      <div className="k-redistribution-detail-grid">
        <Card>
          <CardHeader icon={HandHeart} title="Offered food" />
          <div className="k-card-body">
            <div className="k-redistribution-offer-lines">
              {(donation.items ?? []).map((item) => (
                <article className="k-redistribution-offer-line" key={item.id}>
                  <div className="k-redistribution-batch-heading">
                    <div><h3>{item.food_name}</h3><p>Waste batch #{item.waste_log_id}</p></div>
                  </div>
                  <dl className="k-redistribution-facts">
                    <div><dt>Offered</dt><dd>{formatQuantity(item.offered_servings, item.serving_unit)}</dd></div>
                    <div><dt>Received</dt><dd>{item.received_servings === null ? "Pending receipt" : formatQuantity(item.received_servings, item.serving_unit)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
            {donation.notes ? <div className="k-record-notes"><h3>Kitchen notes</h3><p>{donation.notes}</p></div> : null}
            {donation.receipt_notes ? <div className="k-record-notes"><h3>Receipt notes</h3><p>{donation.receipt_notes}</p></div> : null}
            {donation.rejection_reason ? <p className="k-callout k-callout-warning">Rejection reason: {donation.rejection_reason}</p> : null}
            {donation.cancellation_reason ? <p className="k-callout k-callout-warning">Cancellation reason: {donation.cancellation_reason}</p> : null}
            {donation.failure_reason ? <p className="k-callout k-callout-warning">Delivery failure: {donation.failure_reason}</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader icon={Truck} title="Donation timeline" />
          <div className="k-card-body">
            <ol className="k-redistribution-timeline">
              {timeline.map((step) => (
                <li className={step.at ? "is-complete" : ""} key={step.title}>
                  <span className="k-timeline-marker" aria-hidden="true" />
                  <div><strong>{step.title}</strong><small>{step.at ? formatDateTime(step.at) : "Not yet recorded"}</small></div>
                </li>
              ))}
              {["REJECTED", "CANCELLED"].includes(donation.status) ? (
                <li className="is-complete">
                  <span className="k-timeline-marker" aria-hidden="true" />
                  <div><strong>{labelFor(donation.status)}</strong><small>Current backend status · updated {formatDateTime(donation.updated_at)}</small></div>
                </li>
              ) : null}
            </ol>
            {donation.status === "DELIVERED" ? (
              <p className="k-callout k-callout-info">Delivery is recorded. NGO receipt confirmation is pending.</p>
            ) : null}
          </div>
        </Card>
      </div>

      {cancelable ? (
        <Card>
          <CardHeader title="Offer actions" subtitle="Only actions allowed for the current donation status are shown." />
          <div className="k-card-body">
            {!showCancel ? (
              <Button variant="secondary" onClick={() => setShowCancel(true)}>Cancel offer</Button>
            ) : (
              <form className="k-form" onSubmit={handleCancel} noValidate>
                <TextareaInput label="Reason for cancellation" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} required />
                <FormError message={actionError} />
                <div className="k-form-actions">
                  <Button type="submit" variant="danger" loading={saving}>Confirm cancellation</Button>
                  <Button type="button" variant="secondary" disabled={saving} onClick={() => { setShowCancel(false); setActionError(""); }}>Keep offer</Button>
                </div>
              </form>
            )}
          </div>
        </Card>
      ) : null}
      {manageable ? (
        <p className="k-page-footer-note">
          <ArrowRight size={14} aria-hidden="true" />
          <span>Manage assignment and dispatch from <Link to="/kitchen/delivery">Delivery</Link>. Backend safety checks remain authoritative.</span>
        </p>
      ) : null}
    </>
  );
}
