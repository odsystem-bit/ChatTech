const API_URL = import.meta.env?.VITE_API_URL || "https://fibretrack.mantota.com/api/index.php";
export const STORAGE_KEY = "fibretrack_account";
export const CODE_STORAGE_KEY = "fibretrack_api_code";
export const TOKEN_STORAGE_KEY = "fibretrack_session_token";
export const TEAM_STORAGE_KEY = "fibretrack_team_id";
export const DEFAULT_TEAM_ID = "team_telecom_btp_001";
export const DEFAULT_TEAM_NAME = "TELECOM BTP Services";

export function migrateLegacyTeam1Storage(teamId = DEFAULT_TEAM_ID) {
  if (teamId !== DEFAULT_TEAM_ID) return;
  try {
    if (typeof localStorage === "undefined") return;
    const migrations = [
      ["fibretrack_interventions_cache", `fibretrack_${DEFAULT_TEAM_ID}_interventions_cache`],
      ["fibretrack_stock_cache", `fibretrack_${DEFAULT_TEAM_ID}_stock_cache`],
      ["fibretrack_sync_outbox", `fibretrack_${DEFAULT_TEAM_ID}_sync_outbox`],
    ];
    for (const [oldKey, newKey] of migrations) {
      const oldVal = localStorage.getItem(oldKey);
      if (oldVal && !localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, oldVal);
      }
    }
  } catch {
    // Ignore storage access errors
  }
}

export function getSessionToken() {
  try {
    if (typeof localStorage !== "undefined") {
      const tok = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (tok) return tok;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.token) return String(parsed.token);
      }
    }
  } catch {}
  return "";
}

export function getTeamId() {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.team_id) return String(parsed.team_id);
      }
      const storedTeam = localStorage.getItem(TEAM_STORAGE_KEY);
      if (storedTeam) return storedTeam;
    }
  } catch {}
  return DEFAULT_TEAM_ID;
}

export function getTeamName() {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.nom_equipe) return String(parsed.nom_equipe);
      }
    }
  } catch {}
  return DEFAULT_TEAM_NAME;
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
          if (parsed?.isAdmin || parsed?.role === "chef_equipe" || parsed?.id === "admin" || parsed?.nom === "ADMIN") {
            if (parsed?.code) return String(parsed.code);
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

export function getApiAuthHeaders(codeOverride, teamOverride) {
  const code = codeOverride || getApiCode();
  const token = getSessionToken();
  const teamId = teamOverride || getTeamId();
  const headers = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (code) {
    headers["X-User-Code"] = String(code);
  }
  if (teamId) {
    headers["X-Team-Id"] = String(teamId);
  }
  return headers;
}

export function buildApiUrl(action, authCode, teamOverride) {
  const code = authCode || getApiCode();
  const teamId = teamOverride || getTeamId();
  const [baseAction, queryStr] = action.split("?");
  const params = new URLSearchParams(queryStr || "");
  params.set("action", baseAction);
  params.set("_t", String(Date.now()));
  if (code) {
    params.set("user_code", code);
  }
  if (teamId) {
    params.set("team_id", teamId);
  }
  return `${API_URL}?${params.toString()}`;
}

async function apiPost(action, body = {}, authCode, teamOverride) {
  const url = buildApiUrl(action, authCode, teamOverride);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getApiAuthHeaders(authCode, teamOverride) },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur API");
  return data;
}

