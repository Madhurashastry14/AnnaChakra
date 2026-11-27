import axios from "axios";
import { getAuthToken } from "./authStorage";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const isPublicAuthRequest = /\/auth\/(login|register)(?:\?|$)/.test(config.url || "");
  const token = isPublicAuthRequest ? null : getAuthToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
