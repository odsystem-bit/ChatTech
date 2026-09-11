const API_URL = import.meta.env.VITE_API_URL || "https://fibretrack.mantota.com/api/index.php";
const STORAGE_KEY = "fibretrack_account";

async function apiPost(action, body = {}) {
  const res = await fetch(`${API_URL}?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur API");
  return data;
}

async function apiGet(action) {
  const res = await fetch(`${API_URL}?action=${action}`);
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
    return await apiPost("account_validate", { code });
  } catch {
    return null;
  }
}

export function setCurrentAccount(account) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
}

export function getCurrentAccount() {
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
}
