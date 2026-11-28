import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Info,
  LogOut,
  Navigation,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useKitchen } from "../../components/kitchen/KitchenLayout.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { updateMyKitchen } from "../../services/kitchens.js";
import { getErrorMessage } from "../../utils/errors.js";
import {
  kitchenFormFrom,
  kitchenPayload,
  validateKitchenForm,
} from "../../utils/kitchen.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { VerificationBadge } from "../../components/ui/Badge.jsx";
import { FormError, FormGrid, TextInput } from "../../components/ui/Form.jsx";
import PlaceSearch from "../../components/ui/PlaceSearch.jsx";
import LocationPicker from "../../components/kitchen/LocationPicker.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";
import { formatDate, formatDateTime, labelFor } from "../../utils/format.js";

const VERIFICATION_COPY = {
  PENDING: {
    title: "Pending verification",
    body: "Your kitchen can use forecasting, meal records, the scanner and waste analytics. Redistribution stays unavailable until an administrator verifies the kitchen and the food safety screening passes.",
  },
  VERIFIED: {
    title: "Kitchen verified",
    body: "Your kitchen is verified. Food still needs to pass the backend safety screening before it can be redistributed.",
  },
  REJECTED: {
    title: "Verification rejected",
    body: "Redistribution is unavailable. Contact the AnnaChakra administrator for a review. Kitchen staff cannot change verification status.",
  },
};

export default function KitchenSettingsPage() {
  const { kitchen, refreshKitchen } = useKitchen();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [form, setForm] = useState(() => kitchenFormFrom(kitchen));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");

  useEffect(() => {
    setForm(kitchenFormFrom(kitchen));
  }, [kitchen]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function setCoordinates(latitude, longitude) {
    setForm((current) => ({
      ...current,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
    }));
    setErrors((current) => ({ ...current, latitude: undefined, longitude: undefined }));
  }

  function applyPlace({ address, latitude, longitude }) {
    setForm((current) => ({
      ...current,
      address,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
    }));
    setErrors((current) => ({
      ...current,
      address: undefined,
      latitude: undefined,
      longitude: undefined,
    }));
    setLocationMessage("Address and coordinates updated from the selected place. Save the form to apply it.");
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("Location access is not supported. Enter coordinates manually.");
      return;
    }
    setLocating(true);
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates(position.coords.latitude, position.coords.longitude);
        setLocating(false);
        setLocationMessage("Location updated. Save the form to apply it.");
      },
      () => {
        setLocating(false);
        setLocationMessage("Location access was not available. Enter coordinates manually or click the map.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validateKitchenForm(form);
    setErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await updateMyKitchen(kitchenPayload(form));
      await refreshKitchen();
      notify("Kitchen profile updated.");
    } catch (error) {
      setSubmitError(getErrorMessage(error, "We couldn’t update the kitchen profile."));
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const verification = VERIFICATION_COPY[kitchen.verification_status] ?? VERIFICATION_COPY.PENDING;

  return (
    <>
      <PageHeader
        eyebrow="ACCOUNT"
        title="Kitchen settings"
        description="Keep your kitchen profile accurate. Verification status is managed by AnnaChakra administrators."
      />

      <div className="k-settings-layout">
        <section className="k-card">
          <div className="k-card-header">
            <div className="k-card-heading">
              <span className="k-card-icon" aria-hidden="true"><Building2 size={18} /></span>
              <div>
                <h2>Kitchen profile</h2>
                <p>These details are used across forecasts, records and redistribution.</p>
              </div>
            </div>
            <VerificationBadge status={kitchen.verification_status} />
          </div>

          <form className="k-card-body k-form" onSubmit={handleSubmit} noValidate>
            <PlaceSearch onSelect={applyPlace} />
            <FormGrid columns={2}>
              <TextInput
                label="Kitchen name"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                error={errors.name}
                maxLength={200}
                required
              />
              <TextInput
                label="Phone number"
                value={form.phone}
                onChange={(event) => setField("phone", event.target.value)}
                error={errors.phone}
                maxLength={20}
                required
              />
              <TextInput
                label="Address"
                value={form.address}
                onChange={(event) => setField("address", event.target.value)}
                error={errors.address}
                maxLength={2000}
                required
                className="k-field-span-2"
              />
              <TextInput
                label="Latitude"
                type="number"
                step="any"
                min="-90"
                max="90"
                value={form.latitude}
                onChange={(event) => setField("latitude", event.target.value)}
                error={errors.latitude}
                required
              />
              <TextInput
                label="Longitude"
                type="number"
                step="any"
                min="-180"
                max="180"
                value={form.longitude}
                onChange={(event) => setField("longitude", event.target.value)}
                error={errors.longitude}
                required
              />
            </FormGrid>

            <div className="k-location-toolbar">
              <Button
                variant="secondary"
                size="sm"
                icon={Navigation}
                onClick={useCurrentLocation}
                loading={locating}
              >
                Use my current location
              </Button>
              <span className="k-muted-text">or search for a place above, or click the map to adjust the pin</span>
            </div>
            {locationMessage ? <p className="k-note">{locationMessage}</p> : null}

            <LocationPicker
              latitude={Number(form.latitude)}
              longitude={Number(form.longitude)}
              onChange={setCoordinates}
            />

            <FormError message={submitError} />

            <div className="k-form-actions">
              <Button type="submit" loading={submitting}>Save changes</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setForm(kitchenFormFrom(kitchen));
                  setErrors({});
                  setSubmitError("");
                }}
                disabled={submitting}
              >
                Reset
              </Button>
            </div>
          </form>
        </section>

        <aside className="k-settings-aside">
          <section className={`k-verification-card k-verification-${kitchen.verification_status.toLowerCase()}`}>
            <span className="k-info-icon" aria-hidden="true"><ShieldCheck size={20} /></span>
            <h2>{verification.title}</h2>
            <p>{verification.body}</p>
            <dl className="k-detail-list">
              <div>
                <dt>Kitchen ID</dt>
                <dd>#{kitchen.id}</dd>
              </div>
              <div>
                <dt>Registered</dt>
                <dd>{formatDate(kitchen.created_at)}</dd>
              </div>
              <div>
                <dt>Last profile record</dt>
                <dd>{formatDateTime(kitchen.created_at)}</dd>
              </div>
            </dl>
            <p className="k-note">
              <Info size={14} aria-hidden="true" />
              You cannot change verification status from this page. The backend also controls
              whether surplus food is eligible for redistribution.
            </p>
          </section>

          <section className="k-card">
            <div className="k-card-header">
              <div className="k-card-heading">
                <span className="k-card-icon" aria-hidden="true"><UserRound size={18} /></span>
                <div>
                  <h2>Signed-in account</h2>
                  <p>Your kitchen-staff account details.</p>
                </div>
              </div>
            </div>
            <div className="k-card-body">
              <div className="k-account-row">
                <span className="k-avatar k-avatar-lg" aria-hidden="true">
                  {user?.name?.charAt(0)?.toUpperCase()}
                </span>
                <div>
                  <strong>{user?.name}</strong>
                  <span>{user?.email}</span>
                  <small>{labelFor(user?.role)}</small>
                </div>
              </div>
              <ul className="k-check-list">
                <li><CheckCircle2 size={15} /> Tokens are kept in this browser session only.</li>
                <li><BadgeCheck size={15} /> Signing out clears the session token.</li>
              </ul>
              <Button variant="secondary" icon={LogOut} onClick={handleLogout}>
                Sign out
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
