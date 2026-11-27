import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HandHeart } from "lucide-react";
import { registerNGO } from "../../services/ngos.js";
import { getErrorMessage } from "../../utils/errors.js";
import { usePortal } from "../../components/portal/PortalLayout.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import OrganizationForm from "../../components/portal/OrganizationForm.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

export default function NgoSetupPage() {
  const navigate = useNavigate();
  const { refreshOrganization } = usePortal();
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(payload) {
    setSaving(true);
    setError("");
    try {
      await registerNGO(payload);
      await refreshOrganization();
      notify("NGO profile created. Verification is pending.");
      navigate("/ngo/dashboard", { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We couldn’t register this NGO."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="NGO ONBOARDING"
        title="Register your organization"
        description="Provide current contact and location details. Your verification status is set by an administrator."
      />
      <Card>
        <CardHeader icon={HandHeart} title="Organization details" subtitle="All fields are required by the registration API." />
        <div className="k-card-body">
          <OrganizationForm
            saving={saving}
            error={error}
            onSubmit={handleSubmit}
            submitLabel="Register NGO"
          />
        </div>
      </Card>
    </>
  );
}
