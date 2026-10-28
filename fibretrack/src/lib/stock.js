import { getApiAuthHeaders, getApiCode, getTeamId, DEFAULT_TEAM_ID } from "../models/Account";

// Utilitaires de gestion du stock de matériel d'équipe.
// Synchronisé avec le backend MySQL - isolé par équipe (team_id).

const API_URL = import.meta.env.VITE_API_URL || "https://fibretrack.mantota.com/api/index.php";

function buildApiUrl(action) {
  const code = getApiCode();
  const teamId = getTeamId();
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

async function apiPost(action, body = {}) {
  const res = await fetch(buildApiUrl(action), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getApiAuthHeaders() },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur API");
  return data;
}

async function apiGet(action) {
  const res = await fetch(buildApiUrl(action), {
    headers: getApiAuthHeaders(),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur API");
  return data;
}

function getStockCacheKey() {
  return `fibretrack_${getTeamId()}_stock_cache`;
}

function getCached() {
  try {
    const key = getStockCacheKey();
    let raw = localStorage.getItem(key);
    if (!raw && getTeamId() === DEFAULT_TEAM_ID) {
      raw = localStorage.getItem("fibretrack_stock_cache");
      if (raw) {
        try { localStorage.setItem(key, raw); } catch {}
      }
    }
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function setCached(stock) {
  try {
    const serialized = JSON.stringify(stock);
    localStorage.setItem(getStockCacheKey(), serialized);
    if (getTeamId() === DEFAULT_TEAM_ID) {
      try { localStorage.setItem("fibretrack_stock_cache", serialized); } catch {}
    }
  } catch {}
}

export const DEFAULT_DESIGNATIONS = [
  "ont",
  "pto",
  "jarretiere",
  "piton",
  "cheville",
  "connecteur",
  "closer",
  "fibre_1fo",
  "cpc_50",
  "cpc_100",
  "cpc_150",
  "cpc_200",
  "cpc_250",
  "cpc_300",
  "cpc_350",
  "crochets",
  "pince",
  "susp",
  "traverse_13t",
  "traverse_15t",
];

const CANONICAL_ALIASES = {
  "ont": "ont", "otp": "ont", "box ont": "ont", "routeur ont": "ont", "box": "ont", "modem": "ont",
  "pto": "pto", "prise pto": "pto", "pto fibre": "pto",
  "jarretiere": "jarretiere", "jar": "jarretiere", "jarretieres": "jarretiere",
  "piton": "piton", "pit": "piton", "piton d'ancrage": "piton", "pitons": "piton",
  "cheville": "cheville", "che": "cheville", "chevilles": "cheville",
  "connecteur": "connecteur", "con": "connecteur", "connecteur mecanique": "connecteur",
  "closer": "closer", "clo": "closer", "boitier closer": "closer",
  "fibre_1fo": "fibre_1fo", "1fo": "fibre_1fo", "fibre 1fo": "fibre_1fo", "cable fibre 1fo": "fibre_1fo",
  "cpc_50": "cpc_50", "cpc 50": "cpc_50", "cpc50": "cpc_50", "cpc 50m": "cpc_50",
  "cpc_100": "cpc_100", "cpc 100": "cpc_100", "cpc100": "cpc_100", "cpc 100m": "cpc_100",
  "cpc_150": "cpc_150", "cpc 150": "cpc_150", "cpc150": "cpc_150", "cpc 150m": "cpc_150",
  "cpc_200": "cpc_200", "cpc 200": "cpc_200", "cpc200": "cpc_200", "cpc 200m": "cpc_200",
  "cpc_250": "cpc_250", "cpc 250": "cpc_250", "cpc250": "cpc_250", "cpc 250m": "cpc_250",
  "cpc_300": "cpc_300", "cpc 300": "cpc_300", "cpc300": "cpc_300", "cpc 300m": "cpc_300",
  "cpc_350": "cpc_350", "cpc 350": "cpc_350", "cpc350": "cpc_350", "cpc 350m": "cpc_350",
  "crochets": "crochets", "cro": "crochets", "crochet": "crochets", "crochets d'ancrage": "crochets",
  "pince": "pince", "pinces": "pince", "pince d'ancrage": "pince",
  "susp": "susp", "sus": "susp", "suspente": "susp", "suspension": "susp",
  "traverse_13t": "traverse_13t", "ct 13": "traverse_13t", "ct13": "traverse_13t", "traverse 13t": "traverse_13t",
  "traverse_15t": "traverse_15t", "ct 15": "traverse_15t", "ct15": "traverse_15t", "traverse 15t": "traverse_15t",
};

function normalize(name) {
  return name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

let _stockPromise = null;
let _stockPromiseTeam = null;

/**
 * Charge le stock depuis le backend (avec assainissement strict des doublons/héritages).
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchStock() {
  const currentTeam = getTeamId();
  if (_stockPromise && _stockPromiseTeam === currentTeam) return _stockPromise;
  _stockPromiseTeam = currentTeam;
  _stockPromise = (async () => {
    try {
      const stock = await apiGet("stock_list");
      const sanitized = {};
      for (const d of DEFAULT_DESIGNATIONS) {
        sanitized[d] = typeof stock[d] === "number" ? stock[d] : 0;
      }
      // Ignorer les anciens éléments fictifs hérités
      const legacyIgnored = new Set(["rue", "rp1", "semelle_eq", "poteau_sbee_non_arme", "poteau_sbee_arme", "boulon", "bouchon_feuillard", "error"]);
      for (const [k, v] of Object.entries(stock)) {
        if (!DEFAULT_DESIGNATIONS.includes(k) && !legacyIgnored.has(k)) {
          sanitized[k] = v;
        }
      }
      setCached(sanitized);
      return sanitized;
    } catch {
      const cached = getCached();
      const sanitized = {};
      for (const d of DEFAULT_DESIGNATIONS) {
        sanitized[d] = typeof cached[d] === "number" ? cached[d] : 0;
      }
      return sanitized;
    }
  })();
  setTimeout(() => { _stockPromise = null; }, 5000);
  return _stockPromise;
}

/**
 * Sauvegarde une désignation sur le backend.
 */
export async function saveStockItem(designation, quantite) {
  const canon = resolveOrCreateDesignation(designation);
  await apiPost("stock_save", { designation: canon, quantite });
  const stock = getCached();
  stock[canon] = quantite;
  setCached(stock);
  _stockPromise = null;
  return stock;
}

export async function moveStockItem(designationInput, type, quantite, motif = "Mouvement manuel") {
  const designation = resolveOrCreateDesignation(designationInput);
  const amount = Number(quantite);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("La quantité doit être un entier positif.");
  await apiPost("stock_move", { designation, type, quantite: amount, motif });
  const stock = await apiGet("stock_list");
  setCached(stock);
  _stockPromise = null;
  return stock;
}

/**
 * Récupère l'historique des mouvements de stock.
 * @param {number} limit
 */
export async function fetchStockMovements(limit = 100) {
  const res = await fetch(buildApiUrl(`stock_movements?limit=${limit}`), { headers: getApiAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur API");
  return data;
}

export async function importStockExcel(file, mode) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64Str = typeof dataUrl === "string" ? dataUrl.split(",")[1] || "" : "";
      resolve(base64Str);
    };
    reader.onerror = () => reject(new Error("Erreur de lecture du fichier Excel"));
    reader.readAsDataURL(file);
  });
  const result = await apiPost("stock_import_excel", {
    file_base64: base64,
    mode,
  });
  const stock = await apiGet("stock_list");
  setCached(stock);
  _stockPromise = null;
  return { result, stock };
}

/**
 * @returns {string[]} Liste actuelle des désignations connues.
 */
export function getDesignations() {
  const stock = getCached();
  const keys = Object.keys(stock);
  if (keys.length === 0) return [...DEFAULT_DESIGNATIONS].sort();
  return keys.sort((a, b) => a.localeCompare(b));
}

/**
 * Résout une désignation saisie vers son entrée canonique existante.
 */
export function findExistingDesignation(nameInput) {
  const target = normalize(nameInput);
  if (CANONICAL_ALIASES[target]) return CANONICAL_ALIASES[target];
  return getDesignations().find((d) => normalize(d) === target) ?? null;
}

/**
 * Résout une désignation vers son nom canonique (existant ou nouveau).
 */
export function resolveOrCreateDesignation(nameInput) {
  const trimmed = nameInput.trim();
  const existing = findExistingDesignation(trimmed);
  return existing || trimmed.toLowerCase().replace(/[\s'-]+/g, "_");
}

/**
 * Incrémente le stock (réception d'un bon).
 */
export async function incrementStock(designationInput, quantite) {
  return moveStockItem(designationInput, "entree", quantite, "Réception stock");
}

/**
 * Déduit du stock (matériel posé sur une intervention).
 */
export async function decrementStock(designationInput, quantite) {
  return moveStockItem(designationInput, "sortie", quantite, "Retrait manuel");
}

/**
 * Déduit plusieurs désignations à partir des quantités posées sur une intervention.
 * Fusionne strictement OTP et ONT pour ne jamais déduire deux fois le même équipement.
 */
export async function applyInterventionToStock(materielPose) {
  const stock = getCached();
  const normalizedPose = { ...(materielPose || {}) };

  if ("otp" in normalizedPose || "ont" in normalizedPose) {
    const ontQty = Math.max(Number(normalizedPose.ont || 0), Number(normalizedPose.otp || 0));
    delete normalizedPose.otp;
    normalizedPose.ont = ontQty;
  }

  for (const [designationInput, quantite] of Object.entries(normalizedPose)) {
    if (!quantite) continue;
    const designation = resolveOrCreateDesignation(designationInput);
    const newQte = (stock[designation] ?? 0) - quantite;
    await saveStockItem(designation, newQte);
    stock[designation] = newQte;
  }
  setCached(stock);
  return stock;
}
