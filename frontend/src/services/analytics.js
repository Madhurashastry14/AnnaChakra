import api from "./api.js";

function analyticsParams(filters = {}) {
  const params = {};
  for (const key of ["start_date", "end_date", "meal_type", "menu_mode", "food_item_id", "forecast_id"]) {
    if (filters[key] !== undefined && filters[key] !== null && filters[key] !== "") {
      params[key] = filters[key];
    }
  }
  return params;
}

export async function getWasteSummary(filters) {
  const { data } = await api.get("/api/v1/analytics/waste-summary", {
    params: analyticsParams(filters),
  });
  return data;
}

export async function getFoodAcceptance(filters) {
  const { data } = await api.get("/api/v1/analytics/food-acceptance", {
    params: analyticsParams(filters),
  });
  return data;
}

export async function getWasteTrends(filters) {
  const { data } = await api.get("/api/v1/analytics/waste-trends", {
    params: analyticsParams(filters),
  });
  return data;
}

export async function getWasteInsights(filters) {
  const { data } = await api.get("/api/v1/analytics/waste-insights", {
    params: analyticsParams(filters),
  });
  return data;
}

export async function getPortionRecommendations(filters) {
  const { data } = await api.get("/api/v1/analytics/portion-recommendations", {
    params: analyticsParams(filters),
  });
  return data;
}
