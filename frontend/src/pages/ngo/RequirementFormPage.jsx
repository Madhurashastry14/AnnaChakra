import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CalendarDays, PackageCheck } from "lucide-react";
import { createRequirement, getRequirement, updateRequirement } from "../../services/ngos.js";
import { getErrorMessage, isNotFound } from "../../utils/errors.js";
import { fromDateTimeLocal, todayISO, toDateTimeLocal } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { CheckboxField, FormError, FormGrid, TextInput, TextareaInput } from "../../components/ui/Form.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

function emptyForm() {
  return {
    people_to_feed: "",
    capacity_servings: "0",
    capacity_pieces: "0",
    accepted_categories: "",
    accepts_vegetarian: true,
    accepts_non_vegetarian: false,
    required_date: todayISO(),
    available_until: "",
    is_active: true,
  };
}

function toForm(requirement) {
  return {
    people_to_feed: String(requirement.people_to_feed),
    capacity_servings: String(requirement.capacity_servings),
    capacity_pieces: String(requirement.capacity_pieces),
    accepted_categories: (requirement.accepted_categories ?? []).join(", "),
    accepts_vegetarian: requirement.accepts_vegetarian,
    accepts_non_vegetarian: requirement.accepts_non_vegetarian,
    required_date: requirement.required_date,
    available_until: toDateTimeLocal(requirement.available_until),
    is_active: requirement.is_active,
  };
}

function buildPayload(form) {
  return {
    people_to_feed: Number(form.people_to_feed),
    capacity_servings: Number(form.capacity_servings),
    capacity_pieces: Number(form.capacity_pieces),
    accepted_categories: form.accepted_categories
      .split(/[,\n]/)
      .map((category) => category.trim())
      .filter(Boolean),
    accepts_vegetarian: form.accepts_vegetarian,
    accepts_non_vegetarian: form.accepts_non_vegetarian,
    required_date: form.required_date,
    available_until: fromDateTimeLocal(form.available_until),
    is_active: form.is_active,
  };
}

