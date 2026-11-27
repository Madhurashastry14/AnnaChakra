import { useState } from "react";
import { HandHeart, ShieldCheck } from "lucide-react";
import { updateMyNGO } from "../../services/ngos.js";
import { getErrorMessage } from "../../utils/errors.js";
import { usePortal } from "../../components/portal/PortalLayout.jsx";
import { formatDateTime, labelFor } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { VerificationBadge } from "../../components/ui/Badge.jsx";
import OrganizationForm from "../../components/portal/OrganizationForm.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

const STATUS_GUIDANCE = {
  PENDING: "Your profile is awaiting administrator review. Redistribution actions are restricted until verified.",
  VERIFIED: "Your organization is verified and can participate in redistribution, subject to all safety and capacity checks.",
  REJECTED: "Your organization is not verified. Contact an administrator for next steps.",
};

export default function NgoProfilePage() {
  const { organization, refreshOrganization } = usePortal();
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(payload) {
    setSaving(true);
    setError("");
    try {
      await updateMyNGO(payload);
      await refreshOrganization();
      notify("Organization profile updated.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We couldn’t update your organization profile."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="ORGANIZATION"
        title="Organization profile"
        description="Keep your contact and location details current. Verification status can only be changed by an administrator."
      />
      <Card>
        <CardHeader
          icon={ShieldCheck}
          title="Verification status"
          subtitle={`Registered ${formatDateTime(organization.created_at)}`}
          action={<VerificationBadge status={organization.verification_status} />}
        />
        <div className="k-card-body">
          <div className={`k-callout ${organization.verification_status === "VERIFIED" ? "k-callout-success" : "k-callout-warning"}`}>
            <ShieldCheck size={18} aria-hidden="true" />
            <div>
              <strong>{labelFor(organization.verification_status)}</strong>
              <p>{STATUS_GUIDANCE[organization.verification_status] ?? "Verification status is managed by an administrator."}</p>
            </div>
          </div>
        </div>
      </Card>
      <Card className="k-portal-form-card">
        <CardHeader icon={HandHeart} title="Organization details" />
        <div className="k-card-body">
          <OrganizationForm
            organization={organization}
            saving={saving}
            error={error}
            onSubmit={handleSubmit}
            submitLabel="Save profile"
          />
        </div>
      </Card>
    </>
  );
}
