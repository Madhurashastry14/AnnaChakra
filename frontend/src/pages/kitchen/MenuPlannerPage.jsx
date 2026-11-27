import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  ListChecks,
  RotateCcw,
  Sparkles,
  Utensils,
  Users,
} from "lucide-react";
import { listFoodItems } from "../../services/foodItems.js";
import { recommendMenu } from "../../services/menu.js";
import { getErrorMessage } from "../../utils/errors.js";
import {
  FOOD_ROLES,
  formatDate,
  formatNumber,
  groupBy,
  labelFor,
  mealTypeLabel,
  menuModeLabel,
  percent,
  todayISO,
  unitLabel,
} from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { Badge, MethodBadge, RoleBadge } from "../../components/ui/Badge.jsx";
import {
  CheckboxField,
  FormError,
  FormGrid,
  SelectInput,
  TextInput,
} from "../../components/ui/Form.jsx";
import { FoodMultiSelect } from "../../components/kitchen/FoodSelectors.jsx";
import { EmptyState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

const ROLE_ORDER = [...FOOD_ROLES, "OTHER"];

function validateMenuForm(form) {
  const errors = {};
  const people = Number(form.expected_people);
  if (!form.meal_date) errors.meal_date = "Choose a meal date.";
  else if (form.meal_date < todayISO()) errors.meal_date = "Choose today or a future date.";
  if (!Number.isInteger(people) || people <= 0) {
    errors.expected_people = "Enter a whole number greater than zero.";
  }
  if (form.required_food_item_ids.length > Number(form.max_dishes)) {
    errors.max_dishes = "Required dishes cannot exceed the total dish limit.";
  }
  if (form.required_food_item_ids.some((id) => form.excluded_food_item_ids.includes(id))) {
    errors.required_food_item_ids = "A dish cannot be both required and excluded.";
  }
  return errors;
}

function MenuModeField({ value, onChange }) {
  return (
    <fieldset className="k-field k-field-span-2">
      <legend className="k-label">Menu mode</legend>
      <div className="k-radio-cards">
        <label className={`k-radio-card${value === "CHOICE_BASED" ? " is-selected" : ""}`}>
          <input
            type="radio"
            name="menu_mode"
            value="CHOICE_BASED"
            checked={value === "CHOICE_BASED"}
            onChange={() => onChange("CHOICE_BASED")}
          />
          <span className="k-radio-card-body">
            <strong>Choice-based</strong>
            <p>
              Diners choose between alternative main dishes. Preparation is allocated across
              the menu — for example, 200 people may split between rice, chapati and biryani.
            </p>
          </span>
        </label>
        <label className={`k-radio-card${value === "FIXED_MEAL" ? " is-selected" : ""}`}>
          <input
            type="radio"
            name="menu_mode"
            value="FIXED_MEAL"
            checked={value === "FIXED_MEAL"}
            onChange={() => onChange("FIXED_MEAL")}
          />
          <span className="k-radio-card-body">
            <strong>Fixed meal</strong>
            <p>
              Everyone receives the same main dishes as one common meal, so each selected main
              dish is prepared for the full expected attendance.
            </p>
          </span>
        </label>
      </div>
    </fieldset>
  );
}

function RecommendationCard({ item, selected, onToggle }) {
  const waste = item.waste_metrics;
  return (
    <article className={`k-recommendation-card${selected ? " is-selected" : ""}`}>
      <div className="k-recommendation-head">
        <label className="k-recommendation-check">
          <input type="checkbox" checked={selected} onChange={() => onToggle(item.food_item_id)} />
          <span>
            <strong>{item.food_item_name}</strong>
            <small>{unitLabel(item.serving_unit)}</small>
          </span>
        </label>
        <div className="k-recommendation-score">
          <span>Score</span>
          <strong>{formatNumber(item.recommendation_score, 1)}</strong>
          <small>/ 100 · rule-based</small>
        </div>
      </div>

      <div className="k-badge-row">
        <RoleBadge role={item.food_role} />
        <MethodBadge method={item.recommendation_method === "CATALOGUE_BASED" ? "BASELINE" : item.recommendation_method} />
        <Badge tone={item.data_availability === "NO_HISTORY" ? "neutral" : "success"}>
          {labelFor(item.data_availability)}
        </Badge>
        <Badge tone="outline">{item.records_analyzed} records</Badge>
      </div>

      {item.reasons?.length > 0 ? (
        <ul className="k-reason-list">
          {item.reasons.map((reason, index) => (
            <li key={`${reason}-${index}`}><CheckCircle2 size={14} /> {reason}</li>
          ))}
        </ul>
      ) : null}

      {waste ? (
        <dl className="k-mini-stats">
          <div>
            <dt>Food acceptance</dt>
            <dd>{percent(waste.food_acceptance_rate)}</dd>
          </div>
          <div>
            <dt>Overproduction</dt>
            <dd>{percent(waste.overproduction_rate)}</dd>
          </div>
          <div>
            <dt>Plate waste</dt>
            <dd>{percent(waste.plate_waste_rate)}</dd>
          </div>
          <div>
            <dt>Records</dt>
            <dd>{waste.records_analyzed}</dd>
          </div>
        </dl>
      ) : (
        <p className="k-note">
          <Info size={14} aria-hidden="true" />
          No kitchen-specific waste metrics were available for this dish.
        </p>
      )}
    </article>
  );
}

export default function MenuPlannerPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [foods, setFoods] = useState(null);
  const [foodsError, setFoodsError] = useState("");
  const [form, setForm] = useState({
    meal_date: todayISO(),
    meal_type: "LUNCH",
    expected_people: 100,
    menu_mode: "CHOICE_BASED",
    vegetarian_only: false,
    max_main_dishes: 2,
    max_accompaniments: 2,
    max_dishes: 6,
    required_food_item_ids: [],
    excluded_food_item_ids: [],
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

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

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function setRequired(ids) {
    setForm((current) => ({
      ...current,
      required_food_item_ids: ids,
      excluded_food_item_ids: current.excluded_food_item_ids.filter((id) => !ids.includes(id)),
    }));
    setErrors((current) => ({ ...current, required_food_item_ids: undefined, max_dishes: undefined }));
  }

  function setExcluded(ids) {
    setForm((current) => ({
      ...current,
      excluded_food_item_ids: ids,
      required_food_item_ids: current.required_food_item_ids.filter((id) => !ids.includes(id)),
    }));
    setErrors((current) => ({ ...current, required_food_item_ids: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validateMenuForm(form);
    setErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const response = await recommendMenu({
        meal_date: form.meal_date,
        meal_type: form.meal_type,
        expected_people: Number(form.expected_people),
        menu_mode: form.menu_mode,
        vegetarian_only: form.vegetarian_only,
        max_main_dishes: Number(form.max_main_dishes),
        max_accompaniments: Number(form.max_accompaniments),
        max_dishes: Number(form.max_dishes),
        required_food_item_ids: form.required_food_item_ids,
        excluded_food_item_ids: form.excluded_food_item_ids,
      });
      setResult(response);
      setSelectedIds(response.recommended_food_item_ids ?? []);
      notify("Menu recommendation generated.");
    } catch (error) {
      setSubmitError(getErrorMessage(error, "We couldn’t generate a menu recommendation."));
    } finally {
      setSubmitting(false);
    }
  }

  function toggleRecommended(foodItemId) {
    setSelectedIds((current) =>
      current.includes(foodItemId)
        ? current.filter((id) => id !== foodItemId)
        : [...current, foodItemId],
    );
  }

  function continueToForecast() {
    if (selectedIds.length === 0) {
      setSubmitError("Keep at least one dish before continuing to forecasting.");
      return;
    }
    const prefill = {
      ...(result?.forecast_request ?? {}),
      meal_date: form.meal_date,
      meal_type: form.meal_type,
      expected_people: Number(form.expected_people),
      menu_mode: form.menu_mode,
      food_item_ids: selectedIds,
    };
    sessionStorage.setItem("annachakra:forecast-prefill", JSON.stringify(prefill));
    navigate("/kitchen/forecast", { state: { prefill } });
  }

  const grouped = useMemo(() => {
    if (!result) return [];
    const groups = groupBy(result.recommended_items ?? [], (item) => item.food_role ?? "OTHER");
    return [...groups.entries()].sort(
      ([left], [right]) => ROLE_ORDER.indexOf(left) - ROLE_ORDER.indexOf(right),
    );
  }, [result]);

  const catalogueBased = result?.recommendation_method === "CATALOGUE_BASED";

  return (
    <>
      <PageHeader
        eyebrow="SMART MENU PLANNER"
        title="Plan a menu with the catalogue and your history"
        description="Describe the meal service, and the backend will recommend dishes. Scores are rule-based ranking values, not probabilities."
      />

      <div className="k-planner-layout">
        <Card>
          <CardHeader
            icon={Sparkles}
            title="Meal service"
            subtitle="The planner uses the same food catalogue as forecasting and meal records."
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
                label="Expected number of people"
                type="number"
                min="1"
                step="1"
                value={form.expected_people}
                onChange={(event) => setField("expected_people", event.target.value)}
                error={errors.expected_people}
                hint="Used to size the recommendation."
                required
              />
              <div className="k-field">
                <span className="k-label">Vegetarian preference</span>
                <CheckboxField
                  label="Vegetarian dishes only"
                  description="Restrict recommendations to vegetarian catalogue items."
                  checked={form.vegetarian_only}
                  onChange={(event) => setField("vegetarian_only", event.target.checked)}
                />
              </div>
            </FormGrid>

            <MenuModeField value={form.menu_mode} onChange={(value) => setField("menu_mode", value)} />

            <details className="k-advanced-panel">
              <summary>Dish limits and required or excluded dishes</summary>
              <FormGrid columns={3}>
                <SelectInput
                  label="Maximum main dishes"
                  value={form.max_main_dishes}
                  onChange={(event) => setField("max_main_dishes", Number(event.target.value))}
                  options={[1, 2, 3, 4].map((value) => ({ value, label: String(value) }))}
                />
                <SelectInput
                  label="Maximum accompaniments"
                  value={form.max_accompaniments}
                  onChange={(event) => setField("max_accompaniments", Number(event.target.value))}
                  options={[0, 1, 2, 3, 4].map((value) => ({ value, label: String(value) }))}
                />
                <SelectInput
                  label="Maximum total dishes"
                  value={form.max_dishes}
                  onChange={(event) => setField("max_dishes", Number(event.target.value))}
                  options={Array.from({ length: 10 }, (_, index) => index + 1).map((value) => ({
                    value,
                    label: String(value),
                  }))}
                  error={errors.max_dishes}
                />
              </FormGrid>

              <FoodMultiSelect
                foods={foods}
                selectedIds={form.required_food_item_ids}
                onChange={setRequired}
                label="Required food items"
                hint="These dishes must appear in the recommendation. Required dishes count toward the total dish limit."
                error={errors.required_food_item_ids}
                maxHeight={220}
              />
              <FoodMultiSelect
                foods={foods}
                selectedIds={form.excluded_food_item_ids}
                onChange={setExcluded}
                label="Excluded food items"
                hint="These dishes will not be recommended."
                maxHeight={220}
              />
            </details>

            {foodsError ? <FormError message={foodsError} /> : null}
            <FormError message={submitError} />

            <div className="k-form-actions">
              <Button type="submit" loading={submitting} icon={Sparkles} disabled={!foods}>
                Recommend a menu
              </Button>
              {result ? (
                <Button
                  variant="secondary"
                  icon={RotateCcw}
                  onClick={() => {
                    setResult(null);
                    setSelectedIds([]);
                    setSubmitError("");
                  }}
                  disabled={submitting}
                >
                  Start over
                </Button>
              ) : null}
            </div>
          </form>
        </Card>

        <aside className="k-planner-aside">
          <section className="k-planner-info">
            <span className="k-info-icon" aria-hidden="true"><Users size={19} /></span>
            <h2>How recommendations work</h2>
            <ul>
              <li><strong>Choice-based:</strong> people choose between main dishes; quantities are allocated across the menu.</li>
              <li><strong>Fixed meal:</strong> everyone receives the same mains; each main is prepared for full attendance.</li>
              <li><strong>Catalogue-based:</strong> selected from food role, meal type and preference rules. It is not evidence from your kitchen’s history.</li>
              <li><strong>History-based:</strong> the backend may use your recorded waste metrics when enough history exists.</li>
            </ul>
          </section>
          <section className="k-planner-info">
            <span className="k-info-icon" aria-hidden="true"><ListChecks size={19} /></span>
            <h2>Before you forecast</h2>
            <p>
              Review the recommendation, remove dishes that do not fit the service, and add
              catalogue dishes if needed. Nothing is saved until you confirm the forecast on the
              next page.
            </p>
          </section>
        </aside>
      </div>

      {submitting && !result ? <LoadingSkeleton rows={4} /> : null}

      {result ? (
        <section className="k-recommendation-result">
          <Card className="k-result-summary">
            <div className="k-card-body">
              <div className="k-result-summary-main">
                <div>
                  <p className="k-eyebrow">RECOMMENDATION READY</p>
                  <h2>{mealTypeLabel(result.meal_type)} · {formatDate(result.meal_date)}</h2>
                  <p>
                    {formatNumber(result.expected_people)} expected people ·{" "}
                    {menuModeLabel(result.menu_mode)} · {result.recommended_items?.length ?? 0} dishes
                  </p>
                </div>
                <div className="k-badge-row">
                  <Badge tone="info" icon={Sparkles}>{labelFor(result.recommendation_method)}</Badge>
                  {catalogueBased ? <Badge tone="neutral">No history required</Badge> : null}
                </div>
              </div>

              {catalogueBased ? (
                <div className="k-callout k-callout-info">
                  <Info size={17} aria-hidden="true" />
                  <p>
                    This recommendation is <strong>catalogue-based</strong>. It uses dish roles,
                    meal suitability and catalogue preferences — not historical evidence from
                    your kitchen. The score ranks dishes within this recommendation; it is not a
                    probability.
                  </p>
                </div>
              ) : null}

              {result.warnings?.length > 0 ? (
                <div className="k-callout k-callout-warning">
                  <AlertTriangle size={17} aria-hidden="true" />
                  <div>
                    <strong>Warnings</strong>
                    <ul>
                      {result.warnings.map((warning, index) => (
                        <li key={`${warning}-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          {grouped.length > 0 ? (
            grouped.map(([role, items]) => (
              <div className="k-recommendation-group" key={role}>
                <div className="k-recommendation-group-head">
                  <h2>{labelFor(role, "Other dishes")}</h2>
                  <Badge tone="outline">{items.length}</Badge>
                </div>
                <div className="k-recommendation-grid">
                  {items.map((item) => (
                    <RecommendationCard
                      key={item.food_item_id}
                      item={item}
                      selected={selectedIds.includes(item.food_item_id)}
                      onToggle={toggleRecommended}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={Utensils}
              title="No dishes were recommended"
              description="Try widening the dish limits or removing exclusions."
            />
          )}

          <Card>
            <CardHeader
              icon={ListChecks}
              title="Review your menu"
              subtitle="Remove a recommended dish or add another catalogue dish before forecasting."
            />
            <div className="k-card-body k-form">
              <FoodMultiSelect
                foods={foods}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
                label={`Selected menu (${selectedIds.length})`}
                hint="Only these dishes will be passed to the demand forecast."
                maxHeight={280}
              />
              <FormError message={submitError} />
              <div className="k-form-actions">
                <Button onClick={continueToForecast} iconRight={ArrowRight} disabled={selectedIds.length === 0}>
                  Continue to demand forecast
                </Button>
                <Button variant="secondary" to="/kitchen/forecast">Go to forecasting</Button>
              </div>
            </div>
          </Card>
        </section>
      ) : null}
    </>
  );
}
