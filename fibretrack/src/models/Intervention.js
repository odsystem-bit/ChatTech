import { getApiAuthHeaders } from "./Account";

// Modèle de données "Intervention" - synchronisé avec le backend MySQL.
// Toutes les interventions sont partagées entre tous les techniciens.

const API_URL = import.meta.env.VITE_API_URL || "https://fibretrack.mantota.com/api/index.php";

async function apiPost(action, body = {}) {
  const res = await fetch(`${API_URL}?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getApiAuthHeaders() },
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

// Cache local pour fonctionnement hors-ligne
const CACHE_KEY = "fibretrack_interventions_cache";

function getCached() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
  } catch {
    return [];
  }
}

function setCached(list) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {}
}

/**
 * Liste toutes les interventions (depuis le backend, avec cache local).
 * @returns {Promise<Intervention[]>}
 */
export async function listInterventions() {
  try {
    const rows = await apiGet("interventions_list_light");
    setCached(rows);
    return rows;
  } catch {
    return getCached();
  }
}

/**
 * Sauvegarde (création ou mise à jour) une intervention sur le backend.
 * @param {Intervention} intervention
 * @returns {Promise<Intervention>}
 */
export async function saveIntervention(intervention) {
  try {
    const response = await apiPost("intervention_save", {
      ...intervention,
      expected_updated_at: intervention.updated_at || "",
    });
    if (response?.updated_at) intervention = { ...intervention, updated_at: response.updated_at };
  } catch (err) {
    console.error("saveIntervention error:", err);
    const list = getCached();
    const index = list.findIndex((i) => i.id === intervention.id);
    if (index >= 0) list[index] = intervention;
    else list.push(intervention);
    setCached(list);
    throw err;
  }
  const list = getCached();
  const index = list.findIndex((i) => i.id === intervention.id);
  if (index >= 0) list[index] = intervention;
  else list.push(intervention);
  setCached(list);
  return intervention;
}

/**
 * Récupère une intervention par ID.
 * @param {string} id
 * @returns {Promise<Intervention|null>}
 */
export async function getIntervention(id) {
  try {
    return await apiPost("intervention_get", { id });
  } catch {
    return getCached().find((i) => i.id === id) ?? null;
  }
}

export async function getInterventionLight(id) {
  return apiPost("intervention_get_light", { id });
}

/**
 * Supprime une intervention.
 * @param {string} id
 */
export async function deleteIntervention(id) {
  try {
    await apiPost("intervention_delete", { id });
  } catch (err) {
    console.error("deleteIntervention error:", err);
    throw err;
  }
  const list = getCached().filter((i) => i.id !== id);
  setCached(list);
}

export function createEmptyIntervention(technicien) {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    statut: "en_cours",
    nom_technicien: technicien ?? "",
    nom_equipe: "TELECOM BTP Services",

    nom_client: "",
    adresse_zone: "",
    telephone_ligne: "",
    mobile: "",

    etat: "PON",
    msan: "",
    fat_ref: "",
    port: "",
    ports_disponibles: "",
    port_disponible: 0,
    type_cable: "",
    depart_m: 0,
    arrivee_m: 0,
    lineaire_m: 0,
    puissance_fat_dbm: 0,
    puissance_pto_dbm: 0,
    mac: "",
    sn: "",
    nb_poteaux_traverses: 0,
    nb_poteaux_implantes: 0,
    nb_poteaux_armes: 0,

    materiel_pose: {},

    points_gps: [],

    ont_sn: "",
    pto_qte: 0,
    repeteur_wifi_qte: 0,
    emplacement_ont: "",
    client_confirme_emplacement: false,
    offre_souscrite: "Fibre Pro",
    remise_equipement_ok: false,
    appreciation_satisfaction_libre: "",

    travaux_conformes: false,
    emplacement_valide: false,
    travail_propre: false,
    service_teste: false,
    service_fonctionne: false,
    explications_donnees: false,
    recommanderait: false,
    accepte_recontact: false,
    qualite: "Satisfait",
    delais: "Satisfait",
    professionnalisme: "Satisfait",
    nom_client_declaration: "",
    remarque_libre: "",
    signature_client: "",
    signature_technicien: "",

    whatsapp_photos: [],
  };
}
