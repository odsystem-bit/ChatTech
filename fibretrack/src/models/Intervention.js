import { getApiAuthHeaders, getApiCode, getTeamId, getTeamName, DEFAULT_TEAM_ID } from "./Account.js";
import { calculateMaterials } from "../lib/materialsCalculation.js";

// Modèle de données "Intervention" - synchronisé avec le backend MySQL.
// Isolé par équipe (team_id).

const API_URL = import.meta.env?.VITE_API_URL || "https://fibretrack.mantota.com/api/index.php";

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

async function apiPost(action, body = {}, timeoutMs = 45000) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const url = buildApiUrl(action);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getApiAuthHeaders() },
      body: JSON.stringify(body),
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) {
      if (res.status === 403 || res.status >= 500) {
        throw new Error(`Réseau/Serveur temporairement indisponible (HTTP ${res.status}). Sauvegarde locale active.`);
      }
      try {
        const errData = await res.json();
        throw new Error(errData?.error || `Erreur API (${res.status})`);
      } catch (jsonErr) {
        throw new Error(`Erreur API (${res.status})`);
      }
    }
    const data = await res.json();
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function apiGet(action, timeoutMs = 20000) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const url = buildApiUrl(action);
  try {
    const res = await fetch(url, {
      headers: getApiAuthHeaders(),
      cache: "no-store",
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) {
      if (res.status === 403 || res.status >= 500) {
        throw new Error(`Réseau/Serveur temporairement indisponible (HTTP ${res.status}). Sauvegarde locale active.`);
      }
      try {
        const errData = await res.json();
        throw new Error(errData?.error || `Erreur API (${res.status})`);
      } catch (jsonErr) {
        throw new Error(`Erreur API (${res.status})`);
      }
    }
    const data = await res.json();
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getOutboxKey() {
  return `fibretrack_${getTeamId()}_sync_outbox`;
}

function getCacheKey() {
  return `fibretrack_${getTeamId()}_interventions_cache`;
}

function getIntvStoragePrefix() {
  return `fibretrack_${getTeamId()}_intv_`;
}

function evictOldStoredInterventions(keepId = "") {
  try {
    if (typeof localStorage === "undefined" || typeof localStorage.key !== "function") return;
    const prefix = getIntvStoragePrefix();
    const outboxIds = new Set(getSyncOutbox().map((item) => item?.id).filter(Boolean));
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(prefix) || k.startsWith("fibretrack_intv_") || k.startsWith("chaptech_intv_"))) {
        const id = k.replace(new RegExp(`^(${prefix}|fibretrack_intv_|chaptech_intv_)`), "");
        if (id !== keepId && !outboxIds.has(id)) {
          keysToRemove.push(k);
        }
      }
    }
    for (const k of keysToRemove) {
      try { localStorage.removeItem(k); } catch {}
    }
  } catch {}
}

// ===== GESTION DE LA FILE D'ATTENTE OUTBOX HORS-LIGNE =====
const outboxListeners = new Set();

