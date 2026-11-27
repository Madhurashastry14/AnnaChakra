import api from "./api.js";

export async function createMealRecord(payload) {
  const { data } = await api.post("/api/v1/meal-records", payload);
  return data;
}

export async function listMealRecords() {
  const { data } = await api.get("/api/v1/meal-records");
  return data;
}

export async function getMealRecord(mealRecordId) {
  const { data } = await api.get(`/api/v1/meal-records/${mealRecordId}`);
  return data;
}

export async function updateMealRecord(mealRecordId, payload) {
  const { data } = await api.patch(`/api/v1/meal-records/${mealRecordId}`, payload);
  return data;
}

export async function getMealWasteSummary(mealRecordId) {
  const { data } = await api.get(`/api/v1/meal-records/${mealRecordId}/waste-summary`);
  return data;
}

export async function getMealSurplusDrafts(mealRecordId) {
  const { data } = await api.get(`/api/v1/meal-records/${mealRecordId}/surplus-drafts`);
  return data;
}
