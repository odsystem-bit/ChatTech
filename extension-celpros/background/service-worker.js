// Background Service Worker (Manifest V3)
// Gère les appels réseau API ChapTech (contourne CORS/CSP de la page cible)
// et synchronise le stockage local de l'extension.

const DEFAULT_CONFIG = {
  apiUrl: "https://fibretrack.mantota.com/api/index.php",
  apiCode: "9999",
  autoSync: true,
  autoPilotEnabled: true,
  widgetVisible: true,
  lastSyncTime: null,
};

// Cache LRU en mémoire pour les médias (évite les re-téléchargements et l'épuisement RAM/CPU)
const MEDIA_CACHE_MAX_ITEMS = 40;
const mediaDataUrlCache = new Map();
const inFlightMediaFetches = new Map();
let lastSavedInterventionFingerprint = "";

function computeInterventionFingerprint(item) {
  if (!item || typeof item !== "object" || !item.id) return "";
  const wa = Array.isArray(item.whatsapp_photos)
    ? item.whatsapp_photos.map((p) => `${p?.id || ""}:${p?.slot || ""}:${(p?.url || "").slice(-32)}`).join("|")
    : String(item.whatsapp_photos || "");
  const gps = Array.isArray(item.points_gps)
    ? item.points_gps.map((p) => `${p?.id || ""}:${p?.type || ""}:${p?.numero || ""}:${p?.lat || ""}:${p?.lng || ""}:${(p?.photo || "").slice(-24)}`).join("|")
    : String(item.points_gps || "");
  const mat = item.materiel_pose && typeof item.materiel_pose === "object"
    ? JSON.stringify(item.materiel_pose)
    : String(item.materiel_pose || "");
  return [
    String(item.id),
    String(item.updated_at || item.modifie_le || ""),
    String(item.statut || ""),
    String(item.nom_client || item.nom_dossier || ""),
    String(item.fat_ref || ""),
    String(item.port || ""),
    String(item.ont_sn || item.sn || ""),
    String(item.depart_m ?? ""),
    String(item.arrivee_m ?? ""),
    String(item.puissance_fat_dbm ?? ""),
    String(item.puissance_pto_dbm ?? ""),
    wa,
    gps,
    mat,
  ].join("::");
}

function mergeLightWithExistingIntervention(incoming, existing) {
  if (!incoming || !existing || String(incoming.id) !== String(existing.id)) {
    return incoming;
  }
  const merged = { ...existing, ...incoming };

  const incWa = Array.isArray(incoming.whatsapp_photos) ? incoming.whatsapp_photos : null;
  const exWa = Array.isArray(existing.whatsapp_photos) ? existing.whatsapp_photos : null;
  if (exWa && exWa.length > 0) {
    if (!incWa || incWa.length === 0) {
      merged.whatsapp_photos = exWa;
    } else {
      const exById = new Map(exWa.filter((p) => p && p.id).map((p) => [String(p.id), p]));
      merged.whatsapp_photos = incWa.map((p) => {
        if (!p) return p;
        if (!p.url && p.id && exById.has(String(p.id))) {
          return { ...exById.get(String(p.id)), ...p, url: exById.get(String(p.id)).url };
        }
        return p;
      });
    }
  }

  const incGps = Array.isArray(incoming.points_gps) ? incoming.points_gps : null;
  const exGps = Array.isArray(existing.points_gps) ? existing.points_gps : null;
  if (exGps && exGps.length > 0) {
    if (!incGps || incGps.length === 0) {
      merged.points_gps = exGps;
    } else {
      const exByKey = new Map(
        exGps
          .filter(Boolean)
          .map((pt) => [String(pt.id || `${pt.type || ""}_${pt.numero || ""}`), pt])
      );
      merged.points_gps = incGps.map((pt) => {
        if (!pt) return pt;
        const k = String(pt.id || `${pt.type || ""}_${pt.numero || ""}`);
        if (!pt.photo && exByKey.has(k) && exByKey.get(k).photo) {
          return { ...exByKey.get(k), ...pt, photo: exByKey.get(k).photo };
        }
        return pt;
      });
    }
  }

  return merged;
}

