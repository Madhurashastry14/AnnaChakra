import api from "./api.js";

export async function recommendMenu(payload) {
  const { data } = await api.post("/api/v1/menu/recommend", payload);
  return data;
}
