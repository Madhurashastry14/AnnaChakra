import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, HandHeart, PackageCheck, Truck, Users } from "lucide-react";
import { listRequirements } from "../../services/ngos.js";
import {
  getRedistributionSummary,
  listAllDeliveries,
  listAllDonations,
} from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDateTime, formatNumber, formatQuantity, labelFor, sumByUnit, todayISO } from "../../utils/format.js";
import { usePortal } from "../../components/portal/PortalLayout.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import MetricCard from "../../components/ui/MetricCard.jsx";
import { Badge, VerificationBadge } from "../../components/ui/Badge.jsx";
import { ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";

function statusTone(status) {
  if (status === "COMPLETED" || status === "DELIVERED") return "success";
  if (status === "REJECTED" || status === "CANCELLED") return "danger";
  if (status === "PENDING") return "warning";
  return "info";
}

function isRequirementCurrent(requirement) {
  return requirement.is_active
    && requirement.required_date >= todayISO()
    && new Date(requirement.available_until).getTime() > Date.now();
}

export default function NgoDashboardPage() {
  const { organization } = usePortal();
  const [data, setData] = useState({ requirements: [], donations: [], deliveries: [], summary: null });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const requests = [
      ["requirements", listRequirements()],
      ["donations", listAllDonations()],
      ["deliveries", listAllDeliveries()],
      ["summary", getRedistributionSummary()],
    ];
    Promise.allSettled(requests.map(([, request]) => request))
      .then((results) => {
        if (!active) return;
        const next = { requirements: [], donations: [], deliveries: [], summary: null };
        const nextErrors = {};
        results.forEach((result, index) => {
          const key = requests[index][0];
          if (result.status === "rejected") nextErrors[key] = getErrorMessage(result.reason);
          else if (key === "summary") next.summary = result.value;
          else next[key] = result.value;
        });
        setData(next);
        setErrors(nextErrors);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const donationsById = useMemo(() => new Map(data.donations.map((donation) => [donation.id, donation])), [data.donations]);
  const recent = useMemo(
    () => [...data.donations].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6),
    [data.donations],
  );
  const activeRequirements = data.requirements.filter(isRequirementCurrent);
  const pendingOffers = data.donations.filter((donation) => donation.status === "PENDING");
  const incomingDeliveries = data.deliveries.filter((delivery) => (
    ["ASSIGNED", "IN_TRANSIT"].includes(delivery.status)
    || (delivery.status === "DELIVERED" && donationsById.get(delivery.donation_id)?.status === "DELIVERED")
  ));
  const completedDonations = data.donations.filter((donation) => donation.status === "COMPLETED");
  const received = sumByUnit(data.summary?.summary?.quantities, "received_quantity");

  if (loading) {
    return <><PageHeader eyebrow="NGO OVERVIEW" title={`Welcome, ${organization.name}`} description="A live view of requirements, incoming donations and received food." /><LoadingSkeleton variant="page" /></>;
  }

  const failed = Object.entries(errors).map(([key]) => ({
    requirements: "requirements",
    donations: "donations",
    deliveries: "deliveries",
    summary: "impact totals",
  }[key] ?? key));

  return (
    <>
      <PageHeader
        eyebrow="NGO OVERVIEW"
        title={`Welcome, ${organization.name}`}
        description="A live view of your organization’s food requirements, offers and confirmed receipts."
        actions={<Button to="/ngo/requirements/new" icon={PackageCheck}>Create requirement</Button>}
      />
      {organization.verification_status !== "VERIFIED" ? (
        <div className="k-callout k-callout-warning">
          <VerificationBadge status={organization.verification_status} />
          <div><strong>Redistribution access depends on verification</strong><p>Your organization’s current status is {labelFor(organization.verification_status).toLowerCase()}. Backend eligibility checks remain in force.</p><Button size="sm" variant="secondary" to="/ngo/profile">Review organization profile</Button></div>
        </div>
      ) : null}
      {failed.length ? (
        <div className="k-callout k-callout-warning">
          <div><strong>Some dashboard data could not load</strong><p>{failed.join(", ")}. Other values shown are live API results.</p><Button size="sm" variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>Retry</Button></div>
        </div>
      ) : null}

      <div className="k-metric-grid k-portal-metrics">
        <MetricCard label="Active food requirements" value={errors.requirements ? "Unavailable" : formatNumber(activeRequirements.length)} hint={errors.requirements || "Requirements marked active"} icon={PackageCheck} />
        <MetricCard label="Pending donation offers" value={errors.donations ? "Unavailable" : formatNumber(pendingOffers.length)} hint={errors.donations || "Awaiting your response"} icon={HandHeart} />
        <MetricCard label="Incoming deliveries" value={errors.deliveries ? "Unavailable" : formatNumber(incomingDeliveries.length)} hint={errors.deliveries || "Assigned, in transit or delivered"} icon={Truck} />
        <MetricCard label="Completed donations" value={errors.donations ? "Unavailable" : formatNumber(completedDonations.length)} hint={errors.donations || "Receipt confirmed"} icon={Users} />
        <MetricCard
          label="Food successfully received"
          value={errors.summary ? "Unavailable" : <span className="k-metric-split"><span>{formatQuantity(received.serving, "serving")}</span><small>{formatQuantity(received.piece, "piece")}</small></span>}
          hint={errors.summary || "Recorded quantities kept separate by unit"}
          icon={HandHeart}
        />
      </div>

      <div className="k-dashboard-top-grid k-portal-dashboard-grid">
        <Card>
          <CardHeader icon={PackageCheck} title="Quick actions" subtitle="Keep your receiving needs and incoming offers current." />
          <div className="k-card-body">
            <div className="k-quick-actions">
              <Link className="k-quick-action" to="/ngo/requirements/new"><span><PackageCheck size={18} /></span>Create a food requirement<ArrowRight size={14} className="k-quick-arrow" /></Link>
              <Link className="k-quick-action" to="/ngo/donations"><span><HandHeart size={18} /></span>Review donation offers<ArrowRight size={14} className="k-quick-arrow" /></Link>
              <Link className="k-quick-action" to="/ngo/deliveries"><span><Truck size={18} /></span>Track incoming deliveries<ArrowRight size={14} className="k-quick-arrow" /></Link>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader icon={CalendarDays} title="Recent donation activity" subtitle="Latest offers sent to this NGO." action={<Button size="sm" variant="ghost" to="/ngo/donations">All offers <ArrowRight size={14} /></Button>} />
          <div className="k-card-body">
            {errors.donations ? <ErrorState message={errors.donations} onRetry={() => setReloadKey((key) => key + 1)} /> : recent.length ? (
              <ul className="k-portal-activity">
                {recent.map((donation) => (
                  <li key={donation.id}>
                    <div><Link to={`/ngo/donations/${donation.id}`}><strong>Offer #{donation.id}</strong></Link><small>{donation.kitchen_name} · {formatDateTime(donation.created_at)}</small></div>
                    <Badge tone={statusTone(donation.status)}>{donation.expired ? "Expired" : labelFor(donation.status)}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="k-muted-text">No donation activity yet.</p>}
          </div>
        </Card>
      </div>
      {incomingDeliveries.length ? (
        <Card>
          <CardHeader icon={Truck} title="Incoming delivery progress" subtitle="Current status and recorded handoff times." action={<Button size="sm" variant="ghost" to="/ngo/deliveries">View deliveries <ArrowRight size={14} /></Button>} />
          <div className="k-card-body">
            <ul className="k-portal-activity">
              {incomingDeliveries.slice(0, 5).map((delivery) => {
                const donation = donationsById.get(delivery.donation_id);
                return (
                  <li key={delivery.id}>
                    <div>
                      <Link to={`/ngo/donations/${delivery.donation_id}`}><strong>Donation #{delivery.donation_id}</strong></Link>
                      <small>{donation?.kitchen_name ?? "Kitchen"} · {delivery.delivery_person_name ?? "Delivery person not provided"} · {delivery.delivered_at ? formatDateTime(delivery.delivered_at) : delivery.dispatched_at ? formatDateTime(delivery.dispatched_at) : "Not dispatched"}</small>
                    </div>
                    <Badge tone={statusTone(donation?.status)}>{labelFor(donation?.status)}</Badge>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      ) : null}
    </>
  );
}
