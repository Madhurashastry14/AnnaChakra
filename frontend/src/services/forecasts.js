import api from "./api.js";

export async function createForecast(payload) {
  const { data } = await api.post("/api/v1/forecasts", payload);
  return data;
}

export async function listForecasts({ mealDate } = {}) {
  const params = {};
  if (mealDate) params.meal_date = mealDate;
  const { data } = await api.get("/api/v1/forecasts", { params });
  return data;
}

export async function getForecast(forecastId) {
  const { data } = await api.get(`/api/v1/forecasts/${forecastId}`);
  return data;
}
