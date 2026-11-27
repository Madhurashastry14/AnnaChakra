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
    unserved_confirmed: "",
    storage_verified: "",
    contamination_suspected: "",
    storage_method: "",
    temperature_measured_at: "",
    temperature_history_started_at: "",
    temperature_history_min_c: "",
    temperature_history_max_c: "",
    temperature_history_reference: "",
    uncontrolled_minutes: "",
    discard_at: "",
    prepared_at: "",
    storage_temperature: "",
    safe_handling_confirmed: false,
    ...overrides,
  };
}

function triState(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  return "";
}

export function wasteFormFromLog(log) {
  return emptyWasteForm({
    food_item_id: String(log.food_item_id ?? ""),
    confirmed_servings: String(log.confirmed_servings ?? ""),
    waste_type: log.waste_type ?? "UNSERVED_SURPLUS",
    prediction_id: log.prediction_id ?? log.image_id ?? "",
    meal_record_item_id: log.meal_record_item_id ? String(log.meal_record_item_id) : "",
    notes: log.notes ?? "",
    unserved_confirmed: triState(log.unserved_confirmed),
    storage_verified: triState(log.storage_verified),
    contamination_suspected: triState(log.contamination_suspected),
    storage_method: log.storage_method ?? "",
    temperature_measured_at: toDateTimeLocal(log.temperature_measured_at),
    temperature_history_started_at: toDateTimeLocal(log.temperature_history_started_at),
    temperature_history_min_c:
      log.temperature_history_min_c === null || log.temperature_history_min_c === undefined
        ? ""
        : String(log.temperature_history_min_c),
    temperature_history_max_c:
      log.temperature_history_max_c === null || log.temperature_history_max_c === undefined
        ? ""
        : String(log.temperature_history_max_c),
    temperature_history_reference: log.temperature_history_reference ?? "",
    uncontrolled_minutes:
      log.uncontrolled_minutes === null || log.uncontrolled_minutes === undefined
        ? ""
        : String(log.uncontrolled_minutes),
    discard_at: toDateTimeLocal(log.discard_at ?? log.safe_until),
    prepared_at: toDateTimeLocal(log.prepared_at),
    storage_temperature:
      log.storage_temperature === null || log.storage_temperature === undefined
        ? ""
        : String(log.storage_temperature),
    safe_handling_confirmed: Boolean(log.safe_handling_confirmed),
  });
}

function applySafetyFields(payload, form, includeCleared = false) {
  const triStates = ["unserved_confirmed", "storage_verified", "contamination_suspected"];
  for (const field of triStates) {
    if (form[field] !== "") payload[field] = form[field] === "true";
    else if (includeCleared) payload[field] = null;
  }

  if (form.storage_method) payload.storage_method = form.storage_method;
  else if (includeCleared) payload.storage_method = null;

  const dateTimes = [
    "temperature_measured_at",
    "temperature_history_started_at",
    "discard_at",
    "prepared_at",
  ];
  for (const field of dateTimes) {
    if (form[field]) payload[field] = fromDateTimeLocal(form[field]);
    else if (includeCleared) payload[field] = null;
  }

  const numbers = [
    "temperature_history_min_c",
    "temperature_history_max_c",
    "uncontrolled_minutes",
    "storage_temperature",
  ];
  for (const field of numbers) {
    if (form[field] !== "") payload[field] = Number(form[field]);
    else if (includeCleared) payload[field] = null;
  }

  if (form.temperature_history_reference.trim()) {
    payload.temperature_history_reference = form.temperature_history_reference.trim();
  } else if (includeCleared) {
    payload.temperature_history_reference = null;
  }

  payload.safe_handling_confirmed = Boolean(form.safe_handling_confirmed);
  if (form.notes.trim()) payload.notes = form.notes.trim();
  else if (includeCleared) payload.notes = null;
  return payload;
}

export function buildWastePayload(form, { includeIdentity = true, includeCleared = false } = {}) {
  const payload = {};
  if (includeIdentity) {
    payload.food_item_id = Number(form.food_item_id);
    payload.confirmed_servings = Number(form.confirmed_servings);
    payload.waste_type = form.waste_type;
  }
  if (form.prediction_id) payload.prediction_id = form.prediction_id;
  else if (includeCleared) payload.prediction_id = null;
  if (form.meal_record_item_id) payload.meal_record_item_id = Number(form.meal_record_item_id);
  else if (includeCleared) payload.meal_record_item_id = null;
  return applySafetyFields(payload, form, includeCleared);
}

export function buildSafetyCheckPayload(form, { includeCleared = false } = {}) {
  const payload = {};
  applySafetyFields(payload, form, includeCleared);
  return payload;
}

export function validateWasteForm(form, food) {
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

  if (form.temperature_history_reference.length > 255) {
    errors.temperature_history_reference = "Use 255 characters or fewer.";
  }

  const min = form.temperature_history_min_c === "" ? null : Number(form.temperature_history_min_c);
  const max = form.temperature_history_max_c === "" ? null : Number(form.temperature_history_max_c);
  if (min !== null && !Number.isFinite(min)) errors.temperature_history_min_c = "Enter a number.";
  if (max !== null && !Number.isFinite(max)) errors.temperature_history_max_c = "Enter a number.";
  if (min !== null && max !== null && Number.isFinite(min) && Number.isFinite(max) && min > max) {
    errors.temperature_history_max_c = "Maximum temperature must be at least the minimum.";
  }

  if (form.uncontrolled_minutes !== "") {
    const minutes = Number(form.uncontrolled_minutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 525600) {
      errors.uncontrolled_minutes = "Enter whole minutes between 0 and 525600.";
    }
  }

  return errors;
}