export default function RequirementFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const editing = Boolean(id);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) return undefined;
    let active = true;
    setLoading(true);
    setLoadError("");
    setNotFound(false);
    getRequirement(id)
      .then((requirement) => { if (active) setForm(toForm(requirement)); })
      .catch((requestError) => {
        if (!active) return;
        if (isNotFound(requestError)) setNotFound(true);
        else setLoadError(getErrorMessage(requestError, "We couldn’t load this requirement."));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [editing, id]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const people = Number(form.people_to_feed);
    const servings = Number(form.capacity_servings);
    const pieces = Number(form.capacity_pieces);
    const categories = form.accepted_categories.split(/[,\n]/).map((value) => value.trim()).filter(Boolean);
    if (!Number.isInteger(people) || people <= 0) {
      setError("Enter a whole number greater than zero for people to feed.");
      return;
    }
    if (!Number.isFinite(servings) || servings < 0 || servings > 1e9) {
      setError("Enter a valid serving capacity of zero or more.");
      return;
    }
    if (!Number.isInteger(pieces) || pieces < 0 || pieces > 1e9) {
      setError("Enter a whole-number piece capacity of zero or more.");
      return;
    }
    if (categories.length > 30 || categories.some((category) => category.length > 50)) {
      setError("Use no more than 30 food categories, each 50 characters or fewer.");
      return;
    }
    if (!form.accepts_vegetarian && !form.accepts_non_vegetarian && form.is_active) {
      setError("An active requirement must accept at least one dietary group.");
      return;
    }
    if (!form.required_date || !form.available_until || !fromDateTimeLocal(form.available_until)) {
      setError("Enter both the required date and the availability deadline.");
      return;
    }
    if (form.is_active && (form.required_date < todayISO() || new Date(form.available_until).getTime() <= Date.now())) {
      setError("An active requirement needs a current or future date and a future availability deadline.");
      return;
    }
    if (form.available_until.slice(0, 10) < form.required_date) {
      setError("The availability deadline must cover the required date.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = buildPayload(form);
      if (editing) await updateRequirement(id, payload);
      else await createRequirement(payload);
      notify(editing ? "Requirement updated." : "Requirement created.");
      navigate("/ngo/requirements", { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "We couldn’t save this requirement."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <><PageHeader eyebrow="NGO OPERATIONS" title={editing ? "Edit requirement" : "Create requirement"} backTo="/ngo/requirements" backLabel="Food requirements" /><LoadingSkeleton variant="page" /></>;
  }
  if (notFound) {
    return (
      <>
        <PageHeader eyebrow="NGO OPERATIONS" title="Requirement" backTo="/ngo/requirements" backLabel="Food requirements" />
        <EmptyState icon={PackageCheck} title="Requirement not found" description="This requirement does not exist for your organization." action={<Button to="/ngo/requirements">Return to requirements</Button>} />
      </>
    );
  }
  if (loadError) {
    return <><PageHeader eyebrow="NGO OPERATIONS" title="Requirement" backTo="/ngo/requirements" backLabel="Food requirements" /><ErrorState message={loadError} onRetry={() => window.location.reload()} /></>;
  }

  return (
    <>
      <PageHeader
        eyebrow="NGO OPERATIONS"
        title={editing ? "Edit requirement" : "Create food requirement"}
        description="People to feed and food capacity are separate values. Serving and piece capacity are maintained independently."
        backTo="/ngo/requirements"
        backLabel="Food requirements"
      />
      <Card>
        <CardHeader icon={PackageCheck} title="Requirement details" subtitle="Remaining capacity is calculated by the backend and is not an editable field." />
        <div className="k-card-body">
          <form className="k-form" onSubmit={handleSubmit} noValidate>
            <FormGrid columns={2}>
              <TextInput
                label="People to feed"
                type="number"
                min="1"
                step="1"
                value={form.people_to_feed}
                onChange={(event) => setField("people_to_feed", event.target.value)}
                required
              />
              <TextInput
                label="Capacity in servings"
                type="number"
                min="0"
                max="1000000000"
                step="any"
                value={form.capacity_servings}
                onChange={(event) => setField("capacity_servings", event.target.value)}
                required
              />
              <TextInput
                label="Capacity in pieces"
                type="number"
                min="0"
                max="1000000000"
                step="1"
                value={form.capacity_pieces}
                onChange={(event) => setField("capacity_pieces", event.target.value)}
                required
              />
              <TextInput
                label="Required date"
                type="date"
                value={form.required_date}
                onChange={(event) => setField("required_date", event.target.value)}
                required
              />
              <TextInput
                label="Available until"
                type="datetime-local"
                value={form.available_until}
                onChange={(event) => setField("available_until", event.target.value)}
                required
              />
              <div className="k-portal-checkboxes">
                <CheckboxField label="Accept vegetarian food" checked={form.accepts_vegetarian} onChange={(event) => setField("accepts_vegetarian", event.target.checked)} />
                <CheckboxField label="Accept non-vegetarian food" checked={form.accepts_non_vegetarian} onChange={(event) => setField("accepts_non_vegetarian", event.target.checked)} />
                <CheckboxField label="Requirement is active" description="Inactive requirements will not be matched." checked={form.is_active} onChange={(event) => setField("is_active", event.target.checked)} />
              </div>
              <TextareaInput
                label="Accepted food categories"
                rows={3}
                value={form.accepted_categories}
                onChange={(event) => setField("accepted_categories", event.target.value)}
                maxLength={1600}
                hint="Separate categories with commas. Leave blank for no category restriction; dietary choices still apply."
                className="k-field-span-2"
              />
            </FormGrid>
            <p className="k-note"><CalendarDays size={14} aria-hidden="true" /> Active requirements for future dates are recorded now and become matchable on their required date.</p>
            <FormError message={error} />
            <div className="k-form-actions">
              <Button type="submit" loading={saving}>{editing ? "Save changes" : "Create requirement"}</Button>
              <Button type="button" variant="secondary" to="/ngo/requirements" disabled={saving}>Cancel</Button>
            </div>
          </form>
        </div>
      </Card>
    </>
  );
}