async function apiGet(action, teamOverride) {
  const url = buildApiUrl(action, undefined, teamOverride);
  const res = await fetch(url, {
    headers: getApiAuthHeaders(undefined, teamOverride),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur API");
  return data;
}

export async function fetchAccounts(teamOverride) {
  return apiGet("accounts_list", teamOverride);
}

export async function addAccount(nom, code, options = {}) {
  return apiPost("account_add", {
    nom,
    code,
    role: options.role || "technicien",
    identifiant: options.identifiant || "",
    password: options.password || "",
    telephone: options.telephone || "",
  });
}

export async function updateAccount(payload) {
  return apiPost("account_update", payload);
}

export async function deleteAccount(id) {
  return apiPost("account_delete", { id });
}

export async function validateCode(code, teamId = "") {
  try {
    return await apiPost("account_validate", { code, ...(teamId ? { team_id: teamId } : {}) }, code, teamId || undefined);
  } catch {
    return null;
  }
}

export async function loginWithCredentials(identifiant, password) {
  return apiPost("auth_login", { identifiant, password });
}

export async function registerTeam({ nom, nom_equipe, telephone, identifiant, password }) {
  return apiPost("team_register", { nom, nom_equipe, telephone, identifiant, password });
}

export async function fetchTeamInfo(teamOverride) {
  return apiGet("team_info", teamOverride);
}

export async function updateTeamInfo(payload) {
  return apiPost("team_update", payload);
}

export async function fetchAllTeams() {
  return apiGet("teams_list_all");
}

function broadcastAuthChange(account) {
  if (typeof window === "undefined") return;
  try {
    window.postMessage(
      {
        type: "FIBRETRACK_AUTH_CHANGED",
        account: account
          ? {
              id: account.id,
              nom: account.nom,
              code: account.code || "",
              token: account.token || "",
              role: account.role || (account.isAdmin ? "chef_equipe" : "technicien"),
              isAdmin: Boolean(account.isAdmin),
              team_id: account.team_id || DEFAULT_TEAM_ID,
              nom_equipe: account.nom_equipe || DEFAULT_TEAM_NAME,
            }
          : null,
        timestamp: Date.now(),
      },
      "*"
    );
  } catch {}
}

export function setCurrentAccount(account) {
  if (!account) return;
  const role = account.role || (account.isAdmin || account.id === "admin" || account.nom === "ADMIN" ? "chef_equipe" : "technicien");
  const isAdmin = Boolean(account.isAdmin || role === "chef_equipe" || role === "super_admin" || account.id === "admin" || account.nom === "ADMIN");
  const code = account.code || (account.id === "admin" ? "9999" : "");
  const team_id = account.team_id || DEFAULT_TEAM_ID;
  const nom_equipe = account.nom_equipe || DEFAULT_TEAM_NAME;
  const token = account.token || "";

  const normalized = {
    ...account,
    role,
    isAdmin,
    team_id,
    nom_equipe,
    ...(code ? { code: String(code) } : {}),
    ...(token ? { token: String(token) } : {}),
  };

  try {
    migrateLegacyTeam1Storage(team_id);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      localStorage.setItem(TEAM_STORAGE_KEY, team_id);
      if (code) {
        localStorage.setItem(CODE_STORAGE_KEY, String(code));
      } else {
        localStorage.removeItem(CODE_STORAGE_KEY);
      }
      if (token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, String(token));
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
    if (typeof sessionStorage !== "undefined") {
      if (code) sessionStorage.setItem(CODE_STORAGE_KEY, String(code));
      else sessionStorage.removeItem(CODE_STORAGE_KEY);
    }
    broadcastAuthChange(normalized);
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
    const role = account.role || (account.isAdmin || account.id === "admin" || account.nom === "ADMIN" ? "chef_equipe" : "technicien");
    const isAdmin = Boolean(account.isAdmin || role === "chef_equipe" || role === "super_admin" || account.id === "admin" || account.nom === "ADMIN");
    let code = getApiCode() || account.code || "";
    const token = account.token || getSessionToken() || "";
    if (!code && !token && isAdmin) {
      code = "9999";
      localStorage.setItem(CODE_STORAGE_KEY, "9999");
    }
    if (!code && !token) return null;
    const team_id = account.team_id || DEFAULT_TEAM_ID;
    const nom_equipe = account.nom_equipe || DEFAULT_TEAM_NAME;
    migrateLegacyTeam1Storage(team_id);
    return {
      ...account,
      role,
      isAdmin,
      code,
      token,
      team_id,
      nom_equipe,
    };
  } catch {
    return null;
  }
}

export function clearCurrentAccount() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CODE_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TEAM_STORAGE_KEY);
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(CODE_STORAGE_KEY);
    }
    broadcastAuthChange(null);
  } catch (err) {
    console.error("Erreur déconnexion:", err);
  }
}
