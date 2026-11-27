import api from "./api";

export async function registerUser(registration) {
  const response = await api.post("/api/v1/auth/register", registration);
  return response.data;
}

export async function loginUser(credentials) {
  const response = await api.post("/api/v1/auth/login", credentials);
  return response.data;
}

export function getApiErrorMessage(error, fallback) {
  const detail = error.response?.data?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => item?.msg)
      .filter((message) => typeof message === "string");

    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  if (error.request && !error.response) {
    return "Could not reach AnnaChakra. Check that the backend is running and try again.";
  }

  return fallback;
}