async function saveActiveInterventionIfChanged(item, options = {}) {
  if (!item || !item.id) return { changed: false, item: null };
  const stored = await chrome.storage.local.get(["activeIntervention"]);
  const existing = stored.activeIntervention || null;
  const merged = options.allowOverwritePhotos ? item : mergeLightWithExistingIntervention(item, existing);
  const newFp = computeInterventionFingerprint(merged);
  const oldFp = existing ? computeInterventionFingerprint(existing) : "";

  if (newFp && (newFp === oldFp || newFp === lastSavedInterventionFingerprint)) {
    lastSavedInterventionFingerprint = newFp;
    return { changed: false, item: merged };
  }

  lastSavedInterventionFingerprint = newFp;
  await chrome.storage.local.set({ activeIntervention: merged });
  if (options.broadcast) {
    broadcastActiveIntervention(merged, options.excludeTabId ?? null);
  }
  return { changed: true, item: merged };
}

// Initialisation des réglages à l'installation
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([
    "apiUrl",
    "apiCode",
    "widgetVisible",
    "autoPilotEnabled",
    "chaptech_autopilot_enabled",
  ]);
  const resolvedAutoPilot =
    existing.chaptech_autopilot_enabled !== undefined
      ? Boolean(existing.chaptech_autopilot_enabled)
      : existing.autoPilotEnabled !== undefined
        ? Boolean(existing.autoPilotEnabled)
        : DEFAULT_CONFIG.autoPilotEnabled;
  const initial = {
    ...DEFAULT_CONFIG,
    ...existing,
    autoPilotEnabled: resolvedAutoPilot,
    chaptech_autopilot_enabled: resolvedAutoPilot,
  };
  await chrome.storage.local.set(initial);
  console.log("[CelPros Background] Extension installée / mise à jour. Configuration initiale:", initial);
});

// Récupération sécurisée de la configuration
async function getConfig() {
  const stored = await chrome.storage.local.get([
    "apiUrl",
    "apiCode",
    "autoSync",
    "autoPilotEnabled",
    "chaptech_autopilot_enabled",
    "widgetVisible",
    "lastSyncTime",
    "activeIntervention",
  ]);
  const autoPilotEnabled =
    stored.chaptech_autopilot_enabled !== undefined
      ? Boolean(stored.chaptech_autopilot_enabled)
      : stored.autoPilotEnabled !== undefined
        ? Boolean(stored.autoPilotEnabled)
        : DEFAULT_CONFIG.autoPilotEnabled;
  return {
    apiUrl: stored.apiUrl || DEFAULT_CONFIG.apiUrl,
    apiCode: stored.apiCode || DEFAULT_CONFIG.apiCode,
    autoSync: stored.autoSync ?? DEFAULT_CONFIG.autoSync,
    autoPilotEnabled,
    widgetVisible: stored.widgetVisible ?? DEFAULT_CONFIG.widgetVisible,
    lastSyncTime: stored.lastSyncTime || null,
    activeIntervention: stored.activeIntervention || null,
  };
}

// Construction des en-têtes d'authentification sans cache
function getAuthHeaders(apiCode) {
  const headers = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  };
  if (apiCode) {
    headers["X-User-Code"] = String(apiCode).trim();
  }
  return headers;
}

// Construction des URLs d'action API avec cache-busting strict (_t=timestamp) et user_code
function formatApiActionUrl(baseUrl, action, apiCode = null) {
  let clean = (baseUrl || DEFAULT_CONFIG.apiUrl).trim().replace(/\/+$/, "");
  if (!clean.includes(".php") && !clean.includes("?")) {
    clean = `${clean}/index.php`;
  }
  const sep = clean.includes("?") ? "&" : "?";
  let url = `${clean}${sep}action=${encodeURIComponent(action)}&_t=${Date.now()}`;
  if (apiCode) {
    url += `&user_code=${encodeURIComponent(String(apiCode).trim())}`;
  }
  return url;
}

