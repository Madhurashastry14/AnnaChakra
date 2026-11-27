import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { History, Sparkles } from "lucide-react";
import { listFoodItems } from "../../services/foodItems.js";
import { createForecast } from "../../services/forecasts.js";
import { recommendMenu } from "../../services/menu.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatNumber, mealTypeLabel, todayISO, unitLabel, unitSingular } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardBody, CardHeader } from "../../components/ui/Card.jsx";
import { FormError, FormGrid, SelectInput, TextInput } from "../../components/ui/Form.jsx";
import { FoodMultiSelect } from "../../components/kitchen/FoodSelectors.jsx";

function readPrefill() {
  try {
    return JSON.parse(sessionStorage.getItem("annachakra:forecast-prefill"));
  } catch {
    return null;
  }
}

function validateMeal(form, requireDishes) {
  const errors = {};
  const attendance = Number(form.expected_people);
  if (!form.meal_date || form.meal_date < todayISO()) {
    errors.meal_date = "Choose today or a future date.";
  }
  if (!Number.isInteger(attendance) || attendance <= 0 || attendance > 2147483647) {
    errors.expected_people = "Enter a valid whole number of people.";
  }
  if (requireDishes && !form.food_item_ids.length) {
    errors.food_item_ids = "Choose at least one dish.";
  }
  return errors;
}

export default function ForecastPage() {
  const location = useLocation();
  const [foods, setFoods] = useState(null);
  const [foodsError, setFoodsError] = useState("");
  const [form, setForm] = useState(() => {
    const prefill = location.state?.prefill ?? readPrefill();
    return {
      meal_date: prefill?.meal_date ?? todayISO(),
      meal_type: prefill?.meal_type ?? "LUNCH",
      expected_people: prefill?.expected_people ?? "",
      menu_mode: prefill?.menu_mode ?? "CHOICE_BASED",
      food_item_ids: prefill?.food_item_ids ?? [],
    };
  });
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const resultRef = useRef(null);

  useEffect(() => {
    sessionStorage.removeItem("annachakra:forecast-prefill");
  }, []);

  useEffect(() => {
    let active = true;
    listFoodItems({ limit: 100 })
      .then((data) => {
        if (active) setFoods(data.items ?? []);
      })
      .catch((error) => {
        if (active) setFoodsError(getErrorMessage(error, "Couldn't load the dishes."));
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setRequestError("");
    setResult(null);
  }

  async function runPrediction(event) {
    event.preventDefault();
    await submit("predict");
  }

  async function submit(action) {
    if (busy) return;
    const predicting = action === "predict";
    const nextErrors = validateMeal(form, predicting);
    setErrors(nextErrors);
    setRequestError("");
    if (Object.keys(nextErrors).length) return;

    const { food_item_ids, ...details } = form;
    const meal = { ...details, expected_people: Number(details.expected_people) };
    setBusy(action);
    if (predicting) setResult(null);
    try {
      if (predicting) {
        setResult(await createForecast({ ...meal, food_item_ids }));
      } else {
        const suggestion = await recommendMenu(meal);
        const ids = suggestion.recommended_food_item_ids ?? [];
        const known = new Set(foods.map((food) => food.id));
        const available = ids.filter((id) => known.has(id));
        if (available.length) setField("food_item_ids", available);
        else setRequestError("No dishes could be suggested. Choose dishes from the list.");
      }
    } catch (error) {
      setRequestError(getErrorMessage(error, predicting ? "Couldn't predict preparation quantities." : "Couldn't suggest dishes. You can choose them below."));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHeader
        title="Plan a meal"
        description="Enter the number of people and choose your dishes. We'll tell you how much to prepare."
        actions={<Button variant="secondary" to="/kitchen/forecasts" icon={History}>Past forecasts</Button>}
      />

      <Card className="k-meal-planning-card">
        <form className="k-card-body" onSubmit={runPrediction} noValidate>
          <fieldset className="k-form" disabled={Boolean(busy)}>
            <FormGrid columns={2}>
              <TextInput label="Meal date" type="date" min={todayISO()} value={form.meal_date}
                onChange={(event) => setField("meal_date", event.target.value)} error={errors.meal_date} required />
              <SelectInput label="Meal" value={form.meal_type}
                onChange={(event) => setField("meal_type", event.target.value)}
                options={["BREAKFAST", "LUNCH", "DINNER"].map((value) => ({ value, label: mealTypeLabel(value) }))} />
              <TextInput label="Expected people" type="number" min="1" max="2147483647" step="1"
                value={form.expected_people} onChange={(event) => setField("expected_people", event.target.value)}
                error={errors.expected_people} required />
              <SelectInput label="How is the meal served?" value={form.menu_mode}
                onChange={(event) => setField("menu_mode", event.target.value)}
                options={[
                  { value: "CHOICE_BASED", label: "People choose a main dish" },
                  { value: "FIXED_MEAL", label: "Everyone gets the same main dishes" },
                ]} />
            </FormGrid>

            {foodsError ? <FormError message={foodsError} /> : (
              <FoodMultiSelect foods={foods} selectedIds={form.food_item_ids}
                onChange={(ids) => setField("food_item_ids", ids)} label="Dishes" error={errors.food_item_ids}
                disabled={Boolean(busy)} maxHeight={240} required />
            )}

            <FormError message={requestError} />
            <div className="k-form-actions">
              <Button type="submit" disabled={!foods?.length} loading={busy === "predict"}>
                {busy === "predict" ? "Predicting..." : "Predict"}
              </Button>
              {!form.food_item_ids.length && foods?.length ? (
                <Button variant="ghost" icon={Sparkles} loading={busy === "suggest"} onClick={() => submit("suggest")}>
                  Suggest dishes
                </Button>
              ) : null}
            </div>
          </fieldset>
        </form>
      </Card>

      {result ? (
        <Card className="k-meal-planning-card k-preparation-result" tabIndex={-1} ref={resultRef}
          aria-label="How much to prepare">
          <CardHeader title="How much to prepare" />
          <CardBody>
            <dl className="k-preparation-list">
              {result.items.map((item) => (
                <div key={item.food_item_id}>
                  <dt>{item.name}</dt>
                  <dd>{formatNumber(item.recommended_servings)}{" "}
                    {item.recommended_servings === 1 ? unitSingular(item.serving_unit) : unitLabel(item.serving_unit)}
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
