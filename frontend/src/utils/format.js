export const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER"];
export const MENU_MODES = ["CHOICE_BASED", "FIXED_MEAL"];
export const WASTE_TYPES = ["UNSERVED_SURPLUS", "PLATE_WASTE", "SPOILED_FOOD"];
export const SAFETY_STATUSES = ["PENDING", "ELIGIBLE", "INELIGIBLE"];
export const FOOD_ROLES = ["MAIN_DISH", "ACCOMPANIMENT", "SIDE_DISH", "DESSERT", "BEVERAGE"];

const LABELS = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  CHOICE_BASED: "Choice-based",
  FIXED_MEAL: "Fixed meal",
  UNSERVED_SURPLUS: "Unserved surplus",
  PLATE_WASTE: "Plate waste",
  SPOILED_FOOD: "Spoiled food",
  PENDING: "Pending",
  ELIGIBLE: "Eligible",
  INELIGIBLE: "Ineligible",
  MAIN_DISH: "Main dish",
  ACCOMPANIMENT: "Accompaniment",
  SIDE_DISH: "Side dish",
  DESSERT: "Dessert",
  BEVERAGE: "Beverage",
  BASELINE: "Catalogue-based estimate",
  LOCAL_HISTORY: "Kitchen history-based estimate",
  ML: "Machine learning estimate",
  CATALOGUE_BASED: "Catalogue-based recommendation",
  HISTORY_BASED: "Kitchen history-based recommendation",
  NO_HISTORY: "No kitchen history yet",
  LIMITED_HISTORY: "Limited kitchen history",
  ESTIMATED: "Count estimated",
  UNSUPPORTED_FOOD: "Automatic counting unsupported",
  UNSUITABLE_IMAGE: "Image unsuitable for counting",
  DETECTION_FAILED: "Detection failed",
  NOT_ATTEMPTED: "Counting not attempted",
  EXPERIMENTAL: "Experimental estimate",
  UNAVAILABLE: "Estimate unavailable",
  KITCHEN_STAFF: "Kitchen staff",
  NGO_MANAGER: "NGO manager",
  ADMIN: "Administrator",
  HOT_HOLDING: "Hot holding",
  REFRIGERATED: "Refrigerated",
  FROZEN: "Frozen",
  AMBIENT: "Ambient",
  UNKNOWN: "Unknown",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Information",
  WARNING: "Warning",
  CRITICAL: "Critical",
};

export function labelFor(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return LABELS[value] ?? String(value).replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export function safetyTone(status) {
  if (status === "ELIGIBLE") return "success";
  if (status === "INELIGIBLE") return "danger";
  if (status === "PENDING") return "warning";
  return "neutral";
}

export function severityTone(severity) {
  const normalized = String(severity ?? "").toUpperCase();
  if (["CRITICAL", "HIGH", "DANGER"].includes(normalized)) return "danger";
  if (["WARNING", "MEDIUM"].includes(normalized)) return "warning";
  if (["SUCCESS", "LOW"].includes(normalized)) return "success";
  return "info";
}

export function verificationTone(status) {
  if (status === "VERIFIED") return "success";
  if (status === "REJECTED") return "danger";
  return "warning";
}

export function mealTypeLabel(value) {
  return labelFor(value);
}

export function menuModeLabel(value) {
  return value ? labelFor(value) : "Legacy (mode not recorded)";
}

export function wasteTypeLabel(value) {
  return labelFor(value);
}

export function methodLabel(value) {
  return labelFor(value);
}

export function unitLabel(unit) {
  if (unit === "piece") return "pieces";
  if (unit === "serving") return "servings";
  return unit ?? "";
}

export function unitSingular(unit) {
  if (unit === "piece") return "piece";
  if (unit === "serving") return "serving";
  return unit ?? "";
}

export function formatNumber(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits,
  }).format(Number(value));
}

export function formatQuantity(value, unit, { approximate = false } = {}) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) {
    return "—";
  }
  const prefix = approximate ? "~" : "";
  return `${prefix}${formatNumber(value)} ${unitLabel(unit)}`;
}

export function percent(value, digits = 1) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) {
    return "—";
  }
  return `${Number(value).toFixed(digits)}%`;
}

export function formatDate(value) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toDateInput(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return todayISOFromDate(date);
}

export function todayISOFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function fromDateTimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function toNullableBool(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

export function isWholeNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) % 1 === 0;
}

export function sumByUnit(rows, field) {
  const totals = { serving: 0, piece: 0 };
  for (const row of rows ?? []) {
    const raw = row?.[field];
    if (raw === null || raw === undefined || raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (row.serving_unit === "serving") totals.serving += value;
    else if (row.serving_unit === "piece") totals.piece += value;
  }
  return totals;
}

export function weightedRate(rows, rateField, weightField = "measured_served") {
  let weighted = 0;
  let weight = 0;
  for (const row of rows ?? []) {
    const rate = Number(row?.[rateField]);
    const rowWeight = Number(row?.[weightField]);
    if (!Number.isFinite(rate) || !Number.isFinite(rowWeight) || rowWeight <= 0) continue;
    weighted += rate * rowWeight;
    weight += rowWeight;
  }
  return weight > 0 ? weighted / weight : null;
}

export function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items ?? []) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

export function sortByDateDesc(items, field = "created_at") {
  return [...(items ?? [])].sort((a, b) => {
    const left = new Date(b?.[field] ?? 0).getTime();
    const right = new Date(a?.[field] ?? 0).getTime();
    return left - right;
  });
}

export function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

export function truncate(value, length = 60) {
  if (!value) return "";
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function formatDateRange(start, end) {
  if (!start && !end) return "All time";
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  if (start) return `From ${formatDate(start)}`;
  return `Until ${formatDate(end)}`;
}

export function isFutureDate(value) {
  if (!value) return false;
  return String(value).slice(0, 10) > todayISO();
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return Number(count) === 1 ? singular : plural;
}