// Diffusion sécurisée de l'intervention active vers tous les onglets CelPros/FAT/Démo
function broadcastActiveIntervention(item, excludeTabId = null) {
  if (!item) return;
  const targetUrls = [
    "*://celpros.celtiis.bj/*",
    "*://fatautomation.celtiis.bj/*",
    "http://localhost/*",
    "http://127.0.0.1/*",
    "file:///*",
  ];
  chrome.tabs.query({ url: targetUrls }, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id && tab.id !== excludeTabId) {
        chrome.tabs.sendMessage(
          tab.id,
          {
            action: "ACTIVE_INTERVENTION_UPDATED",
            payload: item,
          },
          () => {
            if (chrome.runtime.lastError) {
              /* ignorer onglet sans content script actif */
            }
          }
        );
      }
    });
  });
}

// Test de connexion à l'API ChapTech
async function testConnection(customConfig = null) {
  const config = customConfig || (await getConfig());
  const apiUrl = (config.apiUrl || DEFAULT_CONFIG.apiUrl).trim();
  const apiCode = (config.apiCode || DEFAULT_CONFIG.apiCode).trim();

  try {
    const url = formatApiActionUrl(apiUrl, "interventions_list_light", apiCode);
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: getAuthHeaders(apiCode),
    });

    if (!res.ok) {
      let errText = `HTTP ${res.status}`;
      try {
        const json = await res.json();
        if (json.error) errText = json.error;
      } catch {}
      return { ok: false, status: res.status, error: errText };
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return { ok: false, error: "Réponse inattendue du serveur ChapTech (pas un tableau)" };
    }

    return {
      ok: true,
      count: data.length,
      sample: data.slice(0, 3),
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return { ok: false, error: err.message || "Impossible de joindre le serveur ChapTech" };
  }
}

