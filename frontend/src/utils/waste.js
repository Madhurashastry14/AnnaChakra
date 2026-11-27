import {
  fromDateTimeLocal,
  isWholeNumber,
  toDateTimeLocal,
} from "./format.js";

export function emptyWasteForm(overrides = {}) {
  return {
    food_item_id: "",
    confirmed_servings: "",
    waste_type: "UNSERVED_SURPLUS",
    prediction_id: "",
    meal_record_item_id: "",
    notes: "",
    declared: false,
    discard_at: "",
    prepared_at: "",
    ...overrides,
  };
}

export function wasteFormFromLog(log) {
  return emptyWasteForm({
    food_item_id: String(log.food_item_id ?? ""),
    confirmed_servings: String(log.confirmed_servings ?? ""),
    waste_type: log.waste_type ?? "UNSERVED_SURPLUS",
    prediction_id: log.prediction_id ?? log.image_id ?? "",
    meal_record_item_id: log.meal_record_item_id ? String(log.meal_record_item_id) : "",
    notes: log.notes ?? "",
    declared: log.unserved_confirmed === true && log.safe_handling_confirmed === true
      && log.contamination_suspected === false,
    discard_at: toDateTimeLocal(log.discard_at ?? log.safe_until),
    prepared_at: toDateTimeLocal(log.prepared_at),
  });
}

export function buildWastePayload(form, { simulated = false, includeCleared = false } = {}) {
  const payload = {
    food_item_id: Number(form.food_item_id),
    confirmed_servings: Number(form.confirmed_servings),
    waste_type: form.waste_type,
  };
  if (form.prediction_id) payload.prediction_id = form.prediction_id;
  else if (includeCleared) payload.prediction_id = null;
  if (form.meal_record_item_id) payload.meal_record_item_id = Number(form.meal_record_item_id);
  else if (includeCleared) payload.meal_record_item_id = null;
  if (form.notes.trim()) payload.notes = form.notes.trim();
  else if (includeCleared) payload.notes = null;
  if (form.prepared_at && !includeCleared) payload.prepared_at = fromDateTimeLocal(form.prepared_at);
  if (simulated && form.waste_type === "UNSERVED_SURPLUS") {
    payload.unserved_confirmed = form.declared;
    payload.safe_handling_confirmed = form.declared;
    payload.contamination_suspected = form.declared ? false : null;
    payload.discard_at = form.discard_at ? fromDateTimeLocal(form.discard_at) : null;
  }
  return payload;
}

export function validateWasteForm(form, food, simulated) {
  const errors = {};

  if (!form.food_item_id) errors.food_item_id = "Select the food item.";

  const quantity = Number(form.confirmed_servings);
  if (form.confirmed_servings === "" || !Number.isFinite(quantity) || quantity <= 0) {
    errors.confirmed_servings = "Enter a quantity greater than zero.";
  } else if (food?.serving_unit === "piece" && !isWholeNumber(quantity)) {
    errors.confirmed_servings = "Piece-based quantities must be whole numbers.";
  }

  if (form.prediction_id && !/^[0-9a-f]{32}$/.test(form.prediction_id)) {
    errors.prediction_id = "The prediction reference is not valid.";
  }

  if (form.notes.length > 1000) errors.notes = "Notes must be 1000 characters or fewer.";

  if (form.prepared_at) {
    const prepared = new Date(form.prepared_at);
    if (prepared.getTime() > Date.now()) {
      errors.prepared_at = "Preparation time cannot be in the future.";
    }
  }

  if (simulated && form.waste_type === "UNSERVED_SURPLUS" && form.declared && !form.discard_at) {
    errors.discard_at = "Enter a discard deadline for the declared surplus.";
  }

  return errors;
}
