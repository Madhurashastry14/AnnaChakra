const TOKEN_KEY = "annachakra.accessToken";
const ROLE_KEY = "annachakra.role";

function getStorageValue(key) {
  return sessionStorage.getItem(key) || localStorage.getItem(key);
}

export function getAuthToken() {
  return getStorageValue(TOKEN_KEY);
}

export function getAuthRole() {
  return getStorageValue(ROLE_KEY);
}

export function saveAuthSession(accessToken, role, rememberMe) {
  clearAuthSession();
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(TOKEN_KEY, accessToken);
  storage.setItem(ROLE_KEY, role);
}

export function clearAuthSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}