// Récupération de la liste des interventions (light) avec tri et fallback cache
async function fetchInterventionsList(forceFresh = false) {
  const config = await getConfig();
  const url = formatApiActionUrl(config.apiUrl, "interventions_list_light", config.apiCode);

  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: getAuthHeaders(config.apiCode),
    });

    if (!res.ok) {
      let msg = `Erreur HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j.error) msg = j.error;
      } catch {}
      throw new Error(msg);
    }

    const parseTimestampSafely = (dateStr) => {
      if (!dateStr || typeof dateStr !== "string") return 0;
      const clean = dateStr.trim().replace(/\.+$/, "").replace(" ", "T");
      const ts = Date.parse(clean);
      return isNaN(ts) ? 0 : ts;
    };

    const isItemTermine = (item) => {
      if (!item) return false;
      const s = String(item.statut || "").trim().toLowerCase();
      const norm = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return (
        norm === "termine" ||
        norm === "terminee" ||
        norm === "cloture" ||
        norm === "cloturee" ||
        norm === "clos" ||
        norm === "closed" ||
        norm === "done" ||
        Boolean(item.date_cloture)
      );
    };

    const list = await res.json();
    if (Array.isArray(list)) {
      // Trier : 'en_cours' en priorité absolue, puis par date décroissante
      list.sort((a, b) => {
        const aIsDone = isItemTermine(a);
        const bIsDone = isItemTermine(b);
        if (aIsDone !== bIsDone) return aIsDone ? 1 : -1;
        const da = parseTimestampSafely(a.modifie_le || a.updated_at || a.date);
        const db = parseTimestampSafely(b.modifie_le || b.updated_at || b.date);
        return db - da;
      });

      const now = new Date().toISOString();
      await chrome.storage.local.set({
        cachedInterventions: list,
        lastSyncTime: now,
      });
      return list;
    }
    throw new Error("Format de réponse invalide");
  } catch (err) {
    if (forceFresh) {
      console.warn("[CelPros Background] Échec fetch frais explicite, fallback cache:", err.message);
    } else {
      console.warn("[CelPros Background] Erreur fetch interventions, lecture cache local:", err.message);
    }
    const stored = await chrome.storage.local.get(["cachedInterventions"]);
    if (Array.isArray(stored.cachedInterventions) && stored.cachedInterventions.length > 0) {
      console.log(`[CelPros Background] Utilisation de ${stored.cachedInterventions.length} fiches du cache local.`);
      return stored.cachedInterventions;
    }
    throw err;
  }
}

// Récupération complète des détails d'une intervention avec cache-busting
async function fetchInterventionDetails(id, forceFresh = false, options = {}) {
  if (!id) throw new Error("ID d'intervention manquant");
  const config = await getConfig();
  const url = formatApiActionUrl(config.apiUrl, "intervention_get", config.apiCode);

  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: getAuthHeaders(config.apiCode),
      body: JSON.stringify({ id: String(id) }),
    });

    if (!res.ok) {
      let msg = `Erreur HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j.error) msg = j.error;
      } catch {}
      throw new Error(msg);
    }

    const item = await res.json();
    if (!item || !item.id) throw new Error("Fiche introuvable");
    if (options.saveToStorage !== false) {
      try {
        await saveActiveInterventionIfChanged(item, {
          allowOverwritePhotos: true,
          broadcast: Boolean(options.broadcast),
        });
      } catch (storErr) {
        console.warn("[CelPros Background] Erreur sauvegarde activeIntervention dans storage:", storErr);
      }
    }
    return item;
  } catch (err) {
    if (forceFresh) {
      console.warn(`[CelPros Background] Échec fetch frais pour ${id}, tentative fallback:`, err.message);
    }
    const stored = await chrome.storage.local.get(["activeIntervention", "cachedInterventions"]);
    if (stored.activeIntervention && String(stored.activeIntervention.id) === String(id)) {
      return stored.activeIntervention;
    }
    if (Array.isArray(stored.cachedInterventions)) {
      const match = stored.cachedInterventions.find((i) => String(i.id) === String(id));
      if (match) return match;
    }
    throw err;
  }
}

function parseTimestampSafely(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return 0;
  let clean = dateStr.trim();
  if (!clean) return 0;
  clean = clean.replace(" ", "T");
  const hasTz = clean.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(clean);
  const normalized = hasTz ? clean : `${clean}Z`;
  const ts = Date.parse(normalized);
  if (!isNaN(ts)) return ts;
  const fallback = Date.parse(clean);
  return isNaN(fallback) ? 0 : fallback;
}

function isInterventionOutdated(lastKnown, serverUpdatedAt) {
  if (!lastKnown) return true;
  if (!serverUpdatedAt) return false;
  const sStr = String(serverUpdatedAt).trim();
  const lStr = String(lastKnown).trim();
  if (sStr === lStr) return false;

  const sTime = parseTimestampSafely(sStr);
  const lTime = parseTimestampSafely(lStr);
  if (sTime > 0 && lTime > 0) {
    return Math.abs(sTime - lTime) >= 1000;
  }
  return sStr !== lStr;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const CHUNK_SIZE = 0x8000; // 32KB chunks — évite le blocage CPU O(N²) et le dépassement de pile
  const chunks = [];
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE)));
  }
  const binary = chunks.join("");
  return typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
}

function setCachedMediaDataUrl(key, dataUrl) {
  if (!key || !dataUrl) return;
  if (mediaDataUrlCache.has(key)) {
    mediaDataUrlCache.delete(key);
  } else if (mediaDataUrlCache.size >= MEDIA_CACHE_MAX_ITEMS) {
    const oldestKey = mediaDataUrlCache.keys().next().value;
    if (oldestKey !== undefined) mediaDataUrlCache.delete(oldestKey);
  }
  mediaDataUrlCache.set(key, dataUrl);
}

