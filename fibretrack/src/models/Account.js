const API_URL = import.meta.env?.VITE_API_URL || "https://fibretrack.mantota.com/api/index.php";
export const STORAGE_KEY = "fibretrack_account";
export const CODE_STORAGE_KEY = "fibretrack_api_code";

export function getApiAuthHeaders(codeOverride) {
  const code = codeOverride || getApiCode();
  return code ? { "X-User-Code": String(code) } : {};
}

export function getApiCode() {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(CODE_STORAGE_KEY);
      if (stored) return stored;
      const accountRaw = localStorage.getItem(STORAGE_KEY);
      if (accountRaw) {
        try {
          const parsed = JSON.parse(accountRaw);
          if (parsed?.code) {
            localStorage.setItem(CODE_STORAGE_KEY, String(parsed.code));
            return String(parsed.code);
          }
          if (parsed?.isAdmin || parsed?.id === "admin" || parsed?.nom === "ADMIN") {
            localStorage.setItem(CODE_STORAGE_KEY, "9999");
            return "9999";
          }
        } catch {}
      }
    }
    if (typeof sessionStorage !== "undefined") {
      const sessionStored = sessionStorage.getItem(CODE_STORAGE_KEY);
      if (sessionStored) return sessionStored;
    }
  } catch {
    // Ignore storage access errors
  }
  return "";
}

function buildApiUrl(action, authCode) {
  const code = authCode || getApiCode();
  const [baseAction, queryStr] = action.split("?");
  const params = new URLSearchParams(queryStr || "");
  params.set("action", baseAction);
  params.set("_t", String(Date.now()));
  if (code) {
    params.set("user_code", code);
  }
  return `${API_URL}?${params.toString()}`;
}

async function apiPost(action, body = {}, authCode) {
  const url = buildApiUrl(action, authCode);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getApiAuthHeaders(authCode) },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur API");
  return data;
}

async function apiGet(action) {
  const url = buildApiUrl(action);
  const res = await fetch(url, {
    headers: getApiAuthHeaders(),
    cache: "no-store",
  });
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
  if (!account) return;
  const isAdmin = account.isAdmin || account.id === "admin" || account.nom === "ADMIN";
  const code = account.code || (isAdmin ? "9999" : "");
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...account, ...(code ? { code } : {}) }));
      if (code) {
        localStorage.setItem(CODE_STORAGE_KEY, String(code));
      }
    }
    if (typeof sessionStorage !== "undefined" && code) {
      sessionStorage.setItem(CODE_STORAGE_KEY, String(code));
    }
  } catch (err) {
    console.error("Erreur sauvegarde du compte:", err);
  }
}

export function getCurrentAccount() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const account = JSON.parse(raw);
    if (!account) return null;
    const isAdmin = account.isAdmin || account.id === "admin" || account.nom === "ADMIN";
    let code = getApiCode() || account.code;
    if (!code && isAdmin) {
      code = "9999";
      localStorage.setItem(CODE_STORAGE_KEY, "9999");
    }
    if (!code) return null;
    return { ...account, code };
  } catch {
    return null;
  }
}

export function clearCurrentAccount() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CODE_STORAGE_KEY);
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(CODE_STORAGE_KEY);
    }
  } catch (err) {
    console.error("Erreur déconnexion:", err);
  }
}
