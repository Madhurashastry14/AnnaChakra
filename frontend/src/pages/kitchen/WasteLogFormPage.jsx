import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  RotateCcw,
  Save,
  ScanLine,
  Trash2,
} from "lucide-react";
import {
  createWasteLog,
  getWasteLog,
  updateWasteLog,
} from "../../services/wasteLogs.js";
import { listFoodItems } from "../../services/foodItems.js";
import { getErrorMessage, isNotFound } from "../../utils/errors.js";
import {
  WASTE_TYPES,
  formatQuantity,
  unitLabel,
  wasteTypeLabel,
} from "../../utils/format.js";
import {
  buildWastePayload,
  emptyWasteForm,
  validateWasteForm,
  wasteFormFromLog,
} from "../../utils/waste.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { RedistributionBadge } from "../../components/ui/Badge.jsx";
import {
  CheckboxField,
  FormError,
  FormGrid,
  SelectInput,
  TextareaInput,
  TextInput,
} from "../../components/ui/Form.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { FoodSelect } from "../../components/kitchen/FoodSelectors.jsx";
import { useKitchen } from "../../components/kitchen/KitchenLayout.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

function initialFormFromState(state) {
  if (!state) return emptyWasteForm();
  if (state.mode === "scanner") {
    return emptyWasteForm({
      prediction_id: state.prediction_id ?? "",
      food_item_id: state.food_item_id ? String(state.food_item_id) : "",
      confirmed_servings:
        state.confirmed_servings === null || state.confirmed_servings === undefined
          ? ""
          : String(state.confirmed_servings),
      notes: state.notes ?? "",
    });
  }
  if (state.mode === "meal-record") {
    return emptyWasteForm({
      meal_record_item_id: state.meal_record_item_id ? String(state.meal_record_item_id) : "",
      food_item_id: state.food_item_id ? String(state.food_item_id) : "",
      confirmed_servings:
        state.confirmed_servings === null || state.confirmed_servings === undefined
          ? ""
          : String(state.confirmed_servings),
      waste_type: state.waste_type ?? "UNSERVED_SURPLUS",
      prepared_at: state.prepared_at ?? "",
    });
  }
  return emptyWasteForm(state);
}