// Téléchargement sécurisé d'un média (photo) en tâche de fond pour contourner CORS, CSP et erreurs HTTP 403
async function fetchMediaAsDataUrl(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== "string") {
    throw new Error("URL de média invalide");
  }
  const trimmed = mediaUrl.trim();
  if (trimmed.startsWith("data:")) {
    return trimmed;
  }
  if (mediaDataUrlCache.has(trimmed)) {
    return mediaDataUrlCache.get(trimmed);
  }
  if (inFlightMediaFetches.has(trimmed)) {
    return inFlightMediaFetches.get(trimmed);
  }

  const fetchPromise = (async () => {
    const config = await getConfig();
    let url = trimmed;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      const base = config.apiUrl ? config.apiUrl.replace(/\/index\.php.*$/, "") : "https://fibretrack.mantota.com/api";
      url = `${base.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
    }

    let res = null;
    try {
      res = await fetch(url, {
        method: "GET",
        cache: "force-cache",
        headers: {
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          ...(config.apiCode ? { "X-User-Code": String(config.apiCode).trim() } : {}),
        },
      });
    } catch (directErr) {
      res = null;
    }

    // Fallback via proxy API authentifié si le serveur statique retourne 403/404 ou bloque l'origine de l'extension
    if (!res || !res.ok) {
      let relPath = trimmed;
      try {
        if (relPath.startsWith("http://") || relPath.startsWith("https://")) {
          relPath = new URL(relPath).pathname;
        }
      } catch (e) {
        // Conserver relPath tel quel
      }
      relPath = relPath.replace(/^\/+/, "").replace(/^api\//, "");
      const proxyUrl = `${formatApiActionUrl(config.apiUrl, "photo_get", config.apiCode)}&format=json&path=${encodeURIComponent(relPath)}`;
      const proxyRes = await fetch(proxyUrl, {
        method: "GET",
        cache: "no-store",
        headers: getAuthHeaders(config.apiCode),
      });
      if (proxyRes.ok) {
        const contentType = proxyRes.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const json = await proxyRes.json();
          if (json && json.dataUrl && String(json.dataUrl).startsWith("data:")) {
            setCachedMediaDataUrl(trimmed, json.dataUrl);
            return json.dataUrl;
          }
        } else {
          res = proxyRes;
        }
      }
    }

    if (!res || !res.ok) {
      const status = res ? res.status : "NetworkError";
      throw new Error(`Échec HTTP ${status} lors de la récupération du média`);
    }

    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const mimeType = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${base64}`;
    setCachedMediaDataUrl(trimmed, dataUrl);
    return dataUrl;
  })();

  inFlightMediaFetches.set(trimmed, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightMediaFetches.delete(trimmed);
  }
}

