import api from "../services/api.js";

export async function loginRequest(email, password) {
  const { data } = await api.post("/api/v1/auth/login", { email, password });
  return data;
}

export async function registerRequest(payload) {
  const { data } = await api.post("/api/v1/auth/register", payload);
  return data;
}

export async function getCurrentUser() {
  const { data } = await api.get("/api/v1/auth/me");
  return data;
}
