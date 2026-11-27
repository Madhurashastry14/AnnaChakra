import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  Info,
  Save,
  Trash2,
  Utensils,
} from "lucide-react";
import { listFoodItems } from "../../services/foodItems.js";
import { getForecast } from "../../services/forecasts.js";
import { createMealRecord, listMealRecords } from "../../services/mealRecords.js";
import { getErrorMessage, isNotFound } from "../../utils/errors.js";
import {
  formatDate,
  formatNumber,
  formatQuantity,
  isWholeNumber,
  mealTypeLabel,
  menuModeLabel,
  todayISO,
  unitLabel,
} from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { Badge, RoleBadge } from "../../components/ui/Badge.jsx";
import {
  CheckboxField,
  Field,
  FormError,
  FormGrid,
  SelectInput,
  TextInput,
} from "../../components/ui/Form.jsx";
import { FoodMultiSelect } from "../../components/kitchen/FoodSelectors.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

function itemFromFood(food) {
  return {
    food_item_id: food.id,
    name: food.name,
    serving_unit: food.serving_unit,
    food_role: food.food_role ?? null,
    prepared_servings: "",
    leftover_servings: "",
    plate_waste_servings: "",
    plate_waste_unknown: true,
    shortage_occurred: false,
  };
}

function itemFromForecast(item) {
  return {
    food_item_id: item.food_item_id,
    name: item.name,
    serving_unit: item.serving_unit,
    food_role: item.food_role ?? null,
    prepared_servings: "",
    leftover_servings: "",
    plate_waste_servings: "",
    plate_waste_unknown: true,
    shortage_occurred: false,
  };
}

function itemPreview(item) {
  const prepared = item.prepared_servings === "" ? null : Number(item.prepared_servings);
  const leftover = item.leftover_servings === "" ? null : Number(item.leftover_servings);
  const served =
    prepared !== null && leftover !== null && Number.isFinite(prepared) && Number.isFinite(leftover)
      ? prepared - leftover
      : null;
  const plate =
    item.plate_waste_unknown || item.plate_waste_servings === ""
      ? null
      : Number(item.plate_waste_servings);
  const consumed =
    served !== null && plate !== null && Number.isFinite(plate) ? served - plate : null;
  return { served, consumed };
}