// Vérification légère de mise à jour d'intervention en cours (Live update)
async function checkForUpdates(id, lastKnownUpdatedAt = null) {
  if (!id) throw new Error("ID manquant pour vérification");
  const config = await getConfig();
  const url = formatApiActionUrl(config.apiUrl, "intervention_updated_at", config.apiCode);

  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: getAuthHeaders(config.apiCode),
    body: JSON.stringify({ id: String(id) }),
  });

  if (!res.ok) {
    let msg = `Erreur HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }

  const json = await res.json();
  const serverUpdatedAt = json?.updated_at || "";
  const hasChanged = isInterventionOutdated(lastKnownUpdatedAt, serverUpdatedAt);
  let freshItem = null;

  if (hasChanged) {
    freshItem = await fetchInterventionDetails(id, true, { saveToStorage: true, broadcast: false });
    fetchInterventionsList(true).catch(() => {});
  }

  return {
    hasChanged,
    updated_at: serverUpdatedAt,
    item: freshItem,
  };
}

// Routeur de messages inter-processus (Content Script <-> Popup <-> Background)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const action = request?.action || request?.type;
  const payload = request?.payload !== undefined ? request.payload : request?.data;

  switch (action) {
    case "GET_CONFIG":
      getConfig()
        .then((cfg) => sendResponse({ ok: true, data: cfg }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "SAVE_CONFIG": {
      const nextPayload = { ...(payload || {}) };
      if (nextPayload.autoPilotEnabled !== undefined) {
        nextPayload.chaptech_autopilot_enabled = Boolean(nextPayload.autoPilotEnabled);
      } else if (nextPayload.chaptech_autopilot_enabled !== undefined) {
        nextPayload.autoPilotEnabled = Boolean(nextPayload.chaptech_autopilot_enabled);
      }
      chrome.storage.local
        .set(nextPayload)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    case "SET_AUTOPILOT_STATE": {
      const enabled = Boolean(payload?.enabled ?? payload);
      chrome.storage.local
        .set({ autoPilotEnabled: enabled, chaptech_autopilot_enabled: enabled })
        .then(() => sendResponse({ ok: true, autoPilotEnabled: enabled }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;
    }

    case "TEST_CONNECTION":
      testConnection(payload)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "FETCH_INTERVENTIONS":
      fetchInterventionsList(Boolean(payload?.forceFresh))
        .then((list) => sendResponse({ ok: true, data: list }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "FETCH_INTERVENTION_DETAILS":
      fetchInterventionDetails(payload?.id, Boolean(payload?.forceFresh), {
        saveToStorage: payload?.saveToStorage !== false,
        broadcast: false,
      })
        .then((item) => sendResponse({ ok: true, data: item }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "FETCH_MEDIA":
      fetchMediaAsDataUrl(payload?.url)
        .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "CHECK_FOR_UPDATES":
    case "intervention_updated_at":
      checkForUpdates(payload?.id, payload?.lastUpdatedAt)
        .then((result) => sendResponse({ ok: true, data: result }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "BROADCAST_ACTIVE_INTERVENTION":
      broadcastActiveIntervention(payload, sender?.tab?.id);
      sendResponse({ ok: true });
      return true;

    case "SET_ACTIVE_INTERVENTION":
      saveActiveInterventionIfChanged(payload, {
        allowOverwritePhotos: false,
        broadcast: false,
        excludeTabId: sender?.tab?.id,
      })
        .then((res) => {
          sendResponse({ ok: true, changed: res.changed });
        })
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "GET_ACTIVE_INTERVENTION":
      chrome.storage.local
        .get(["activeIntervention"])
        .then((data) => sendResponse({ ok: true, data: data.activeIntervention || null }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "FIBRETRACK_UPDATE_BROADCAST":
    case "FIBRETRACK_INTERVENTION_SYNC":
    case "SYNC_ACTIVE_INTERVENTION":
      if (payload && payload.id) {
        saveActiveInterventionIfChanged(payload, {
          allowOverwritePhotos: false,
          broadcast: false,
          excludeTabId: sender?.tab?.id,
        })
          .then((res) => {
            sendResponse({ ok: true, changed: res.changed });
          })
          .catch((err) => sendResponse({ ok: false, error: err.message }));
        return true;
      }
      sendResponse({ ok: false, error: "Payload d'intervention invalide" });
      return false;

    default:
      sendResponse({ ok: false, error: `Action inconnue: ${action}` });
      return false;
  }
});

// Alarmes chrome pour réveil et synchronisation périodique en tâche de fond (Manifest V3)
if (typeof chrome !== "undefined" && chrome.alarms) {
  chrome.alarms.get("CELPROS_SYNC_ALARM", (alarm) => {
    if (!alarm) {
      chrome.alarms.create("CELPROS_SYNC_ALARM", { periodInMinutes: 1 });
    }
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "CELPROS_SYNC_ALARM") {
      try {
        const config = await getConfig();
        if (config.autoSync && config.autoPilotEnabled && config.activeIntervention && config.activeIntervention.id) {
          const current = config.activeIntervention;
          await checkForUpdates(current.id, current.updated_at || current.modifie_le);
        }
      } catch (err) {
        console.warn("[CelPros SW Alarm] Erreur sync périodique:", err.message);
      }
    }
  });
}
