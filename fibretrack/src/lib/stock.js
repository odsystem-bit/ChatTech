import { getApiAuthHeaders, getApiCode } from "../models/Account";

// Utilitaires de gestion du stock de matériel d'équipe.
// Synchronisé avec le backend MySQL - partagé entre tous les techniciens.

const API_URL = import.meta.env.VITE_API_URL || "https://fibretrack.mantota.com/api/index.php";

function buildApiUrl(action) {
  const code = getApiCode();
  const [baseAction, queryStr] = action.split("?");
  const params = new URLSearchParams(queryStr || "");
  params.set("action", baseAction);
  params.set("_t", String(Date.now()));
  if (code) {
    params.set("user_code", code);
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

const CACHE_KEY = "fibretrack_stock_cache";

function getCached() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function setCached(stock) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(stock));
  } catch {}
}

const DEFAULT_DESIGNATIONS = [
  "rue", "pince", "crochets", "susp", "piton", "closer", "rp1",
  "traverse_13t", "traverse_15t", "semelle_eq",
  "poteau_sbee_non_arme", "poteau_sbee_arme",
  "ont", "pto", "repeteur_wifi", "jarretiere",
  "cpc_50", "cpc_100", "cpc_150", "cpc_200", "cpc_300", "cpc_350",
  "connecteur", "boulon", "bouchon_feuillard",
];

function normalize(name) {
  return name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

let _stockPromise = null;

/**
 * Charge le stock depuis le backend (avec cache local fallback).
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchStock() {
  if (_stockPromise) return _stockPromise;
  _stockPromise = (async () => {
    try {
      const stock = await apiGet("stock_list");
      // Ensure default designations exist
      for (const d of DEFAULT_DESIGNATIONS) {
        if (!(d in stock)) stock[d] = 0;
      }
      setCached(stock);
      return stock;
    } catch {
      const cached = getCached();
      if (Object.keys(cached).length === 0) {
        return Object.fromEntries(DEFAULT_DESIGNATIONS.map((d) => [d, 0]));
      }
      return cached;
    }
  })();
  setTimeout(() => { _stockPromise = null; }, 5000);
  return _stockPromise;
}

/**
 * Sauvegarde une désignation sur le backend.
 */
export async function saveStockItem(designation, quantite) {
  await apiPost("stock_save", { designation, quantite });
  const stock = getCached();
  stock[designation] = quantite;
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
  const res = await fetch(`${API_URL}?action=stock_movements&limit=${limit}`, { headers: getApiAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur API");
  return data;
}

export async function importStockExcel(file, mode) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const result = await apiPost("stock_import_excel", {
    file_base64: btoa(binary),
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
  if (target === "otp" || target === "otp / ont" || target === "ont / otp" || target === "box" || target === "modem") {
    return "ont";
  }
  return getDesignations().find((d) => normalize(d) === target) ?? null;
}

/**
 * Résout une désignation vers son nom canonique (existant ou nouveau).
 */
export function resolveOrCreateDesignation(nameInput) {
  const trimmed = nameInput.trim();
  const existing = findExistingDesignation(trimmed);
  return existing || trimmed;
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
