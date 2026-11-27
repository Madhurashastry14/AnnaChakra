import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Info,
  RotateCcw,
  TrendingUp,
  Users,
  Utensils,
} from "lucide-react";
import { listFoodItems } from "../../services/foodItems.js";
import { createForecast } from "../../services/forecasts.js";
import { getErrorMessage } from "../../utils/errors.js";
import { mealTypeLabel, menuModeLabel, todayISO } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import {
  FormError,
  FormGrid,
  SelectInput,
  TextInput,
} from "../../components/ui/Form.jsx";
import { FoodMultiSelect } from "../../components/kitchen/FoodSelectors.jsx";
import ForecastResult from "../../components/kitchen/ForecastResult.jsx";
import { EmptyState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

function readPrefill() {
  try {
    const raw = sessionStorage.getItem("annachakra:forecast-prefill");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function validateForecastForm(form) {
  const errors = {};
  const people = Number(form.expected_people);
  if (!form.meal_date) errors.meal_date = "Choose a meal date.";
  else if (form.meal_date < todayISO()) errors.meal_date = "Choose today or a future date.";
  if (!Number.isInteger(people) || people <= 0) {
    errors.expected_people = "Enter a whole number greater than zero.";
  }
  if (form.food_item_ids.length === 0) errors.food_item_ids = "Select at least one dish.";
  return errors;
}

export default function ForecastPage() {
  const location = useLocation();
  const { notify } = useToast();
  const initialPrefill = location.state?.prefill ?? readPrefill();
  const [foods, setFoods] = useState(null);
  const [foodsError, setFoodsError] = useState("");
  const [form, setForm] = useState(() => ({
    meal_date: initialPrefill?.meal_date ?? todayISO(),
    meal_type: initialPrefill?.meal_type ?? "LUNCH",
    expected_people: initialPrefill?.expected_people ?? 100,
    menu_mode: initialPrefill?.menu_mode ?? "CHOICE_BASED",
    food_item_ids: initialPrefill?.food_item_ids ?? [],
  }));
  const [prefilled, setPrefilled] = useState(Boolean(initialPrefill));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const resultRef = useRef(null);

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
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function clearPrefill() {
    sessionStorage.removeItem("annachakra:forecast-prefill");
    setPrefilled(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validateForecastForm(form);
    setErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const forecast = await createForecast({
        meal_date: form.meal_date,
        meal_type: form.meal_type,
        expected_people: Number(form.expected_people),
        menu_mode: form.menu_mode,
        food_item_ids: form.food_item_ids,
      });
      setResult(forecast);
      clearPrefill();
      notify("Forecast saved.");
    } catch (error) {
      setSubmitError(getErrorMessage(error, "We couldn’t create the forecast."));
    } finally {
      setSubmitting(false);
    }
  }

  function startAnother() {
    setResult(null);
    setSubmitError("");
    setForm({
      meal_date: todayISO(),
      meal_type: "LUNCH",
      expected_people: 100,
      menu_mode: "CHOICE_BASED",
      food_item_ids: [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <PageHeader
        eyebrow="DEMAND FORECAST"
        title="Forecast what this meal service needs"
        description="Choose the meal and dishes, then let the backend estimate quantities. Forecasts are saved only when you confirm."
        actions={
          <Button variant="secondary" to="/kitchen/forecasts" icon={CalendarDays}>
            Forecast history
          </Button>
        }
      />

      {prefilled ? (
        <div className="k-callout k-callout-info">
          <Info size={17} aria-hidden="true" />
          <div>
            <strong>Prefilled from the menu planner</strong>
            <p>Review the dishes and quantities before saving. Nothing has been saved yet.</p>
            <button type="button" className="k-text-button" onClick={clearPrefill}>
              Clear prefilled values
            </button>
          </div>
        </div>
      ) : null}

      <div className="k-forecast-layout">
        <Card>
          <CardHeader
            icon={TrendingUp}
            title="Forecast details"
            subtitle="The food catalogue provides the serving unit and dietary information for each dish."
          />
          <form className="k-card-body k-form" onSubmit={handleSubmit} noValidate>
            <FormGrid columns={2}>
              <TextInput
                label="Meal date"
                type="date"
                min={todayISO()}
                value={form.meal_date}
                onChange={(event) => setField("meal_date", event.target.value)}
                error={errors.meal_date}
                required
              />
              <SelectInput
                label="Meal type"
                value={form.meal_type}
                onChange={(event) => setField("meal_type", event.target.value)}
                options={["BREAKFAST", "LUNCH", "DINNER"].map((value) => ({
                  value,
                  label: mealTypeLabel(value),
                }))}
                required
              />
              <TextInput
                label="Expected attendance"
                type="number"
                min="1"
                step="1"
                value={form.expected_people}
                onChange={(event) => setField("expected_people", event.target.value)}
                error={errors.expected_people}
                required
              />
              <SelectInput
                label="Menu mode"
                value={form.menu_mode}
                onChange={(event) => setField("menu_mode", event.target.value)}
                options={[
                  { value: "CHOICE_BASED", label: menuModeLabel("CHOICE_BASED") },
                  { value: "FIXED_MEAL", label: menuModeLabel("FIXED_MEAL") },
                ]}
                hint={
                  form.menu_mode === "FIXED_MEAL"
                    ? "Everyone receives the same main dishes."
                    : "Diners choose between alternative main dishes."
                }
              />
            </FormGrid>

            <FoodMultiSelect
              foods={foods}
              selectedIds={form.food_item_ids}
              onChange={(ids) => setField("food_item_ids", ids)}
              label="Dishes to forecast"
              hint="Search by name, category or food role. Main dishes, accompaniments, side dishes, desserts and beverages are all supported."
              error={errors.food_item_ids}
              required
            />

            {foodsError ? <FormError message={foodsError} /> : null}
            <FormError message={submitError} />

            <div className="k-form-actions">
              <Button type="submit" loading={submitting} icon={TrendingUp} disabled={!foods}>
                Generate and save forecast
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setForm({
                    meal_date: todayISO(),
                    meal_type: "LUNCH",
                    expected_people: 100,
                    menu_mode: "CHOICE_BASED",
                    food_item_ids: [],
                  });
                  setErrors({});
                  setSubmitError("");
                }}
                disabled={submitting}
              >
                Reset form
              </Button>
            </div>
          </form>
        </Card>

        <aside className="k-forecast-aside">
          <section className="k-planner-info">
            <span className="k-info-icon" aria-hidden="true"><Users size={19} /></span>
            <h2>What the forecast returns</h2>
            <p>
              For each dish: estimated diners, predicted quantity, recommended preparation,
              serving unit, allocation share, prediction method, historical observations and
              ingredient requirements.
            </p>
          </section>
          <section className="k-planner-info">
            <span className="k-info-icon" aria-hidden="true"><Info size={19} /></span>
            <h2>How to read the methods</h2>
            <ul>
              <li><strong>Catalogue-based estimate:</strong> uses catalogue defaults and uptake assumptions.</li>
              <li><strong>Kitchen history-based estimate:</strong> uses this kitchen’s recorded meals.</li>
              <li><strong>Machine learning estimate:</strong> uses the platform model; treat it as guidance, not a guarantee.</li>
            </ul>
          </section>
          <section className="k-planner-info">
            <span className="k-info-icon" aria-hidden="true"><Utensils size={19} /></span>
            <h2>Ingredient requirements</h2>
            <p>
              After saving, ingredient quantities are shown per dish and as a consolidated list.
              Units are combined only within the same measurement type.
            </p>
          </section>
        </aside>
      </div>

      {submitting && !result ? <LoadingSkeleton rows={5} /> : null}

      {result ? (
        <div ref={resultRef} className="k-forecast-result-wrap">
          <div className="k-section-heading-row k-no-print">
            <div>
              <p className="k-eyebrow">RESULT</p>
              <h2>Forecast #{result.id}</h2>
            </div>
            <div className="k-page-actions">
              <Button variant="secondary" onClick={startAnother} icon={RotateCcw}>
                Start another forecast
              </Button>
              <Button variant="secondary" to="/kitchen/forecasts" icon={ArrowRight}>
                View history
              </Button>
            </div>
          </div>
          <ForecastResult forecast={result} />
        </div>
      ) : null}

      {!result && !submitting ? (
        <EmptyState
          icon={TrendingUp}
          title="No forecast generated yet"
          description="Choose a meal date, attendance and dishes, then save the forecast to see quantities and ingredients."
        />
      ) : null}

      <div className="k-page-footer-note k-no-print">
        <ArrowLeft size={14} aria-hidden="true" />
        <span>
          Need a menu suggestion first? <Link to="/kitchen/menu-planner">Open the Smart Menu Planner</Link>.
        </span>
      </div>
    </>
  );
}