export default function MealRecordFormPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notify } = useToast();
  const forecastParam = new URLSearchParams(location.search).get("forecast_id");
  const forecastId = forecastParam && /^\d+$/.test(forecastParam) ? Number(forecastParam) : null;

  const [foods, setFoods] = useState(null);
  const [foodsError, setFoodsError] = useState("");
  const [forecast, setForecast] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(Boolean(forecastId));
  const [forecastError, setForecastError] = useState("");
  const [existingRecord, setExistingRecord] = useState(null);
  const [form, setForm] = useState({
    meal_date: todayISO(),
    meal_type: "LUNCH",
    menu_mode: "",
    actual_people: "",
    items: [],
  });
  const [errors, setErrors] = useState({});
  const [itemErrors, setItemErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    let active = true;

    if (!forecastId) {
      setForecast(null);
      setForecastError("");
      setForecastLoading(false);
      setExistingRecord(null);
      setForm({
        meal_date: todayISO(),
        meal_type: "LUNCH",
        menu_mode: "",
        actual_people: "",
        items: [],
      });
      setErrors({});
      setItemErrors({});
      return () => {
        active = false;
      };
    }

    setForecastLoading(true);
    setForecastError("");
    Promise.all([getForecast(forecastId), listMealRecords().catch(() => null)])
      .then(([forecastData, records]) => {
        if (!active) return;
        setForecast(forecastData);
        setForm({
          meal_date: forecastData.meal_date,
          meal_type: forecastData.meal_type,
          menu_mode: forecastData.menu_mode ?? "",
          actual_people: "",
          items: (forecastData.items ?? []).map(itemFromForecast),
        });
        if (Array.isArray(records)) {
          setExistingRecord(records.find((record) => record.forecast_id === forecastId) ?? null);
        }
      })
      .catch((error) => {
        if (!active) return;
        setForecastError(
          isNotFound(error)
            ? "This forecast could not be found for your kitchen."
            : getErrorMessage(error, "We couldn’t load the linked forecast."),
        );
      })
      .finally(() => {
        if (active) setForecastLoading(false);
      });

    return () => {
      active = false;
    };
  }, [forecastId]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function setSelectedDishes(ids) {
    setForm((current) => {
      const existing = new Map(current.items.map((item) => [item.food_item_id, item]));
      return {
        ...current,
        items: ids.map((id) => {
          if (existing.has(id)) return existing.get(id);
          const food = (foods ?? []).find((entry) => entry.id === id);
          return food
            ? itemFromFood(food)
            : {
                food_item_id: id,
                name: `Dish #${id}`,
                serving_unit: "serving",
                food_role: null,
                prepared_servings: "",
                leftover_servings: "",
                plate_waste_servings: "",
                plate_waste_unknown: true,
                shortage_occurred: false,
              };
        }),
      };
    });
    setErrors((current) => ({ ...current, items: undefined }));
  }

  function removeItem(foodId) {
    setForm((current) => ({
      ...current,
      items: current.items.filter((item) => item.food_item_id !== foodId),
    }));
    setItemErrors((current) => {
      const next = { ...current };
      delete next[foodId];
      return next;
    });
  }

  function updateItem(foodId, patch) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.food_item_id === foodId ? { ...item, ...patch } : item,
      ),
    }));
    setItemErrors((current) => {
      const next = { ...current };
      delete next[foodId];
      return next;
    });
  }

  function validate() {
    const nextErrors = {};
    const nextItemErrors = {};

    if (!form.meal_date) nextErrors.meal_date = "Choose the meal date.";
    else if (form.meal_date > todayISO()) {
      nextErrors.meal_date = "Meal records require a completed meal date (today or earlier).";
    }

    const people = Number(form.actual_people);
    if (form.actual_people === "" || !Number.isInteger(people) || people < 0) {
      nextErrors.actual_people = "Enter the whole number of people who attended.";
    }

    if (form.items.length === 0) nextErrors.items = "Add at least one dish served.";

    for (const item of form.items) {
      const itemError = {};
      const piece = item.serving_unit === "piece";
      const prepared = item.prepared_servings === "" ? null : Number(item.prepared_servings);
      const leftover = item.leftover_servings === "" ? null : Number(item.leftover_servings);
      const plate =
        item.plate_waste_unknown || item.plate_waste_servings === ""
          ? null
          : Number(item.plate_waste_servings);

      if (prepared === null || !Number.isFinite(prepared) || prepared < 0) {
        itemError.prepared_servings = "Enter a non-negative quantity.";
      } else if (piece && !isWholeNumber(prepared)) {
        itemError.prepared_servings = "Piece-based quantities must be whole numbers.";
      }

      if (leftover === null || !Number.isFinite(leftover) || leftover < 0) {
        itemError.leftover_servings = "Enter a non-negative quantity.";
      } else if (piece && !isWholeNumber(leftover)) {
        itemError.leftover_servings = "Piece-based quantities must be whole numbers.";
      } else if (prepared !== null && Number.isFinite(prepared) && leftover > prepared) {
        itemError.leftover_servings = "Leftovers cannot exceed the prepared quantity.";
      }

      if (!item.plate_waste_unknown) {
        if (plate === null || !Number.isFinite(plate) || plate < 0) {
          itemError.plate_waste_servings = "Enter a non-negative quantity or mark it not measured.";
        } else if (piece && !isWholeNumber(plate)) {
          itemError.plate_waste_servings = "Piece-based quantities must be whole numbers.";
        } else if (
          prepared !== null &&
          leftover !== null &&
          Number.isFinite(prepared) &&
          Number.isFinite(leftover) &&
          plate > prepared - leftover
        ) {
          itemError.plate_waste_servings = "Plate waste cannot exceed the served quantity.";
        }
      }

      if (Object.keys(itemError).length > 0) nextItemErrors[item.food_item_id] = itemError;
    }

    return { nextErrors, nextItemErrors };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const { nextErrors, nextItemErrors } = validate();
    setErrors(nextErrors);
    setItemErrors(nextItemErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length > 0 || Object.keys(nextItemErrors).length > 0) return;

    const payload = {
      meal_date: form.meal_date,
      meal_type: form.meal_type,
      actual_people: Number(form.actual_people),
      items: form.items.map((item) => ({
        food_item_id: item.food_item_id,
        prepared_servings: Number(item.prepared_servings),
        leftover_servings: Number(item.leftover_servings),
        plate_waste_servings: item.plate_waste_unknown
          ? null
          : Number(item.plate_waste_servings),
        shortage_occurred: Boolean(item.shortage_occurred),
      })),
    };
    if (forecastId) payload.forecast_id = forecastId;
    if (form.menu_mode) payload.menu_mode = form.menu_mode;

    setSubmitting(true);
    try {
      const record = await createMealRecord(payload);
      notify("Meal record saved.");
      navigate(`/kitchen/meal-records/${record.id}`, { replace: true });
    } catch (error) {
      setSubmitError(getErrorMessage(error, "We couldn’t save the meal record."));
    } finally {
      setSubmitting(false);
    }
  }

  if (forecastLoading) {
    return (
      <>
        <PageHeader eyebrow="OPERATIONS" title="Record meal feedback" backTo="/kitchen/meal-records" backLabel="Meal records" />
        <LoadingSkeleton variant="page" />
      </>
    );
  }

  if (forecastError) {
    return (
      <>
        <PageHeader eyebrow="OPERATIONS" title="Record meal feedback" backTo="/kitchen/meal-records" backLabel="Meal records" />
        <ErrorState
          title="Linked forecast unavailable"
          message={forecastError}
          action={
            <>
              <Button variant="secondary" onClick={() => navigate("/kitchen/meal-records/new", { replace: true })}>
                Record a manual meal
              </Button>
              <Button variant="ghost" to="/kitchen/meal-records">Back to records</Button>
            </>
          }
        />
      </>
    );
  }

  if (existingRecord) {
    return (
      <>
        <PageHeader eyebrow="OPERATIONS" title="Record meal feedback" backTo="/kitchen/meal-records" backLabel="Meal records" />
        <Card>
          <div className="k-card-body">
            <div className="k-callout k-callout-warning">
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <h3>Feedback is already recorded for this forecast</h3>
                <p>
                  Forecast #{forecastId} already has meal record #{existingRecord.id}. The backend
                  allows one feedback record per linked forecast.
                </p>
                <div className="k-form-actions">
                  <Button to={`/kitchen/meal-records/${existingRecord.id}`}>Open existing record</Button>
                  <Button variant="secondary" onClick={() => navigate("/kitchen/meal-records/new", { replace: true })}>
                    Record a manual meal instead
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </>
    );
  }

  const linked = Boolean(forecastId && forecast);

  return (
    <>
      <PageHeader
        eyebrow="OPERATIONS"
        title={linked ? `Feedback for forecast #${forecastId}` : "Record a meal"}
        description={
          linked
            ? "Record actual attendance and per-dish quantities for this forecast. The dish set is fixed by the forecast."
            : "Record a completed meal that was not linked to a saved forecast."
        }
        backTo="/kitchen/meal-records"
        backLabel="Meal records"
      />

      {linked ? (
        <div className="k-linked-banner">
          <span className="k-linked-icon" aria-hidden="true"><ClipboardCheck size={20} /></span>
          <div>
            <strong>Linked forecast #{forecast.id}</strong>
            <p>
              {mealTypeLabel(forecast.meal_type)} · {formatDate(forecast.meal_date)} ·{" "}
              {menuModeLabel(forecast.menu_mode)} · {formatNumber(forecast.expected_people)} expected
            </p>
          </div>
          <Link className="k-table-link" to={`/kitchen/forecasts/${forecast.id}`}>View forecast</Link>
        </div>
      ) : null}

      <Card>
        <CardHeader
          icon={ClipboardCheck}
          title="Meal service"
          subtitle={
            linked
              ? "Date, meal type and menu mode are fixed by the linked forecast."
              : "Enter the completed meal details."
          }
        />
        <form className="k-card-body k-form" onSubmit={handleSubmit} noValidate>
          <FormGrid columns={2}>
            {linked ? (
              <>
                <div className="k-readonly-field">
                  <span>Meal date</span>
                  <strong>{formatDate(forecast.meal_date)}</strong>
                </div>
                <div className="k-readonly-field">
                  <span>Meal type</span>
                  <strong>{mealTypeLabel(forecast.meal_type)}</strong>
                </div>
                <div className="k-readonly-field">
                  <span>Menu mode</span>
                  <strong>{menuModeLabel(forecast.menu_mode)}</strong>
                </div>
                <TextInput
                  label="Actual attendance"
                  type="number"
                  min="0"
                  step="1"
                  value={form.actual_people}
                  onChange={(event) => setField("actual_people", event.target.value)}
                  error={errors.actual_people}
                  hint={`Forecast expected ${formatNumber(forecast.expected_people)} people. Record who actually attended.`}
                  required
                />
              </>
            ) : (
              <>
                <TextInput
                  label="Meal date"
                  type="date"
                  max={todayISO()}
                  value={form.meal_date}
                  onChange={(event) => setField("meal_date", event.target.value)}
                  error={errors.meal_date}
                  hint="Meal records require a completed meal date."
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
                <SelectInput
                  label="Menu mode"
                  value={form.menu_mode}
                  onChange={(event) => setField("menu_mode", event.target.value)}
                  placeholder="Not specified (legacy record)"
                  options={[
                    { value: "CHOICE_BASED", label: menuModeLabel("CHOICE_BASED") },
                    { value: "FIXED_MEAL", label: menuModeLabel("FIXED_MEAL") },
                  ]}
                  hint="Leave blank if the original service mode is unknown."
                />
                <TextInput
                  label="Actual attendance"
                  type="number"
                  min="0"
                  step="1"
                  value={form.actual_people}
                  onChange={(event) => setField("actual_people", event.target.value)}
                  error={errors.actual_people}
                  required
                />
              </>
            )}
          </FormGrid>

          <div className="k-form-section">
            <div className="k-form-section-heading">
              <h2>Dishes served</h2>
              <p>
                Enter prepared quantities, unserved leftovers and plate waste in the serving unit
                shown. Plate waste left as “not measured” is stored as unknown, not zero.
              </p>
            </div>

            {!linked ? (
              <FoodMultiSelect
                foods={foods}
                selectedIds={form.items.map((item) => item.food_item_id)}
                onChange={setSelectedDishes}
                label="Dishes in this meal"
                hint="Add every dish that was part of the service."
                error={errors.items}
                maxHeight={260}
              />
            ) : (
              <p className="k-note">
                <Info size={14} aria-hidden="true" />
                The backend requires the recorded dish set to match the linked forecast exactly.
                Quantities are entered below.
              </p>
            )}

            {foodsError ? <FormError message={foodsError} /> : null}

            {form.items.length === 0 ? (
              <EmptyState
                icon={Utensils}
                title="No dishes added"
                description="Choose the dishes served to start entering quantities."
                className="k-empty-compact"
              />
            ) : (
              <div className="k-meal-items">
                {form.items.map((item) => {
                  const preview = itemPreview(item);
                  const itemError = itemErrors[item.food_item_id] ?? {};
                  const piece = item.serving_unit === "piece";
                  return (
                    <article className="k-meal-item" key={item.food_item_id}>
                      <div className="k-meal-item-head">
                        <div>
                          <h3>{item.name}</h3>
                          <div className="k-badge-row">
                            <RoleBadge role={item.food_role} />
                            <Badge tone="outline">{unitLabel(item.serving_unit)}</Badge>
                          </div>
                        </div>
                        {!linked ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            onClick={() => removeItem(item.food_item_id)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>

                      <FormGrid columns={4}>
                        <TextInput
                          label="Prepared"
                          type="number"
                          min="0"
                          step={piece ? 1 : "any"}
                          value={item.prepared_servings}
                          onChange={(event) =>
                            updateItem(item.food_item_id, { prepared_servings: event.target.value })
                          }
                          error={itemError.prepared_servings}
                          required
                        />
                        <TextInput
                          label="Unserved leftover"
                          type="number"
                          min="0"
                          step={piece ? 1 : "any"}
                          value={item.leftover_servings}
                          onChange={(event) =>
                            updateItem(item.food_item_id, { leftover_servings: event.target.value })
                          }
                          error={itemError.leftover_servings}
                          required
                        />
                        <Field
                          label="Plate waste"
                          htmlFor={`plate-waste-${item.food_item_id}`}
                          error={itemError.plate_waste_servings}
                          hint="Leave not measured if plate waste was not weighed."
                        >
                          <input
                            id={`plate-waste-${item.food_item_id}`}
                            className="k-input"
                            type="number"
                            min="0"
                            step={piece ? 1 : "any"}
                            value={item.plate_waste_servings}
                            disabled={item.plate_waste_unknown}
                            onChange={(event) =>
                              updateItem(item.food_item_id, {
                                plate_waste_servings: event.target.value,
                              })
                            }
                          />
                          <CheckboxField
                            label="Plate waste not measured"
                            checked={item.plate_waste_unknown}
                            onChange={(event) =>
                              updateItem(item.food_item_id, {
                                plate_waste_unknown: event.target.checked,
                                ...(event.target.checked ? { plate_waste_servings: "" } : {}),
                              })
                            }
                          />
                        </Field>
                        <div className="k-field">
                          <span className="k-label">Shortage</span>
                          <CheckboxField
                            label="A shortage occurred"
                            description="Not enough food for the people served."
                            checked={item.shortage_occurred}
                            onChange={(event) =>
                              updateItem(item.food_item_id, {
                                shortage_occurred: event.target.checked,
                              })
                            }
                          />
                        </div>
                      </FormGrid>

                      <div className="k-meal-preview">
                        <span>
                          Served quantity:{" "}
                          <strong>{formatQuantity(preview.served, item.serving_unit)}</strong>
                        </span>
                        <span>
                          Consumed quantity:{" "}
                          <strong>
                            {item.plate_waste_unknown
                              ? "Not measured"
                              : formatQuantity(preview.consumed, item.serving_unit)}
                          </strong>
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <FormError message={submitError} />

          <div className="k-form-actions">
            <Button type="submit" loading={submitting} icon={Save}>
              Save meal record
            </Button>
            <Button variant="secondary" to="/kitchen/meal-records" disabled={submitting}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>

      <div className="k-page-footer-note">
        <ArrowLeft size={14} aria-hidden="true" />
        <span>
          After saving, the backend calculates served and consumed quantities. You can log surplus
          from the meal record detail page.
        </span>
        <ArrowRight size={14} aria-hidden="true" />
      </div>
    </>
  );
}