export default function WasteLogFormPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useToast();
  const editing = Boolean(id);
  const { kitchen } = useKitchen();
  const resultRef = useRef(null);

  const [foods, setFoods] = useState(null);
  const [foodsError, setFoodsError] = useState("");
  const [form, setForm] = useState(() =>
    editing ? emptyWasteForm() : initialFormFromState(location.state),
  );
  const [existingLog, setExistingLog] = useState(null);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const prefill = location.state;
  const simulated = existingLog?.is_simulated ?? kitchen?.is_simulated;

  useEffect(() => {
    let active = true;
    listFoodItems({ limit: 100 })
      .then((data) => {
        if (active) setFoods(data.items ?? []);
      })
      .catch((error) => {
        if (active) setFoodsError(getErrorMessage(error, "We couldn’t load the food catalogue."));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!editing) return undefined;
    let active = true;
    setLoading(true);
    setLoadError("");
    setNotFound(false);

    getWasteLog(id)
      .then((log) => {
        if (!active) return;
        setExistingLog(log);
        setForm(wasteFormFromLog(log));
      })
      .catch((error) => {
        if (!active) return;
        if (isNotFound(error)) setNotFound(true);
        else setLoadError(getErrorMessage(error, "We couldn’t load this leftover log."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [editing, id]);

  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const selectedFood = useMemo(
    () => (foods ?? []).find((food) => String(food.id) === String(form.food_item_id)) ?? null,
    [foods, form.food_item_id],
  );

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validateWasteForm(form, selectedFood, simulated);
    setErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const payload = buildWastePayload(form, { includeCleared: editing, simulated });
      const saved = editing ? await updateWasteLog(id, payload) : await createWasteLog(payload);
      notify(editing ? "Leftover log updated." : "Leftover log recorded.");
      if (saved.is_simulated && saved.available_servings > 0) {
        navigate(`/kitchen/matching?waste_log_id=${saved.id}`);
      } else if (editing) {
        navigate(`/kitchen/waste-logs/${saved.id}`);
      } else {
        setResult(saved);
      }
    } catch (error) {
      setSubmitError(getErrorMessage(error, editing ? "We couldn’t update the leftover log." : "We couldn’t save the leftover log."));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader
          eyebrow="OPERATIONS"
          title="Edit leftover log"
          backTo="/kitchen/waste-logs"
          backLabel="Leftover logs"
        />
        <LoadingSkeleton rows={6} />
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <PageHeader
          eyebrow="OPERATIONS"
          title="Leftover log not found"
          backTo="/kitchen/waste-logs"
          backLabel="Leftover logs"
        />
        <EmptyState
          icon={Trash2}
          title="Leftover log not found"
          description="This log does not exist for your kitchen, or it may have been removed."
          action={<Button to="/kitchen/waste-logs">Back to leftover logs</Button>}
        />
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <PageHeader
          eyebrow="OPERATIONS"
          title="Edit leftover log"
          backTo="/kitchen/waste-logs"
          backLabel="Leftover logs"
        />
        <ErrorState message={loadError} />
      </>
    );
  }

  if (result) {
    return (
      <>
        <PageHeader
          eyebrow="OPERATIONS"
          title="Leftover log recorded"
          backTo="/kitchen/waste-logs"
          backLabel="Leftover logs"
        />
        <div ref={resultRef} className="k-result-wrap">
          <div className="k-result-hero">
            <div className="k-result-hero-main">
              <p className="k-eyebrow">LEFTOVER LOG #{result.id}</p>
              <h2>{result.food_name}</h2>
              <p>
                {wasteTypeLabel(result.waste_type)} ·{" "}
                {formatQuantity(result.confirmed_servings, result.serving_unit)}
              </p>
            </div>
            <dl className="k-result-hero-stats">
              {result.is_simulated ? <span className="k-demo-label">Demonstration data only. Not approved for actual consumption.</span> : null}
              <div>
                <dt>Redistribution</dt>
                <dd><RedistributionBadge status={result.safety_status} wasteType={result.waste_type} /></dd>
              </div>
              <div>
                <dt>Available for redistribution</dt>
                <dd>{formatQuantity(result.available_servings, result.serving_unit)}</dd>
              </div>
              <div>
                <dt>Scanner reference</dt>
                <dd>{result.image_id ? "Linked" : "None"}</dd>
              </div>
            </dl>
          </div>

          {result.is_simulated && result.waste_type === "UNSERVED_SURPLUS" && result.safety_status === "INELIGIBLE" ? (
            <ul className="k-muted-text">{result.safety_notes.map((note) => <li key={note}>{note}</li>)}</ul>
          ) : null}

          <div className="k-result-actions">
            <Button to={`/kitchen/waste-logs/${result.id}`} icon={ArrowRight}>
              Open leftover log
            </Button>
            <Button
              variant="secondary"
              icon={RotateCcw}
              onClick={() => {
                setResult(null);
                setForm(emptyWasteForm());
                setErrors({});
                setSubmitError("");
              }}
            >
              Log another
            </Button>
            <Button variant="ghost" to="/kitchen/waste-logs">Back to list</Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="OPERATIONS"
        title={editing ? `Edit leftover log #${id}` : "Log leftovers"}
        description="Record unserved surplus, plate waste or spoiled food."
        backTo={editing ? `/kitchen/waste-logs/${id}` : "/kitchen/waste-logs"}
        backLabel={editing ? "Leftover log detail" : "Leftover logs"}
        actions={
          !editing ? (
            <Button variant="secondary" to="/kitchen/scanner" icon={ScanLine}>
              Scan instead
            </Button>
          ) : null
        }
      />

      {!editing && prefill?.mode === "scanner" ? (
        <div className="k-callout k-callout-info">
          <ScanLine size={17} aria-hidden="true" />
          <div>
            <strong>Prefilled from the scanner</strong>
            <p>
              The image prediction and quantity are carried over. Confirm the food and quantity before saving.
            </p>
          </div>
        </div>
      ) : null}

      {!editing && prefill?.mode === "meal-record" ? (
        <div className="k-callout k-callout-info">
          <ClipboardList size={17} aria-hidden="true" />
          <div>
            <strong>Prefilled from a meal record</strong>
            <p>
              The backend has already limited this quantity to the remaining loggable amount.
              Changing the quantity may be rejected if it exceeds what remains.
            </p>
            {prefill.meal_record_item_id ? (
              <Link className="k-text-link" to={`/kitchen/meal-records/${prefill.meal_record_id ?? ""}`}>
                Return to meal record
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <form className="k-form" onSubmit={handleSubmit} noValidate>
        <Card>
          <CardHeader
            icon={Trash2}
            title="What was wasted"
            subtitle="The quantity must match the food’s serving unit."
          />
          <div className="k-card-body">
            <FormGrid columns={2}>
              <FoodSelect
                foods={foods}
                value={form.food_item_id}
                onChange={(value) => setField("food_item_id", value)}
                label="Food item"
                required
                error={errors.food_item_id}
              />
              <TextInput
                label={`Quantity${selectedFood ? ` (${unitLabel(selectedFood.serving_unit)})` : ""}`}
                type="number"
                min="0"
                step={selectedFood?.serving_unit === "piece" ? "1" : "0.01"}
                value={form.confirmed_servings}
                onChange={(event) => setField("confirmed_servings", event.target.value)}
                error={errors.confirmed_servings}
                required
                hint={
                  selectedFood?.serving_unit === "piece"
                    ? "Whole pieces only."
                    : "Enter the measured or counted quantity."
                }
              />
              <SelectInput
                label="Waste type"
                value={form.waste_type}
                onChange={(event) => setField("waste_type", event.target.value)}
                options={WASTE_TYPES.map((value) => ({ value, label: wasteTypeLabel(value) }))}
                required
              />
              {form.prediction_id ? (
                <TextInput
                  label="Scanner prediction reference"
                  value={form.prediction_id}
                  readOnly
                  className="k-readonly-field"
                  hint="Linked to the saved scanner prediction."
                  error={errors.prediction_id}
                />
              ) : null}
              {form.meal_record_item_id ? (
                <TextInput
                  label="Meal record item reference"
                  value={form.meal_record_item_id}
                  readOnly
                  className="k-readonly-field"
                  hint="This log is linked to a recorded meal item."
                />
              ) : null}
            </FormGrid>
            {foodsError ? <FormError message={foodsError} /> : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={ClipboardList}
            title="Notes"
            subtitle="Optional context for your kitchen."
          />
          <div className="k-card-body">
            <TextareaInput
              label="Notes"
              rows={3}
              maxLength={1000}
              value={form.notes}
              onChange={(event) => setField("notes", event.target.value)}
              error={errors.notes}
              hint="Up to 1000 characters."
            />
          </div>
        </Card>

        {simulated && form.waste_type === "UNSERVED_SURPLUS" ? (
          <Card>
            <CardHeader title="Staff declaration" subtitle="Demonstration data only. Not approved for actual consumption." />
            <div className="k-card-body k-form">
              <CheckboxField
                label="I confirm this food was unserved, handled appropriately and has no known contamination."
                checked={form.declared}
                onChange={(event) => setField("declared", event.target.checked)}
              />
              <TextInput
                label="Discard deadline"
                type="datetime-local"
                value={form.discard_at}
                onChange={(event) => setField("discard_at", event.target.value)}
                error={errors.discard_at}
                required={form.declared}
              />
            </div>
          </Card>
        ) : null}

        <FormError message={submitError} />

        <div className="k-form-actions">
          <Button type="submit" icon={Save} loading={submitting} disabled={!foods}>
            {editing ? "Save changes" : "Record leftover log"}
          </Button>
          <Button
            variant="secondary"
            icon={ArrowLeft}
            to={editing ? `/kitchen/waste-logs/${id}` : "/kitchen/waste-logs"}
          >
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}
