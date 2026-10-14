import { getApiAuthHeaders } from "./Account.js";

// Modèle de données "Intervention" - synchronisé avec le backend MySQL.
// Toutes les interventions sont partagées entre tous les techniciens.

const API_URL = import.meta.env?.VITE_API_URL || "https://fibretrack.mantota.com/api/index.php";

async function apiPost(action, body = {}, timeoutMs = 25000) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`${API_URL}?action=${action}&_t=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getApiAuthHeaders() },
      body: JSON.stringify(body),
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur API");
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function apiGet(action, timeoutMs = 20000) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const sep = action.includes("?") ? "&" : "?";
  try {
    const res = await fetch(`${API_URL}?action=${action}${sep}_t=${Date.now()}`, {
      headers: getApiAuthHeaders(),
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur API");
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}


// Cache local pour fonctionnement hors-ligne
const CACHE_KEY = "fibretrack_interventions_cache";
const INTV_STORAGE_PREFIX = "fibretrack_intv_";

export function ensureInterventionDefaults(data) {
  if (!data || typeof data !== "object") return createEmptyIntervention();
  const empty = createEmptyIntervention(data.nom_technicien || "");
  const pointsGps = Array.isArray(data.points_gps) ? data.points_gps.map((pt, idx) => {
    if (pt && pt.type === "Poteau") {
      const isTraverse = pt.traverse !== undefined ? Boolean(pt.traverse) : (pt.sous_type !== "Implanté");
      const isImplante = pt.implante !== undefined ? Boolean(pt.implante) : (pt.sous_type === "Implanté");
      const isArme = pt.arme !== undefined ? Boolean(pt.arme) : (pt.sous_type === "Armé");
      const typePoteau = pt.type_poteau || pt.proprietaire || "";
      return {
        id: pt.id || crypto.randomUUID(),
        ...pt,
        numero: Number(pt.numero || idx + 1),
        type_poteau: typePoteau,
        proprietaire: typePoteau,
        traverse: isTraverse,
        implante: isImplante,
        arme: isArme,
        sous_type: pt.sous_type || (isImplante ? "Implanté" : isArme ? "Armé" : "Traversé"),
      };
    }
    return pt;
  }) : [];

  const existingPoleNums = new Set(pointsGps.filter((p) => p && p.type === "Poteau").map((p) => Number(p.numero)));
  if (Array.isArray(data.whatsapp_photos)) {
    data.whatsapp_photos.forEach((wa) => {
      const m = wa?.slot?.match(/^poteau_(\d+)$/);
      if (m) {
        const num = Number(m[1]);
        if (!existingPoleNums.has(num)) {
          existingPoleNums.add(num);
          pointsGps.push({
            id: wa.id || crypto.randomUUID(),
            type: "Poteau",
            numero: num,
            traverse: true,
            implante: false,
            arme: false,
            type_poteau: "",
            proprietaire: "",
            sous_type: "Traversé",
            photo: wa.url || "",
            lat: wa.lat ?? null,
            lng: wa.lng ?? null,
            precision_m: wa.precision_m ?? null,
            horodatage: wa.horodatage || new Date().toISOString(),
            lieu: wa.lieu || "",
            ajoute_par: data.nom_technicien || "",
          });
        }
      }
    });
  }

  const poleItems = pointsGps.filter((p) => p && p.type === "Poteau");
  const computedTraverses = poleItems.length > 0
    ? poleItems.filter((p) => Boolean(p.traverse)).length
    : Number(data.nb_poteaux_traverses ?? 0);
  const computedImplantes = poleItems.length > 0
    ? poleItems.filter((p) => Boolean(p.implante)).length
    : Number(data.nb_poteaux_implantes ?? 0);
  const computedArmes = poleItems.length > 0
    ? poleItems.filter((p) => Boolean(p.arme)).length
    : Number(data.nb_poteaux_armes ?? 0);

  return {
    ...empty,
    ...data,
    points_gps: pointsGps,
    whatsapp_photos: Array.isArray(data.whatsapp_photos) ? data.whatsapp_photos : [],
    materiel_pose: (data.materiel_pose && typeof data.materiel_pose === "object") ? data.materiel_pose : {},
    depart_m: Number(data.depart_m ?? 0),
    arrivee_m: Number(data.arrivee_m ?? 0),
    lineaire_m: Number(data.lineaire_m ?? 0),
    puissance_fat_dbm: Number(data.puissance_fat_dbm ?? 0),
    puissance_pto_dbm: Number(data.puissance_pto_dbm ?? 0),
    nb_poteaux_traverses: computedTraverses,
    nb_poteaux_implantes: computedImplantes,
    nb_poteaux_armes: computedArmes,
    pto_qte: Number(data.pto_qte ?? 0),
    repeteur_wifi_qte: Number(data.repeteur_wifi_qte ?? 0),
    port_disponible: Number(data.port_disponible ?? 0),
    ports_disponibles: String(data.ports_disponibles ?? ""),
    mac: String(data.mac ?? ""),
    sn: String(data.sn ?? ""),
    ont_sn: String(data.ont_sn ?? data.sn ?? ""),
    updated_at: String(data.updated_at || data.modifie_le || ""),
    modifie_le: String(data.modifie_le || data.updated_at || ""),
  };
}

export function toLightIntervention(intv) {
  if (!intv || typeof intv !== "object") return intv;
  const {
    whatsapp_photos,
    points_gps,
    signature_client,
    signature_technicien,
    ...light
  } = intv;
  return light;
}

export function getCached() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
  } catch {
    return [];
  }
}

function setCached(list) {
  try {
    const cleanList = Array.isArray(list) ? list.map(toLightIntervention) : [];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cleanList));
  } catch (e) {
    console.warn("setCached localStorage error:", e);
  }
}

export function getStoredIntervention(id) {
  if (!id) return null;
  try {
    const raw = localStorage.getItem(INTV_STORAGE_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return ensureInterventionDefaults(parsed);
  } catch {
    return null;
  }
}

/**
 * Liste toutes les interventions (depuis le backend, avec cache local).
 * @returns {Promise<Intervention[]>}
 */
export async function listInterventions() {
  try {
    const rows = await apiGet("interventions_list_light");
    const currentCached = getCached();
    const merged = rows.map((row) => {
      const existing = currentCached.find((c) => c.id === row.id);
      return existing ? { ...existing, ...row } : row;
    });
    setCached(merged);
    return merged;
  } catch {
    return getCached();
  }
}

export function saveInterventionLocally(intervention) {
  if (!intervention?.id) return;
  const defaulted = ensureInterventionDefaults(intervention);
  try {
    // 1. Sauvegarde dans le stockage dédié par intervention avec protection anti-écrasement des photos
    const existing = getStoredIntervention(defaulted.id);
    if (existing) {
      const deletedPhotoIds = new Set(Array.isArray(defaulted._deleted_photo_ids) ? defaulted._deleted_photo_ids : []);
      const deletedPointIds = new Set(Array.isArray(defaulted._deleted_point_ids) ? defaulted._deleted_point_ids : []);

      if ((!defaulted.whatsapp_photos || defaulted.whatsapp_photos.length === 0) && Array.isArray(existing.whatsapp_photos) && existing.whatsapp_photos.length > 0) {
        defaulted.whatsapp_photos = existing.whatsapp_photos.filter((p) => p && !deletedPhotoIds.has(p.id) && !deletedPhotoIds.has(p.slot));
      } else if (Array.isArray(defaulted.whatsapp_photos) && Array.isArray(existing.whatsapp_photos) && existing.whatsapp_photos.length > 0) {
        const incomingIds = new Set(defaulted.whatsapp_photos.map((p) => p?.id).filter(Boolean));
        const incomingSlots = new Set(defaulted.whatsapp_photos.map((p) => p?.slot).filter(Boolean));
        const localOnly = existing.whatsapp_photos.filter((p) => {
          if (!p || !p.id) return false;
          if (deletedPhotoIds.has(p.id) || (p.slot && deletedPhotoIds.has(p.slot))) return false;
          if (incomingIds.has(p.id)) return false;
          if (p.slot && incomingSlots.has(p.slot)) return false;
          return true;
        });
        if (localOnly.length > 0) {
          defaulted.whatsapp_photos = [...defaulted.whatsapp_photos, ...localOnly];
        }
      }

      if ((!defaulted.points_gps || defaulted.points_gps.length === 0) && Array.isArray(existing.points_gps) && existing.points_gps.length > 0) {
        defaulted.points_gps = existing.points_gps.filter((p) => p && !deletedPointIds.has(p.id) && !deletedPointIds.has(p.horodatage));
      } else if (Array.isArray(defaulted.points_gps) && Array.isArray(existing.points_gps) && existing.points_gps.length > 0) {
        const incomingIds = new Set(defaulted.points_gps.map((p) => p?.id).filter(Boolean));
        const incomingPoleNums = new Set(
          defaulted.points_gps
            .filter((p) => p && p.type === "Poteau" && Number(p.numero) > 0)
            .map((p) => Number(p.numero))
        );
        const localOnly = existing.points_gps.filter((p) => {
          if (!p || !p.id) return false;
          if (deletedPointIds.has(p.id) || (p.horodatage && deletedPointIds.has(p.horodatage))) return false;
          if (incomingIds.has(p.id)) return false;
          if (p.type === "Poteau" && Number(p.numero) > 0 && incomingPoleNums.has(Number(p.numero))) {
            return false;
          }
          return true;
        });
        if (localOnly.length > 0) {
          defaulted.points_gps = [...defaulted.points_gps, ...localOnly];
        }
      }
      if (!defaulted.signature_client && existing.signature_client) {
        defaulted.signature_client = existing.signature_client;
      }
      if (!defaulted.signature_technicien && existing.signature_technicien) {
        defaulted.signature_technicien = existing.signature_technicien;
      }
      if (existing._fully_loaded) {
        defaulted._fully_loaded = true;
      }
    }

    localStorage.setItem(INTV_STORAGE_PREFIX + defaulted.id, JSON.stringify(defaulted));

    // 2. Mettre à jour la liste en cache pour la page d'accueil (en version légère sans base64)
    const list = getCached();
    const light = toLightIntervention(defaulted);
    const index = list.findIndex((i) => i.id === defaulted.id);
    if (index >= 0) list[index] = { ...list[index], ...light };
    else list.unshift(light);
    setCached(list);
  } catch (err) {
    console.warn("saveInterventionLocally error:", err);
  }
}


/**
 * Sauvegarde (création ou mise à jour) une intervention sur le backend.
 * @param {Intervention} intervention
 * @returns {Promise<Intervention>}
 */
export async function saveIntervention(intervention) {
  // 1. Sauvegarde locale instantanée à 0ms pour zéro perte et réactivité maximale
  saveInterventionLocally(intervention);

  // 2. Synchronisation en tâche de fond avec le serveur
  try {
    const response = await apiPost("intervention_save", {
      ...intervention,
      expected_updated_at: intervention.updated_at || "",
    });
    if (response?.updated_at) {
      intervention = { ...intervention, updated_at: response.updated_at };
      saveInterventionLocally(intervention);
    }
  } catch (err) {
    console.warn("saveIntervention network sync warning:", err);
    throw err;
  }
  return ensureInterventionDefaults(intervention);
}

/**
 * Récupère une intervention par ID.
 * @param {string} id
 * @returns {Promise<Intervention|null>}
 */
export async function getIntervention(id) {
  try {
    const remote = await apiPost("intervention_get", { id });
    if (remote) {
      const defaulted = ensureInterventionDefaults(remote);
      saveInterventionLocally(defaulted);
      return defaulted;
    }
  } catch (err) {
    console.warn("getIntervention remote fetch error:", err);
  }
  return getStoredIntervention(id) || null;
}

export async function getInterventionLight(id) {
  return apiPost("intervention_get_light", { id });
}

export async function checkInterventionUpdatedAt(id) {
  if (!id) return "";
  try {
    const res = await apiPost("intervention_updated_at", { id }, 8000);
    return res?.updated_at || "";
  } catch {
    return "";
  }
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
  try {
    localStorage.removeItem(INTV_STORAGE_PREFIX + id);
  } catch {}
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
