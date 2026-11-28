import { useEffect, useState } from "react";
import { MapPin, Save } from "lucide-react";
import { FormError, FormGrid, TextInput } from "../ui/Form.jsx";
import Button from "../ui/Button.jsx";
import PlaceSearch from "../ui/PlaceSearch.jsx";
import LocationPicker from "../kitchen/LocationPicker.jsx";

function formValues(organization) {
  return {
    name: organization?.name ?? "",
    address: organization?.address ?? "",
    phone: organization?.phone ?? "",
    latitude: organization?.latitude === undefined ? "" : String(organization.latitude),
    longitude: organization?.longitude === undefined ? "" : String(organization.longitude),
  };
}

export default function OrganizationForm({
  organization,
  saving,
  error,
  onSubmit,
  submitLabel,
}) {
  const [values, setValues] = useState(() => formValues(organization));
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    setValues(formValues(organization));
  }, [organization]);

  function setField(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setValidationError("");
  }

  function applyPlace({ address, latitude, longitude }) {
    setValues((current) => ({
      ...current,
      address,
      latitude: String(latitude),
      longitude: String(longitude),
    }));
    setValidationError("");
  }

  function handleSubmit(event) {
    event.preventDefault();
    const latitude = Number(values.latitude);
    const longitude = Number(values.longitude);
    if (!values.name.trim() || values.name.trim().length > 200) {
      setValidationError("Enter an organization name (up to 200 characters).");
      return;
    }
    if (!values.address.trim() || values.address.trim().length > 2000) {
      setValidationError("Enter an address (up to 2,000 characters).");
      return;
    }
    const digits = values.phone.replace(/\D/g, "");
    if (values.phone.length < 7 || values.phone.length > 20 || digits.length < 7 || digits.length > 15) {
      setValidationError("Enter a valid phone number with 7–15 digits.");
      return;
    }
    if (values.latitude === "" || values.longitude === ""
      || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setValidationError("Choose valid latitude and longitude coordinates on the map or enter them below.");
      return;
    }
    onSubmit({
      name: values.name.trim(),
      address: values.address.trim(),
      phone: values.phone.trim(),
      latitude,
      longitude,
    });
  }

  const latitude = values.latitude === "" ? Number.NaN : Number(values.latitude);
  const longitude = values.longitude === "" ? Number.NaN : Number(values.longitude);

  return (
    <form className="k-form" onSubmit={handleSubmit} noValidate>
      <PlaceSearch onSelect={applyPlace} />
      <FormGrid columns={2}>
        <TextInput
          label="Organization name"
          value={values.name}
          onChange={(event) => setField("name", event.target.value)}
          maxLength={200}
          required
        />
        <TextInput
          label="Phone number"
          type="tel"
          value={values.phone}
          onChange={(event) => setField("phone", event.target.value)}
          maxLength={20}
          required
        />
        <TextInput
          label="Address"
          value={values.address}
          onChange={(event) => setField("address", event.target.value)}
          maxLength={2000}
          className="k-field-span-2"
          required
        />
        <TextInput
          label="Latitude"
          type="number"
          min="-90"
          max="90"
          step="any"
          value={values.latitude}
          onChange={(event) => setField("latitude", event.target.value)}
          required
        />
        <TextInput
          label="Longitude"
          type="number"
          min="-180"
          max="180"
          step="any"
          value={values.longitude}
          onChange={(event) => setField("longitude", event.target.value)}
          required
        />
      </FormGrid>
      <div className="k-organization-map-section">
        <h3><MapPin size={16} aria-hidden="true" /> Organization location</h3>
        <p>Search for a place above or click the map to set coordinates. Confirm the location before saving.</p>
        <LocationPicker
          latitude={latitude}
          longitude={longitude}
          onChange={(nextLatitude, nextLongitude) => {
            setValues((current) => ({
              ...current,
              latitude: String(nextLatitude),
              longitude: String(nextLongitude),
            }));
            setValidationError("");
          }}
          height={280}
        />
      </div>
      <FormError message={validationError || error} />
      <div className="k-form-actions">
        <Button type="submit" icon={Save} loading={saving}>{submitLabel}</Button>
      </div>
    </form>
  );
}
