import api from "./api.js";

export async function createWasteLog(payload) {
  const { data } = await api.post("/api/v1/waste-logs", payload);
  return data;
}

export async function listWasteLogs(params = {}) {
  const { data } = await api.get("/api/v1/waste-logs", { params });
  return data;
}

export async function getWasteLog(wasteLogId) {
  const { data } = await api.get(`/api/v1/waste-logs/${wasteLogId}`);
  return data;
}

export async function updateWasteLog(wasteLogId, payload) {
  const { data } = await api.patch(`/api/v1/waste-logs/${wasteLogId}`, payload);
  return data;
}

export async function checkWasteLogSafety(wasteLogId, payload = {}) {
  const { data } = await api.post(`/api/v1/waste-logs/${wasteLogId}/safety-check`, payload);
  return data;
}
