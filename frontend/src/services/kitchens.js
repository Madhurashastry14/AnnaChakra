import api from "./api.js";

export async function createKitchen(payload) {
  const { data } = await api.post("/api/v1/kitchens", payload);
  return data;
}

export async function getMyKitchen() {
  const { data } = await api.get("/api/v1/kitchens/me");
  return data;
}

export async function updateMyKitchen(payload) {
  const { data } = await api.patch("/api/v1/kitchens/me", payload);
  return data;
}
