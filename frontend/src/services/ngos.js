import api from "./api.js";

export async function registerNGO(payload) {
  const { data } = await api.post("/api/v1/ngos", payload);
  return data;
}

export async function getMyNGO() {
  const { data } = await api.get("/api/v1/ngos/me");
  return data;
}

export async function updateMyNGO(payload) {
  const { data } = await api.patch("/api/v1/ngos/me", payload);
  return data;
}

export async function listRequirements() {
  const { data } = await api.get("/api/v1/ngo-requirements");
  return data;
}

export async function getRequirement(requirementId) {
  const { data } = await api.get(`/api/v1/ngo-requirements/${requirementId}`);
  return data;
}

export async function createRequirement(payload) {
  const { data } = await api.post("/api/v1/ngo-requirements", payload);
  return data;
}

export async function updateRequirement(requirementId, payload) {
  const { data } = await api.patch(`/api/v1/ngo-requirements/${requirementId}`, payload);
  return data;
}

export async function closeRequirement(requirementId) {
  await api.delete(`/api/v1/ngo-requirements/${requirementId}`);
}
