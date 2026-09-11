// Utilitaires de gestion du stock de matériel d'équipe.
// Synchronisé avec le backend MySQL - partagé entre tous les techniciens.

const API_URL = import.meta.env.VITE_API_URL || "https://fibretrack.mantota.com/api/index.php";

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
  try {
    await apiPost("stock_save", { designation, quantite });
  } catch (err) {
    console.error("saveStockItem error:", err);
  }
  const stock = getCached();
  stock[designation] = quantite;
  setCached(stock);
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
  const designation = resolveOrCreateDesignation(designationInput);
  const stock = getCached();
  const newQte = (stock[designation] ?? 0) + quantite;
  stock[designation] = newQte;
  setCached(stock);
  await saveStockItem(designation, newQte);
  return stock;
}

/**
 * Déduit du stock (matériel posé sur une intervention).
 */
export async function decrementStock(designationInput, quantite) {
  const designation = resolveOrCreateDesignation(designationInput);
  const stock = getCached();
  const newQte = (stock[designation] ?? 0) - quantite;
  stock[designation] = newQte;
  setCached(stock);
  await saveStockItem(designation, newQte);
  return stock;
}

/**
 * Déduit plusieurs désignations à partir des quantités posées sur une intervention.
 */
export async function applyInterventionToStock(materielPose) {
  const stock = getCached();
  for (const [designationInput, quantite] of Object.entries(materielPose)) {
    if (!quantite) continue;
    const designation = resolveOrCreateDesignation(designationInput);
    stock[designation] = (stock[designation] ?? 0) - quantite;
    await saveStockItem(designation, stock[designation]);
  }
  setCached(stock);
  return stock;
}
