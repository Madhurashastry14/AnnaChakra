import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url ?? "";
    const isAuthRequest =
      url.includes("/api/v1/auth/login") || url.includes("/api/v1/auth/register");

    if (status === 401 && !isAuthRequest) {
      sessionStorage.removeItem("access_token");
      window.dispatchEvent(new CustomEvent("annachakra:unauthorized"));
    }

    return Promise.reject(error);
  },
);

export default api;
