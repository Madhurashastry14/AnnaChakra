import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CookingPot,
  Info,
  Leaf,
  MapPin,
  Navigation,
  ShieldCheck,
} from "lucide-react";
import { createKitchen, getMyKitchen } from "../../services/kitchens.js";
import { getErrorMessage, isNotFound } from "../../utils/errors.js";
import {
  kitchenFormFrom,
  kitchenPayload,
  validateKitchenForm,
} from "../../utils/kitchen.js";
import { VerificationBadge } from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import { FormError, FormGrid, TextInput } from "../../components/ui/Form.jsx";
import { ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import LocationPicker from "../../components/kitchen/LocationPicker.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";
import { formatDate } from "../../utils/format.js";

export default function KitchenSetupPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [existingKitchen, setExistingKitchen] = useState(null);
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState("");
  const [form, setForm] = useState(kitchenFormFrom());
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");

  async function checkKitchen() {
    setChecking(true);
    setCheckError("");
    try {
      const data = await getMyKitchen();
      setExistingKitchen(data);
    } catch (error) {
      if (!isNotFound(error)) {
        setCheckError(getErrorMessage(error, "We couldn’t check your kitchen profile."));
      }
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    checkKitchen();
  }, []);

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

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("Your browser does not support location access. Enter coordinates manually.");
      return;
    }
    setLocating(true);
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates(position.coords.latitude, position.coords.longitude);
        setLocating(false);
        setLocationMessage("Location added. Adjust the pin by clicking the map if needed.");
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
      await createKitchen(kitchenPayload(form));
      notify("Kitchen registered. Welcome to the workspace.");
      navigate("/kitchen/dashboard", { replace: true });
    } catch (error) {
      if (error?.response?.status === 409) {
        setSubmitError("A kitchen is already registered for this account. Loading its profile…");
        await checkKitchen();
      } else {
        setSubmitError(getErrorMessage(error, "We couldn’t register the kitchen."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <main className="k-setup-page">
        <div className="k-setup-topbar">
          <Link className="k-brand" to="/">
            <span className="k-brand-mark" aria-hidden="true"><Leaf size={20} /></span>
            <span className="k-brand-text">Anna<span>Chakra</span><small>Kitchen workspace</small></span>
          </Link>
        </div>
        <div className="k-setup-loading"><LoadingSkeleton rows={6} /></div>
      </main>
    );
  }

  if (checkError) {
    return (
      <main className="k-setup-page">
        <div className="k-setup-topbar">
          <Link className="k-brand" to="/">
            <span className="k-brand-mark" aria-hidden="true"><Leaf size={20} /></span>
            <span className="k-brand-text">Anna<span>Chakra</span><small>Kitchen workspace</small></span>
          </Link>
        </div>
        <div className="k-setup-card">
          <ErrorState message={checkError} onRetry={checkKitchen} />
        </div>
      </main>
    );
  }

  if (existingKitchen) {
    return (
      <main className="k-setup-page">
        <div className="k-setup-topbar">
          <Link className="k-brand" to="/">
            <span className="k-brand-mark" aria-hidden="true"><Leaf size={20} /></span>
            <span className="k-brand-text">Anna<span>Chakra</span><small>Kitchen workspace</small></span>
          </Link>
          <Link className="k-back-link" to="/"><ArrowLeft size={15} /> Back to home</Link>
        </div>
        <section className="k-setup-card k-setup-existing">
          <span className="k-setup-icon" aria-hidden="true"><CookingPot size={24} /></span>
          <p className="k-eyebrow">KITCHEN FOUND</p>
          <h1>Your kitchen is already registered.</h1>
          <p className="k-muted-text">
            Continue to the workspace, or review the kitchen profile and verification details.
          </p>
          <div className="k-existing-kitchen">
            <div>
              <strong>{existingKitchen.name}</strong>
              <span>{existingKitchen.address}</span>
              <span>{existingKitchen.phone}</span>
            </div>
            <div className="k-existing-meta">
              <VerificationBadge status={existingKitchen.verification_status} />
              <small>Registered {formatDate(existingKitchen.created_at)}</small>
            </div>
          </div>
          <div className="k-setup-actions">
            <Button to="/kitchen/dashboard" iconRight={ArrowRight}>Go to dashboard</Button>
            <Button to="/kitchen/settings" variant="secondary">Kitchen settings</Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="k-setup-page">
      <div className="k-setup-topbar">
        <Link className="k-brand" to="/">
          <span className="k-brand-mark" aria-hidden="true"><Leaf size={20} /></span>
          <span className="k-brand-text">Anna<span>Chakra</span><small>Kitchen workspace</small></span>
        </Link>
        <Link className="k-back-link" to="/"><ArrowLeft size={15} /> Back to home</Link>
      </div>

      <div className="k-setup-layout">
        <section className="k-setup-card">
          <span className="k-setup-icon" aria-hidden="true"><CookingPot size={24} /></span>
          <p className="k-eyebrow">KITCHEN ONBOARDING</p>
          <h1>Register your kitchen.</h1>
          <p className="k-muted-text">
            Tell us where your kitchen is and how to reach it. You can update these details later
            in settings.
          </p>

          <form className="k-form" onSubmit={handleSubmit} noValidate>
            <FormGrid columns={2}>
              <TextInput
                label="Kitchen name"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                error={errors.name}
                placeholder="e.g. Green Leaf Community Kitchen"
                maxLength={200}
                required
              />
              <TextInput
                label="Phone number"
                value={form.phone}
                onChange={(event) => setField("phone", event.target.value)}
                error={errors.phone}
                placeholder="e.g. +91 98765 43210"
                maxLength={20}
                required
              />
              <TextInput
                label="Address"
                value={form.address}
                onChange={(event) => setField("address", event.target.value)}
                error={errors.address}
                placeholder="Street, area, city"
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
                placeholder="e.g. 12.9716"
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
                placeholder="e.g. 77.5946"
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
              <span className="k-muted-text">or click the map to place the kitchen</span>
            </div>
            {locationMessage ? <p className="k-note">{locationMessage}</p> : null}

            <LocationPicker
              latitude={Number(form.latitude)}
              longitude={Number(form.longitude)}
              onChange={setCoordinates}
            />

            <FormError message={submitError} />

            <div className="k-form-actions">
              <Button type="submit" loading={submitting} iconRight={ArrowRight}>
                Register kitchen
              </Button>
              <Button variant="ghost" to="/kitchen/dashboard" disabled={submitting}>
                Skip for now
              </Button>
            </div>
          </form>
        </section>

        <aside className="k-setup-aside">
          <section className="k-setup-info-card">
            <span className="k-info-icon" aria-hidden="true"><ShieldCheck size={20} /></span>
            <h2>Verification and redistribution</h2>
            <div className="k-status-explainer">
              <div>
                <VerificationBadge status="PENDING" />
                <p>New kitchens start pending. Forecasting, meal records and waste analytics remain available.</p>
              </div>
              <div>
                <VerificationBadge status="VERIFIED" />
                <p>Verified kitchens can proceed with redistribution when the food safety screening also passes.</p>
              </div>
              <div>
                <VerificationBadge status="REJECTED" />
                <p>Contact the AnnaChakra administrator if verification is rejected. You cannot change this status yourself.</p>
              </div>
            </div>
            <p className="k-note">
              <Info size={14} aria-hidden="true" />
              Unverified kitchens cannot redistribute food. The backend will show pending safety
              reasons until verification and the required safety information are in place.
            </p>
          </section>

          <section className="k-setup-info-card k-setup-checklist">
            <h2>What you can do right away</h2>
            <ul>
              <li><CheckCircle2 size={15} /> Generate demand forecasts</li>
              <li><CheckCircle2 size={15} /> Record meals and waste</li>
              <li><CheckCircle2 size={15} /> Review waste intelligence</li>
              <li><CheckCircle2 size={15} /> Scan food with the AI scanner</li>
            </ul>
          </section>

          <section className="k-setup-info-card">
            <span className="k-info-icon" aria-hidden="true"><MapPin size={20} /></span>
            <h2>Why coordinates?</h2>
            <p>
              Coordinates help match surplus food with nearby community partners when
              redistribution becomes available. Manual entry is always supported.
            </p>
            <p className="k-muted-text">
              Map tiles by OpenStreetMap contributors.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
