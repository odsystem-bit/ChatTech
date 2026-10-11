const API_URL = import.meta.env.VITE_API_URL || "https://fibretrack.mantota.com/api/index.php";
const STORAGE_KEY = "fibretrack_account";

export function getApiAuthHeaders(codeOverride) {
  const code = codeOverride || sessionStorage.getItem("fibretrack_api_code");
  return code ? { "X-User-Code": String(code) } : {};
}

export function getApiCode() {
  return sessionStorage.getItem("fibretrack_api_code") || "";
}

async function apiPost(action, body = {}, authCode) {
  const res = await fetch(`${API_URL}?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getApiAuthHeaders(authCode) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur API");
  return data;
}

async function apiGet(action) {
  const res = await fetch(`${API_URL}?action=${action}`, { headers: getApiAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur API");
  return data;
}

export async function fetchAccounts() {
  return apiGet("accounts_list");
}

export async function addAccount(nom, code) {
  return apiPost("account_add", { nom, code });
}

export async function deleteAccount(id) {
  return apiPost("account_delete", { id });
}

export async function validateCode(code) {
  try {
    return await apiPost("account_validate", { code }, code);
  } catch {
    return null;
  }
}

export function setCurrentAccount(account) {
  const { code, ...accountDetails } = account;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accountDetails));
  if (code) sessionStorage.setItem("fibretrack_api_code", String(code));
}

export function getCurrentAccount() {
  if (!sessionStorage.getItem("fibretrack_api_code")) return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearCurrentAccount() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem("fibretrack_api_code");
}