export function getSyncOutbox() {
  try {
    const key = getOutboxKey();
    let raw = localStorage.getItem(key);
    if (!raw && getTeamId() === DEFAULT_TEAM_ID) {
      raw = localStorage.getItem("fibretrack_sync_outbox");
      if (raw) {
        try { localStorage.setItem(key, raw); } catch {}
      }
    }
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

function notifyOutboxChange(count) {
  for (const cb of outboxListeners) {
    try { cb(count); } catch {}
  }
}

export function onOutboxChange(callback) {
  outboxListeners.add(callback);
  return () => outboxListeners.delete(callback);
}

export function setSyncOutbox(queue) {
  const key = getOutboxKey();
  try {
    localStorage.setItem(key, JSON.stringify(queue));
    if (getTeamId() === DEFAULT_TEAM_ID) {
      try { localStorage.setItem("fibretrack_sync_outbox", JSON.stringify(queue)); } catch {}
    }
    notifyOutboxChange(queue.length);
  } catch (e) {
    evictOldStoredInterventions();
    try {
      localStorage.setItem(key, JSON.stringify(queue));
      notifyOutboxChange(queue.length);
    } catch (e2) {
      console.warn("setSyncOutbox error:", e2);
    }
  }
}

export function addToOutbox(intervention) {
  if (!intervention?.id) return;
  const queue = getSyncOutbox();
  const existingIdx = queue.findIndex((item) => item.id === intervention.id);
  const cleanIntv = ensureInterventionDefaults(intervention);
  const item = {
    id: intervention.id,
    intervention: cleanIntv,
    timestamp: Date.now(),
    attempts: (existingIdx >= 0 ? queue[existingIdx].attempts : 0) + 1,
  };
  if (existingIdx >= 0) {
    queue[existingIdx] = item;
  } else {
    queue.push(item);
  }
  setSyncOutbox(queue);
}

export function removeFromOutbox(id) {
  const queue = getSyncOutbox().filter((item) => item.id !== id);
  setSyncOutbox(queue);
}

let isFlushingOutbox = false;
export async function flushSyncOutbox() {
  if (isFlushingOutbox) return;
  const queue = getSyncOutbox();
  if (queue.length === 0) return;
  isFlushingOutbox = true;
  try {
    for (const item of [...queue]) {
      try {
        const res = await apiPost("intervention_save", {
          ...item.intervention,
          expected_updated_at: item.intervention.updated_at || "",
        }, 45000);
        if (res) {
          const updatedIntv = {
            ...item.intervention,
            ...(res.updated_at ? { updated_at: res.updated_at, modifie_le: res.updated_at } : {}),
            ...(Array.isArray(res.whatsapp_photos) ? { whatsapp_photos: res.whatsapp_photos } : {}),
            ...(Array.isArray(res.points_gps) ? { points_gps: res.points_gps } : {}),
            ...(Array.isArray(res.videos_terrain) ? { videos_terrain: res.videos_terrain } : {}),
            _fully_loaded: true,
          };
          saveInterventionLocally(updatedIntv);
        }
        removeFromOutbox(item.id);
      } catch (err) {
        console.warn(`Outbox item ${item.id} sync attempt failed:`, err.message);
        break; // Arrêt pour retry au prochain cycle si le réseau est coupé
      }
    }
  } finally {
    isFlushingOutbox = false;
  }
}

export function ensureInterventionDefaults(data) {
  if (!data || typeof data !== "object") return createEmptyIntervention();
  const empty = createEmptyIntervention(data.nom_technicien || "");
  const rawPoints = Array.isArray(data.points_gps) ? data.points_gps.map((pt, idx) => {
    if (pt && pt.type === "Poteau") {
      let typePoteau = (pt.type_poteau || pt.proprietaire || "").trim();
      if (/petit[\s_-]*jean|pj/i.test(typePoteau)) typePoteau = "Petit Jean";
      else if (/sbee/i.test(typePoteau)) typePoteau = "SBEE";
      const isSbee = typePoteau === "SBEE";

      const isTraverse = pt.traverse !== undefined ? Boolean(pt.traverse) : (pt.sous_type !== "Implanté");
      const isImplante = pt.implante !== undefined ? Boolean(pt.implante) : (pt.sous_type === "Implanté");
      const isArme = isSbee && (pt.arme !== undefined ? Boolean(pt.arme) : (pt.sous_type === "Armé"));
      const isFat = Boolean(pt.is_poteau_fat || String(pt.sous_type || "").toLowerCase().includes("fat"));

      const labels = [];
      if (isFat) labels.push("FAT");
      if (isTraverse) labels.push("Traversé");
      if (isImplante) labels.push("Implanté");
      if (isArme) labels.push("Armé");
      const sousType = pt.sous_type || labels.join(" + ") || "Traversé";

      return {
        id: pt.id || crypto.randomUUID(),
        ...pt,
        numero: Number(pt.numero || idx + 1),
        type_poteau: typePoteau,
        proprietaire: typePoteau,
        traverse: isTraverse,
        implante: isImplante,
        arme: isArme,
        is_poteau_fat: isFat,
        sous_type: sousType,
      };
    }
    return pt;
  }) : [];

  // Dédupliquer strictement pointsGps par type, catégorie et coordonnées
  const pointsGps = [];
  const rawPolesList = [];
  let fatPoint = null;
  let abonnePoint = null;

  for (const pt of rawPoints) {
    if (!pt) continue;
    const typeUpper = String(pt.type || "").trim().toUpperCase();
    if (typeUpper === "POTEAU") {
      rawPolesList.push(pt);
    } else if (typeUpper === "FAT") {
      if (!fatPoint) {
        fatPoint = pt;
      } else {
        fatPoint = {
          ...fatPoint,
          photo: fatPoint.photo || pt.photo || "",
          lat: fatPoint.lat ?? pt.lat ?? null,
          lng: fatPoint.lng ?? pt.lng ?? null,
          precision_m: fatPoint.precision_m ?? pt.precision_m ?? null,
          lieu: fatPoint.lieu || pt.lieu || "",
        };
      }
    } else if (["ABONNÉ", "ABONNE", "CLIENT"].includes(typeUpper)) {
      if (!abonnePoint) {
        abonnePoint = pt;
      } else {
        abonnePoint = {
          ...abonnePoint,
          photo: abonnePoint.photo || pt.photo || "",
          lat: abonnePoint.lat ?? pt.lat ?? null,
          lng: abonnePoint.lng ?? pt.lng ?? null,
          precision_m: abonnePoint.precision_m ?? pt.precision_m ?? null,
          lieu: abonnePoint.lieu || pt.lieu || "",
        };
      }
    } else {
      pointsGps.push(pt);
    }
  }

  const deduplicatedPoles = [];
  rawPolesList.forEach((p, idx) => {
    const rawNum = Number(p.numero);
    const num = rawNum > 0 ? rawNum : idx + 1;
    const candidate = { ...p, numero: num };
    const existingIdx = deduplicatedPoles.findIndex((ex) => {
      if (ex.id && candidate.id) {
        return ex.id === candidate.id;
      }
      const numEx = Number(ex._rawNumero ?? ex.numero);
      const numCand = rawNum;
      if (numEx > 0 && numCand > 0) {
        return numEx === numCand;
      }
      if (numEx > 0 || numCand > 0) {
        return false;
      }
      const latA = ex.lat ?? ex.latitude;
      const lngA = ex.lng ?? ex.longitude;
      const latB = candidate.lat ?? candidate.latitude;
      const lngB = candidate.lng ?? candidate.longitude;
      if (latA != null && lngA != null && latB != null && lngB != null) {
        if (Math.abs(latA - latB) < 0.00001 && Math.abs(lngA - lngB) < 0.00001) return true;
      }
      return false;
    });

    if (existingIdx === -1) {
      deduplicatedPoles.push({ ...candidate, _rawNumero: rawNum });
    } else {
      const existing = deduplicatedPoles[existingIdx];
      const normType = (/petit[\s_-]*jean|pj/i.test(candidate.type_poteau || candidate.proprietaire || existing.type_poteau || existing.proprietaire || "")) ? "Petit Jean" : (/sbee/i.test(candidate.type_poteau || candidate.proprietaire || existing.type_poteau || existing.proprietaire || "")) ? "SBEE" : (candidate.type_poteau || candidate.proprietaire || existing.type_poteau || existing.proprietaire || "");
      const isSbee = normType === "SBEE";
      deduplicatedPoles[existingIdx] = {
        ...existing,
        ...candidate,
        type_poteau: normType,
        proprietaire: normType,
        photo: existing.photo || candidate.photo || "",
        lat: existing.lat ?? candidate.lat ?? null,
        lng: existing.lng ?? candidate.lng ?? null,
        precision_m: existing.precision_m ?? candidate.precision_m ?? null,
        traverse: existing.traverse !== undefined ? Boolean(existing.traverse) : Boolean(candidate.traverse),
        implante: existing.implante !== undefined ? Boolean(existing.implante) : Boolean(candidate.implante),
        arme: isSbee ? (existing.arme !== undefined ? Boolean(existing.arme) : Boolean(candidate.arme)) : false,
        lieu: existing.lieu || candidate.lieu || "",
        numero: existing.numero || candidate.numero || num,
      };
    }
  });

  if (fatPoint) pointsGps.unshift(fatPoint);
  deduplicatedPoles.sort((a, b) => Number(a.numero) - Number(b.numero));
  deduplicatedPoles.forEach((p) => {
    delete p._rawNumero;
    pointsGps.push(p);
  });
  if (abonnePoint) pointsGps.push(abonnePoint);

  const existingPoleNums = new Set(deduplicatedPoles.map((p) => Number(p.numero)));
  if (Array.isArray(data.whatsapp_photos)) {
    data.whatsapp_photos.forEach((wa) => {
      const m = wa?.slot?.match(/^poteau_(\d+)$/);
      if (m) {
        const num = Number(m[1]);
        const existingPole = pointsGps.find((p) => p && p.type === "Poteau" && Number(p.numero) === num);
        if (existingPole) {
          if (!existingPole.photo && wa.url) existingPole.photo = wa.url;
          if (existingPole.lat == null && wa.lat != null) existingPole.lat = wa.lat;
          if (existingPole.lng == null && wa.lng != null) existingPole.lng = wa.lng;
        } else if (!existingPoleNums.has(num)) {
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

    const hasFat = pointsGps.some((p) => p && String(p.type || "").trim().toUpperCase() === "FAT");
    const hasAbonne = pointsGps.some((p) => p && ["abonné", "abonne", "client"].includes(String(p.type || "").trim().toLowerCase()));

    if (!hasFat) {
      const fatWa = data.whatsapp_photos.find((p) => p && (p.slot === "fat" || p.type === "fat") && p.lat != null && p.lng != null);
      if (fatWa) {
        pointsGps.unshift({
          id: fatWa.id || crypto.randomUUID(),
          type: "FAT",
          photo: fatWa.url || "",
          lat: fatWa.lat,
          lng: fatWa.lng,
          precision_m: fatWa.precision_m ?? null,
          horodatage: fatWa.horodatage || new Date().toISOString(),
          lieu: fatWa.lieu || "",
          ajoute_par: data.nom_technicien || "",
        });
      }
    }

    if (!hasAbonne) {
      const abonneWa = data.whatsapp_photos.find((p) => p && (p.slot === "ont_sn" || p.slot === "cable_interne" || p.slot === "mesure_pto") && p.lat != null && p.lng != null);
      if (abonneWa) {
        pointsGps.push({
          id: abonneWa.id || crypto.randomUUID(),
          type: "Abonné",
          photo: abonneWa.url || "",
          lat: abonneWa.lat,
          lng: abonneWa.lng,
          precision_m: abonneWa.precision_m ?? null,
          horodatage: abonneWa.horodatage || new Date().toISOString(),
          lieu: abonneWa.lieu || "",
          ajoute_par: data.nom_technicien || "",
        });
      }
    }
  }

  const poleItems = pointsGps.filter((p) => p && p.type === "Poteau");
  const computedTraverses = poleItems.length > 0
    ? poleItems.filter((p) => Boolean(p.traverse)).length
    : Number(data.nb_poteaux_traverses ?? 0);
  const computedImplantes = poleItems.length > 0
    ? poleItems.filter((p) => Boolean(p.implante)).length
    : Number(data.nb_poteaux_implantes ?? 0);
  const computedArmes = poleItems.length > 0
    ? poleItems.filter((p) => Boolean(p.arme) && /sbee/i.test(p.type_poteau || p.proprietaire || "")).length
    : Number(data.nb_poteaux_armes ?? 0);

  // Initialisation des matériaux par défaut (Piton: 1, PTO: 1, ONT: 1, Crochets calculés à l'insertion des poteaux)
  const rawMp = (data.materiel_pose && typeof data.materiel_pose === "object") ? { ...data.materiel_pose } : {};

  // Piton : 1 obligatoire par client
  if (rawMp.piton === undefined || rawMp.piton === null || rawMp.piton === "") {
    rawMp.piton = 1;
  } else {
    rawMp.piton = Number(rawMp.piton);
  }

  // Cheville : 1 par défaut par client (utilisée lors de la pose du piton, modifiable à 0 en cas exceptionnel)
  if (rawMp.cheville === undefined || rawMp.cheville === null || rawMp.cheville === "") {
    rawMp.cheville = 1;
  } else {
    rawMp.cheville = Number(rawMp.cheville);
  }

  // PTO : 1 par défaut
  if (rawMp.pto === undefined || rawMp.pto === null || rawMp.pto === "") {
    rawMp.pto = (data.pto_qte !== undefined && data.pto_qte !== null && data.pto_qte !== "") ? Number(data.pto_qte) : 1;
  } else {
    rawMp.pto = Number(rawMp.pto);
  }

  // ONT : 1 par défaut pour chaque client (aucun OTP, pas de doublon)
  const baseOnt = (rawMp.ont !== undefined && rawMp.ont !== null && rawMp.ont !== "")
    ? Number(rawMp.ont)
    : ((rawMp.otp !== undefined && rawMp.otp !== null && rawMp.otp !== "")
      ? Number(rawMp.otp)
      : (data.ont_qte !== undefined && data.ont_qte !== null && data.ont_qte !== "" ? Number(data.ont_qte) : 1));

  rawMp.ont = baseOnt;
  delete rawMp.otp; // Nettoyage strict : aucun OTP dans materiel_pose

  const calc = calculateMaterials({ ...data, points_gps: pointsGps, materiel_pose: rawMp });
  const isCrochetsManual = Boolean(data._crochets_manual || data._crochets_manuelle);

  if (!isCrochetsManual) {
    rawMp.crochets = calc.crochets;
  } else if (rawMp.crochets !== undefined && rawMp.crochets !== null && rawMp.crochets !== "") {
    rawMp.crochets = Number(rawMp.crochets);
  } else {
    rawMp.crochets = calc.crochets;
  }

  return {
    ...empty,
    ...data,
    points_gps: pointsGps,
    whatsapp_photos: Array.isArray(data.whatsapp_photos) ? data.whatsapp_photos : [],
    materiel_pose: rawMp,
    depart_m: Number(data.depart_m ?? 0),
    arrivee_m: Number(data.arrivee_m ?? 0),
    lineaire_m: Number(data.lineaire_m ?? 0),
    puissance_fat_dbm: (data.puissance_fat_dbm !== undefined && data.puissance_fat_dbm !== null && data.puissance_fat_dbm !== "") ? (parseFloat(String(data.puissance_fat_dbm).replace(",", ".")) || 0) : 0,
    puissance_pto_dbm: (data.puissance_pto_dbm !== undefined && data.puissance_pto_dbm !== null && data.puissance_pto_dbm !== "") ? (parseFloat(String(data.puissance_pto_dbm).replace(",", ".")) || 0) : 0,
    debit_descendant: String(data.debit_descendant ?? data.debit_download ?? ""),
    debit_montant: String(data.debit_montant ?? data.debit_upload ?? ""),
    debit_ping: String(data.debit_ping ?? data.ping ?? ""),
    nb_poteaux_traverses: computedTraverses,
    nb_poteaux_implantes: computedImplantes,
    nb_poteaux_armes: computedArmes,
    pto_qte: Number(data.pto_qte !== undefined && data.pto_qte !== null ? data.pto_qte : rawMp.pto),
    ont_qte: Number(data.ont_qte !== undefined && data.ont_qte !== null ? data.ont_qte : rawMp.ont),
    _crochets_manual: isCrochetsManual,
    latitude_fat: data.latitude_fat ?? (pointsGps.find((p) => p && String(p.type || "").toUpperCase() === "FAT")?.lat ?? ""),
    longitude_fat: data.longitude_fat ?? (pointsGps.find((p) => p && String(p.type || "").toUpperCase() === "FAT")?.lng ?? ""),
    latitude: data.latitude ?? (pointsGps.find((p) => p && ["abonné", "abonne", "client"].includes(String(p.type || "").toLowerCase()))?.lat ?? ""),
    longitude: data.longitude ?? (pointsGps.find((p) => p && ["abonné", "abonne", "client"].includes(String(p.type || "").toLowerCase()))?.lng ?? ""),
    repeteur_wifi_qte: Number(data.repeteur_wifi_qte ?? 0),
    port_disponible: Number(data.port_disponible ?? 0),
    ports_disponibles: String(data.ports_disponibles ?? ""),
    mac: String(data.mac ?? ""),
    sn: String(data.sn ?? ""),
    ont_sn: String(data.ont_sn ?? data.sn ?? ""),
    nom_client: String(data.nom_client || data.nom_dossier || ""),
    nom_dossier: String(data.nom_dossier || data.nom_client || ""),
    updated_at: String(data.updated_at || data.modifie_le || ""),
    modifie_le: String(data.modifie_le || data.updated_at || ""),
    type_intervention_satisfaction: data.type_intervention_satisfaction || "Installation",
    remarque_aucune: data.remarque_aucune !== undefined ? Boolean(data.remarque_aucune) : (!data.remarque_libre),
    remarque_libre: String(data.remarque_libre ?? ""),
    videos_terrain: Array.isArray(data.videos_terrain) ? data.videos_terrain : [],
    client_gps_recu: Boolean(data.client_gps_recu),
    client_repere: String(data.client_repere ?? ""),
    tournee_du_jour: String(data.tournee_du_jour || ""),
    tournee_ordre: Number(data.tournee_ordre || 0),
    tournee_verrouille: Boolean(data.tournee_verrouille),
    motif_non_traite: String(data.motif_non_traite || ""),
  };
}

export function toLightIntervention(intv) {
  if (!intv || typeof intv !== "object") return intv;
  const {
    whatsapp_photos,
    signature_client,
    signature_technicien,
    videos_terrain,
    ...light
  } = intv;

  // Conserver les points GPS sans photos base64 lourdes pour la cartographie instantanée
  if (Array.isArray(intv.points_gps)) {
    light.points_gps = intv.points_gps.map((pt) => {
      if (!pt) return pt;
      const { photo, photo_base64, ...cleanPt } = pt;
      return cleanPt;
    });
  } else {
    light.points_gps = [];
  }

  // Conserver les vidéos terrain dans l'objet léger en allégeant seulement les data: URLs base64 lourdes
  if (Array.isArray(videos_terrain)) {
    light.videos_terrain = videos_terrain.map((v) => {
      if (!v) return v;
      const thumb = (v.thumbnail_url && !v.thumbnail_url.startsWith("data:image")) ? v.thumbnail_url : "";
      return { ...v, thumbnail_url: thumb };
    });
  } else {
    light.videos_terrain = [];
  }

  return light;
}

export function getCached() {
  try {
    const key = getCacheKey();
    let raw = localStorage.getItem(key);
    if (!raw && getTeamId() === DEFAULT_TEAM_ID) {
      raw = localStorage.getItem("fibretrack_interventions_cache");
      if (raw) {
        try { localStorage.setItem(key, raw); } catch {}
      }
    }
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

function setCached(list) {
  try {
    const cleanList = Array.isArray(list) ? list.map(toLightIntervention) : [];
    const serialized = JSON.stringify(cleanList);
    localStorage.setItem(getCacheKey(), serialized);
    if (getTeamId() === DEFAULT_TEAM_ID) {
      try { localStorage.setItem("fibretrack_interventions_cache", serialized); } catch {}
    }
  } catch (e) {
    console.warn("setCached localStorage error:", e);
  }
}

export function getStoredIntervention(id) {
  if (!id) return null;
  try {
    const key = getIntvStoragePrefix() + id;
    let raw = localStorage.getItem(key);
    if (!raw && getTeamId() === DEFAULT_TEAM_ID) {
      raw = localStorage.getItem("fibretrack_intv_" + id);
      if (raw) {
        try { localStorage.setItem(key, raw); } catch {}
      }
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return ensureInterventionDefaults(parsed);
  } catch {
    return null;
  }
}

export function toNormalizedTimestamp(d) {
  if (!d) return 0;
  if (typeof d === "number") return d;
  const s = String(d).trim();
  if (!s) return 0;
  const isoLike = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const ms = Date.parse(isoLike);
  return isNaN(ms) ? (Date.parse(s) || 0) : ms;
}

/**
 * Liste toutes les interventions (depuis le backend, avec cache local).
 * @returns {Promise<Intervention[]>}
 */
export async function listInterventions() {
  flushSyncOutbox().catch(() => {});

  try {
    const rows = await apiGet("interventions_list_light");
    let deletedIds = [];
    try {
      deletedIds = await apiGet("deleted_interventions_list", 6000);
    } catch {}
    const deletedSet = new Set(Array.isArray(deletedIds) ? deletedIds : []);

    // Purger immédiatement les interventions supprimées du stockage local et de l'outbox
    const prefix = getIntvStoragePrefix();
    for (const dId of deletedSet) {
      removeFromOutbox(dId);
      try {
        localStorage.removeItem(prefix + dId);
        if (getTeamId() === DEFAULT_TEAM_ID) localStorage.removeItem("fibretrack_intv_" + dId);
      } catch {}
    }

    const currentCached = getCached().filter((c) => c?.id && !deletedSet.has(c.id));
    const serverMap = new Map();
    const outboxQueue = getSyncOutbox();
    const outboxIds = new Set(outboxQueue.map((item) => item.id));

    const merged = rows.filter((r) => !deletedSet.has(r.id)).map((row) => {
      serverMap.set(row.id, true);
      const existing = currentCached.find((c) => c.id === row.id);
      if (existing) {
        const localTime = toNormalizedTimestamp(existing.updated_at || existing.modifie_le);
        const serverTime = toNormalizedTimestamp(row.updated_at || row.modifie_le);
        if (localTime > serverTime && outboxIds.has(row.id)) {
          return { ...row, ...existing };
        }
        // Préserver le nom du client local si le serveur renvoie une chaîne vide
        const fallbackClient = (!row.nom_client && existing.nom_client) ? existing.nom_client : (row.nom_client || "");
        const fallbackDossier = (!row.nom_dossier && existing.nom_dossier) ? existing.nom_dossier : (row.nom_dossier || fallbackClient);
        return {
          ...existing,
          ...row,
          nom_client: fallbackClient || fallbackDossier,
          nom_dossier: fallbackDossier || fallbackClient,
          updated_at: row.updated_at || row.modifie_le || existing.updated_at || "",
        };
      }
      return {
        ...row,
        nom_dossier: row.nom_dossier || row.nom_client || "",
        nom_client: row.nom_client || row.nom_dossier || "",
      };
    });

    // Sauvegarde anti-perte STRICTE :
    // Ne préserver que les interventions locales qui sont RÉELLEMENT en attente de synchronisation dans l'outbox (créations hors-ligne).
    // Si une intervention en cache n'est plus sur le serveur ET n'est pas dans l'outbox, ELLE A ÉTÉ SUPPRIMÉE SUR LE SERVEUR !
    // Elle ne doit JAMAIS être réinjectée ni ressuscitée sur les appareils.
    for (const cached of currentCached) {
      if (cached?.id && !serverMap.has(cached.id)) {
        if (outboxIds.has(cached.id)) {
          merged.unshift(cached);
        } else {
          // Supprimée sur le serveur -> purger le cache local de l'appareil
          try {
            localStorage.removeItem(prefix + cached.id);
            if (getTeamId() === DEFAULT_TEAM_ID) localStorage.removeItem("fibretrack_intv_" + cached.id);
          } catch {}
        }
      }
    }

    setCached(merged);
    return merged;
  } catch (err) {
    console.warn("listInterventions offline / fallback cache:", err);
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
      const deletedVideoIds = new Set(
        (Array.isArray(defaulted._deleted_video_ids) ? defaulted._deleted_video_ids : []).concat(
          Array.isArray(defaulted.deleted_videos) ? defaulted.deleted_videos : []
        ).map(String)
      );

      const isFullyLoaded = Boolean(defaulted._fully_loaded);

      if (isFullyLoaded) {
        // Mode plein : l'intervention est ouverte dans le formulaire avec sa liste de photos à jour.
        // La liste passée est la source de vérité : on purge les photos/points/vidéos supprimés sans jamais les ressusciter.
        defaulted.whatsapp_photos = (defaulted.whatsapp_photos || []).filter((p) => {
          if (!p) return false;
          if (p.id && deletedPhotoIds.has(p.id)) return false;
          const isMulti = !p.slot || p.additionnelle || p.is_additionnelle || p.slot === "additionnelle" || String(p.slot).startsWith("additionnelle_") || p.slot === "autre_poteau" || String(p.slot).startsWith("autre_poteau");
          if (!isMulti) {
            if (p.slot && (deletedPhotoIds.has(p.slot) || deletedPhotoIds.has(`slot_${p.slot}`))) return false;
            if (p.type && (deletedPhotoIds.has(p.type) || deletedPhotoIds.has(`slot_${p.type}`))) return false;
          }
          return true;
        });

        defaulted.points_gps = (defaulted.points_gps || []).filter((p) => {
          if (!p) return false;
          if (p.id && deletedPointIds.has(p.id)) return false;
          if (p.horodatage && deletedPointIds.has(p.horodatage)) return false;
          return true;
        });

        defaulted.videos_terrain = (defaulted.videos_terrain || []).filter((v) => {
          if (!v || !v.id) return false;
          if (deletedVideoIds.has(String(v.id))) return false;
          return true;
        });
      } else {
        // Mode partiel / objet light (ex: mise à jour du statut depuis la liste sans photos en mémoire) :
        // protéger les photos et points existants contre un écrasement accidentel.
        if ((!defaulted.whatsapp_photos || defaulted.whatsapp_photos.length === 0) && Array.isArray(existing.whatsapp_photos) && existing.whatsapp_photos.length > 0) {
          defaulted.whatsapp_photos = existing.whatsapp_photos.filter((p) => p && !deletedPhotoIds.has(p.id) && !deletedPhotoIds.has(p.slot));
        } else if (Array.isArray(defaulted.whatsapp_photos) && Array.isArray(existing.whatsapp_photos) && existing.whatsapp_photos.length > 0) {
          const incomingIds = new Set(defaulted.whatsapp_photos.map((p) => p?.id).filter(Boolean));
          const incomingSingleSlots = new Set(
            defaulted.whatsapp_photos
              .filter((p) => p && !p.additionnelle && !p.is_additionnelle && p.slot !== "additionnelle" && !String(p.slot).startsWith("additionnelle_") && p.slot !== "autre_poteau" && !String(p.slot).startsWith("autre_poteau"))
              .map((p) => p?.slot)
              .filter(Boolean)
          );
          const localOnly = existing.whatsapp_photos.filter((p) => {
            if (!p || !p.id) return false;
            if (deletedPhotoIds.has(p.id)) return false;
            const isMulti = !p.slot || p.additionnelle || p.is_additionnelle || p.slot === "additionnelle" || String(p.slot).startsWith("additionnelle_") || p.slot === "autre_poteau" || String(p.slot).startsWith("autre_poteau");
            if (!isMulti && p.slot && deletedPhotoIds.has(p.slot)) return false;
            if (incomingIds.has(p.id)) return false;
            if (!isMulti && p.slot && incomingSingleSlots.has(p.slot)) return false;
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

        // Protéger les vidéos terrain existantes contre un écrasement accidentel lors d'une mise à jour partielle
        if ((!defaulted.videos_terrain || defaulted.videos_terrain.length === 0) && Array.isArray(existing.videos_terrain) && existing.videos_terrain.length > 0) {
          defaulted.videos_terrain = existing.videos_terrain.filter((v) => v && v.id && !deletedVideoIds.has(String(v.id)));
        } else if (Array.isArray(defaulted.videos_terrain) && Array.isArray(existing.videos_terrain) && existing.videos_terrain.length > 0) {
          const incomingIds = new Set(defaulted.videos_terrain.map((v) => String(v?.id)).filter(Boolean));
          const localOnly = existing.videos_terrain.filter((v) => v && v.id && !incomingIds.has(String(v.id)) && !deletedVideoIds.has(String(v.id)));
          if (localOnly.length > 0) {
            defaulted.videos_terrain = [...defaulted.videos_terrain, ...localOnly];
          }
        }
      }

      if (!defaulted.signature_client && existing.signature_client) {
        defaulted.signature_client = existing.signature_client;
      }
      if (!defaulted.signature_technicien && existing.signature_technicien) {
        defaulted.signature_technicien = existing.signature_technicien;
      }
      if (existing._fully_loaded && defaulted._fully_loaded === undefined) {
        defaulted._fully_loaded = true;
      }
    }

    const storageKey = getIntvStoragePrefix() + defaulted.id;
    const serialized = JSON.stringify(defaulted);
    try {
      localStorage.setItem(storageKey, serialized);
      if (getTeamId() === DEFAULT_TEAM_ID) {
        try { localStorage.setItem("fibretrack_intv_" + defaulted.id, serialized); } catch {}
      }
    } catch (quotaErr) {
      evictOldStoredInterventions(defaulted.id);
      try {
        localStorage.setItem(storageKey, serialized);
      } catch (quotaErr2) {
        console.warn("saveInterventionLocally quota error after eviction:", quotaErr2);
      }
    }

    // 2. Mettre à jour la liste en cache pour la page d'accueil (en version légère sans base64)
    const list = getCached();
    const light = toLightIntervention(defaulted);
    const index = list.findIndex((i) => i.id === defaulted.id);
    if (index >= 0) list[index] = { ...list[index], ...light };
    else list.unshift(light);
    setCached(list);

    // Notification broadcast instantanée pour l'extension CelPros et les autres onglets
    if (typeof window !== "undefined") {
      try {
        window.postMessage({
          type: "FIBRETRACK_INTERVENTION_UPDATED",
          team_id: getTeamId(),
          intervention: defaulted,
          timestamp: Date.now(),
        }, "*");
      } catch {}
    }
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
    if (response) {
      intervention = {
        ...intervention,
        ...(response.updated_at ? { updated_at: response.updated_at, modifie_le: response.updated_at } : {}),
        ...(Array.isArray(response.whatsapp_photos) ? { whatsapp_photos: response.whatsapp_photos } : {}),
        ...(Array.isArray(response.points_gps) ? { points_gps: response.points_gps } : {}),
        ...(Array.isArray(response.videos_terrain) ? { videos_terrain: response.videos_terrain } : {}),
        _fully_loaded: true,
      };
      saveInterventionLocally(intervention);
    }
    // Succès confirmé : retirer de la file d'attente hors-ligne si présent
    removeFromOutbox(intervention.id);
    if (typeof window !== "undefined") {
      try {
        window.postMessage({
          type: "FIBRETRACK_INTERVENTION_UPDATED",
          team_id: getTeamId(),
          intervention,
          timestamp: Date.now(),
        }, "*");
      } catch {}
    }
    return { ...ensureInterventionDefaults(intervention), _synced: true, updated_at: response?.updated_at || intervention.updated_at };
  } catch (err) {
    console.warn("saveIntervention network sync failed, buffered into persistent outbox:", err);
    // Bufferiser dans l'outbox persistante pour synchronisation automatique dès retour réseau
    addToOutbox(intervention);
    return { ...ensureInterventionDefaults(intervention), _synced: false, _sync_error: err?.message || "Erreur réseau" };
  }
}

/**
 * Récupère une intervention par ID.
 * @param {string} id
 * @returns {Promise<Intervention|null>}
 */
export async function getIntervention(id) {
  const local = getStoredIntervention(id);
  try {
    const remote = await apiPost("intervention_get", { id });
    if (remote) {
      const defaultedRemote = ensureInterventionDefaults(remote);
      let finalIntv = defaultedRemote;
      if (local) {
        const localTime = toNormalizedTimestamp(local.updated_at || local.modifie_le);
        const remoteTime = toNormalizedTimestamp(defaultedRemote.updated_at || defaultedRemote.modifie_le);
        const hasUnsyncedOutbox = getSyncOutbox().some((item) => item.id === id);
        finalIntv = { ...defaultedRemote };
        if (hasUnsyncedOutbox && localTime > remoteTime) {
          // Préserver les champs locaux en attente d'envoi réseau sans écraser les photos/vidéos distantes
          for (const [key, val] of Object.entries(local)) {
            if (
              !["whatsapp_photos", "videos_terrain", "points_gps", "_deleted_photo_ids", "_deleted_video_ids", "deleted_videos"].includes(key) &&
              val !== undefined &&
              val !== null &&
              val !== ""
            ) {
              finalIntv[key] = val;
            }
          }
        } else {
          for (const key of ["nom_client", "nom_dossier", "telephone_ligne", "mobile", "adresse_zone", "msan", "fat_ref", "port"]) {
            if (!finalIntv[key] && local[key]) {
              finalIntv[key] = local[key];
            }
          }
        }
        // Préserver uniquement les photos locales non encore envoyées au serveur (en base64 ou dans l'outbox)
        if (Array.isArray(local.whatsapp_photos) && local.whatsapp_photos.length > 0) {
          const remotePhotoIds = new Set((finalIntv.whatsapp_photos || []).map((p) => p?.id).filter(Boolean));
          const remoteSingleSlots = new Set(
            (finalIntv.whatsapp_photos || [])
              .filter((p) => p && !p.additionnelle && !p.is_additionnelle && p.slot !== "additionnelle" && !String(p.slot).startsWith("additionnelle_") && p.slot !== "autre_poteau" && !String(p.slot).startsWith("autre_poteau"))
              .map((p) => p?.slot)
              .filter(Boolean)
          );
          const deletedPhotoIds = new Set(Array.isArray(local._deleted_photo_ids) ? local._deleted_photo_ids : []);
          const unsyncedPhotos = local.whatsapp_photos.filter((p) => {
            if (!p || !p.id || remotePhotoIds.has(p.id) || deletedPhotoIds.has(p.id)) return false;
            const isUnsynced = hasUnsyncedOutbox || String(p.url || "").startsWith("data:image");
            if (!isUnsynced) return false;
            const isMulti = !p.slot || p.additionnelle || p.is_additionnelle || p.slot === "additionnelle" || String(p.slot).startsWith("additionnelle_") || p.slot === "autre_poteau" || String(p.slot).startsWith("autre_poteau");
            if (!isMulti && p.slot && remoteSingleSlots.has(p.slot)) return false;
            return true;
          });
          if (unsyncedPhotos.length > 0) {
            finalIntv.whatsapp_photos = [...(finalIntv.whatsapp_photos || []), ...unsyncedPhotos];
          }
        }

        // Préserver les vidéos locales valides (non blob: périmées) en respectant les suppressions
        const deletedVideoIds = new Set(
          (Array.isArray(local._deleted_video_ids) ? local._deleted_video_ids : []).concat(
            Array.isArray(local.deleted_videos) ? local.deleted_videos : []
          ).map(String)
        );
        if (Array.isArray(finalIntv.videos_terrain)) {
          finalIntv.videos_terrain = finalIntv.videos_terrain.filter((v) => v && v.id && !deletedVideoIds.has(String(v.id)));
        }
        if (Array.isArray(local.videos_terrain) && local.videos_terrain.length > 0) {
          const remoteVideoIds = new Set((finalIntv.videos_terrain || []).map((v) => String(v?.id)).filter(Boolean));
          const remoteVideoUrls = new Set((finalIntv.videos_terrain || []).map((v) => String(v?.url || "")).filter(Boolean));
          const unsyncedVideos = local.videos_terrain.filter((v) => {
            if (!v || !v.id || deletedVideoIds.has(String(v.id))) return false;
            if (remoteVideoIds.has(String(v.id))) return false;
            if (v.url && remoteVideoUrls.has(String(v.url))) return false;
            // Toujours préserver les vidéos locales en cours d'envoi, en attente ou même avec blob temporaire
            return true;
          });
          if (unsyncedVideos.length > 0) {
            finalIntv.videos_terrain = [...(finalIntv.videos_terrain || []), ...unsyncedVideos];
          }
        }
      }
      finalIntv._fully_loaded = true;
      saveInterventionLocally(finalIntv);
      return finalIntv;
    }
  } catch (err) {
    console.warn("getIntervention remote fetch error:", err);
  }
  return local || null;
}

export async function getInterventionLight(id) {
  return apiPost("intervention_get_light", { id });
}

export async function checkInterventionUpdatedAt(id) {
  if (!id) return null;
  try {
    const res = await apiPost("intervention_updated_at", { id }, 8000);
    if (!res) return null;
    const updatedAt = res?.updated_at || "";
    const signature = res?.signature || updatedAt || "";
    return {
      updated_at: updatedAt,
      signature: signature,
      toString() {
        return signature;
      },
    };
  } catch {
    return null;
  }
}


/**
 * Supprime une intervention.
 * @param {string} id
 */
export async function deleteIntervention(id) {
  if (!id) return;

  // 1. Retrait immédiat de l'outbox hors-ligne pour ne jamais la réinjecter lors d'un flush
  removeFromOutbox(id);

  // 2. Nettoyage immédiat du stockage local dédié
  try {
    localStorage.removeItem(getIntvStoragePrefix() + id);
    if (getTeamId() === DEFAULT_TEAM_ID) {
      localStorage.removeItem("fibretrack_intv_" + id);
    }
  } catch {}

  // 3. Retrait immédiat du cache des interventions
  const list = getCached().filter((i) => i.id !== id);
  setCached(list);

  // 4. Notification immédiate aux autres onglets / extension
  if (typeof window !== "undefined") {
    try {
      window.postMessage({
        type: "FIBRETRACK_INTERVENTION_DELETED",
        team_id: getTeamId(),
        id,
        timestamp: Date.now(),
      }, "*");
    } catch {}
  }

  // 5. Appel serveur pour suppression définitive MySQL et restitution du stock
  try {
    await apiPost("intervention_delete", { id });
  } catch (err) {
    console.warn("deleteIntervention network sync error (supprimé localement) :", err);
    // On ne rethrow pas si l'utilisateur est temporairement hors-ligne pour ne pas bloquer l'interface
  }
}

export function createEmptyIntervention(technicien, initialNom = "") {
  return {
    id: crypto.randomUUID(),
    team_id: getTeamId(),
    date: new Date().toISOString(),
    statut: "en_cours",
    nom_technicien: technicien ?? "",
    nom_equipe: getTeamName(),

    nom_client: initialNom,
    nom_dossier: initialNom,
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
    debit_descendant: "",
    debit_montant: "",
    debit_ping: "",
    mac: "",
    sn: "",
    nb_poteaux_traverses: 0,
    nb_poteaux_implantes: 0,
    nb_poteaux_armes: 0,

    materiel_pose: {
      crochets: 0,
      piton: 1,
      cheville: 1,
      pto: 1,
      ont: 1,
    },

    points_gps: [],

    ont_sn: "",
    pto_qte: 1,
    ont_qte: 1,
    repeteur_wifi_qte: 0,
    emplacement_ont: "",
    client_confirme_emplacement: false,
    offre_souscrite: "Fibre Pro",
    remise_equipement_ok: false,
    appreciation_satisfaction_libre: "",

    type_intervention_satisfaction: "Installation",
    travaux_conformes: true,
    emplacement_valide: true,
    travail_propre: true,
    service_teste: true,
    service_fonctionne: true,
    explications_donnees: true,
    recommanderait: true,
    accepte_recontact: true,
    qualite: "Satisfait",
    delais: "Satisfait",
    professionnalisme: "Satisfait",
    nom_client_declaration: "",
    remarque_aucune: true,
    remarque_libre: "",
    signature_client: "",
    signature_technicien: "",

    whatsapp_photos: [],
    videos_terrain: [],
    tournee_du_jour: "",
    tournee_ordre: 0,
    tournee_verrouille: false,
    motif_non_traite: "",
  };
}

/**
 * Crée un lot d'interventions pour la Tournée du Jour.
 * Enregistre sur le serveur MySQL et en cache local avec gestion hors-ligne.
 * @param {string} dateTournee - Format YYYY-MM-DD
 * @param {Array<object>} parsedItems - Liste d'objets parsés
 * @param {string} technicienNom - Nom du technicien assigné
 * @returns {Promise<Array<object>>}
 */
export async function createTourneeBatch(dateTournee, parsedItems, technicienNom = "") {
  if (!Array.isArray(parsedItems) || parsedItems.length === 0) return [];

  const itemsToCreate = parsedItems.map((item, idx) => ({
    id: item.id || crypto.randomUUID(),
    nom_client: item.nom_client,
    nom_dossier: item.nom_client,
    telephone_ligne: item.telephone_ligne || "",
    mobile: item.mobile || "",
    offre_souscrite: item.offre_souscrite || "FTTH",
    msan: item.msan || "",
    fat_ref: item.fat_ref || "",
    tournee_du_jour: dateTournee,
    tournee_ordre: item.ordre || idx + 1,
    tournee_verrouille: true,
    statut: "en_attente",
    nom_technicien: technicienNom,
  }));

  try {
    const res = await apiPost("tournee_batch_create", {
      date_tournee: dateTournee,
      nom_technicien: technicienNom,
      interventions: itemsToCreate,
    });
    if (res?.created && Array.isArray(res.created)) {
      const fullCreated = res.created.map((item) => {
        const full = ensureInterventionDefaults({
          ...item,
          nom_technicien: technicienNom,
          _fully_loaded: true,
        });
        saveInterventionLocally(full);
        return full;
      });
      return fullCreated;
    }
    throw new Error("Réponse API invalide");
  } catch (err) {
    console.warn("createTourneeBatch API error, fallback local:", err);
    // Sauvegarde locale hors-ligne et ajout à l'outbox
    const localCreated = itemsToCreate.map((item, idx) => {
      const full = createEmptyIntervention(technicienNom, item.nom_client);
      full.id = item.id;
      full.nom_client = item.nom_client;
      full.nom_dossier = item.nom_client;
      full.telephone_ligne = item.telephone_ligne;
      full.mobile = item.mobile;
      full.offre_souscrite = item.offre_souscrite;
      full.msan = item.msan;
      full.fat_ref = item.fat_ref;
      full.tournee_du_jour = dateTournee;
      full.tournee_ordre = item.tournee_ordre;
      full.tournee_verrouille = item.tournee_verrouille;
      full.statut = item.statut;
      full._fully_loaded = true;
      saveInterventionLocally(full);
      addToOutbox(full);
      return full;
    });
    return localCreated;
  }
}
