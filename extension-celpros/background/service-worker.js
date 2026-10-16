// Background Service Worker (Manifest V3)
// Gère les appels réseau API ChapTech (contourne CORS/CSP de la page cible)
// et synchronise le stockage local de l'extension.

const DEFAULT_CONFIG = {
  apiUrl: "https://fibretrack.mantota.com/api/index.php",
  apiCode: "9999",
  autoSync: true,
  widgetVisible: true,
  lastSyncTime: null,
};

// Initialisation des réglages à l'installation
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(["apiUrl", "apiCode", "widgetVisible"]);
  const initial = { ...DEFAULT_CONFIG, ...existing };
  await chrome.storage.local.set(initial);
  console.log("[CelPros Background] Extension installée / mise à jour. Configuration initiale:", initial);
});

// Récupération sécurisée de la configuration
async function getConfig() {
  const stored = await chrome.storage.local.get([
    "apiUrl",
    "apiCode",
    "autoSync",
    "widgetVisible",
    "lastSyncTime",
    "activeIntervention",
  ]);
  return {
    apiUrl: stored.apiUrl || DEFAULT_CONFIG.apiUrl,
    apiCode: stored.apiCode || DEFAULT_CONFIG.apiCode,
    autoSync: stored.autoSync ?? DEFAULT_CONFIG.autoSync,
    widgetVisible: stored.widgetVisible ?? DEFAULT_CONFIG.widgetVisible,
    lastSyncTime: stored.lastSyncTime || null,
    activeIntervention: stored.activeIntervention || null,
  };
}

// Construction des en-têtes d'authentification sans cache
function getAuthHeaders(apiCode) {
  const headers = {
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

// Construction des URLs d'action API avec cache-busting strict (_t=timestamp)
function formatApiActionUrl(baseUrl, action) {
  let clean = (baseUrl || DEFAULT_CONFIG.apiUrl).trim().replace(/\/+$/, "");
  if (!clean.includes(".php") && !clean.includes("?")) {
    clean = `${clean}/index.php`;
  }
  const sep = clean.includes("?") ? "&" : "?";
  return `${clean}${sep}action=${encodeURIComponent(action)}&_t=${Date.now()}`;
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
    const url = formatApiActionUrl(apiUrl, "interventions_list_light");
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
  const url = formatApiActionUrl(config.apiUrl, "interventions_list_light");

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
async function fetchInterventionDetails(id, forceFresh = false) {
  if (!id) throw new Error("ID d'intervention manquant");
  const config = await getConfig();
  const url = formatApiActionUrl(config.apiUrl, "intervention_get");

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
    try {
      await chrome.storage.local.set({ activeIntervention: item });
    } catch (storErr) {
      console.warn("[CelPros Background] Erreur sauvegarde activeIntervention dans storage:", storErr);
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

// Téléchargement sécurisé d'un média (photo) en tâche de fond pour contourner CORS & CSP
async function fetchMediaAsDataUrl(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== "string") {
    throw new Error("URL de média invalide");
  }
  let url = mediaUrl.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    const config = await getConfig();
    const base = config.apiUrl ? config.apiUrl.replace(/\/index\.php.*$/, "") : "https://fibretrack.mantota.com/api";
    url = `${base.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Échec HTTP ${res.status} lors de la récupération du média`);
  }
  const blob = await res.blob();
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64");
  const mimeType = blob.type || "image/jpeg";
  return `data:${mimeType};base64,${base64}`;
}

// Vérification légère de mise à jour d'intervention en cours (Live update)
async function checkForUpdates(id, lastKnownUpdatedAt = null) {
  if (!id) throw new Error("ID manquant pour vérification");
  const config = await getConfig();
  const url = formatApiActionUrl(config.apiUrl, "intervention_updated_at");

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
    freshItem = await fetchInterventionDetails(id, true);
    await chrome.storage.local.set({ activeIntervention: freshItem });
    broadcastActiveIntervention(freshItem);
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
  const { action, payload } = request || {};

  switch (action) {
    case "GET_CONFIG":
      getConfig()
        .then((cfg) => sendResponse({ ok: true, data: cfg }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "SAVE_CONFIG":
      chrome.storage.local
        .set(payload || {})
        .then(() => sendResponse({ ok: true }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

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
      fetchInterventionDetails(payload?.id, Boolean(payload?.forceFresh))
        .then((item) => sendResponse({ ok: true, data: item }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "FETCH_MEDIA":
      fetchMediaAsDataUrl(payload?.url)
        .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "CHECK_FOR_UPDATES":
      checkForUpdates(payload?.id, payload?.lastUpdatedAt)
        .then((result) => sendResponse({ ok: true, data: result }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "BROADCAST_ACTIVE_INTERVENTION":
      broadcastActiveIntervention(payload, sender?.tab?.id);
      sendResponse({ ok: true });
      return true;

    case "SET_ACTIVE_INTERVENTION":
      chrome.storage.local
        .set({ activeIntervention: payload })
        .then(() => {
          broadcastActiveIntervention(payload, sender?.tab?.id);
          sendResponse({ ok: true });
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
      if (payload && payload.id) {
        chrome.storage.local.set({ activeIntervention: payload }).then(() => {
          broadcastActiveIntervention(payload, sender?.tab?.id);
          sendResponse({ ok: true });
        }).catch((err) => sendResponse({ ok: false, error: err.message }));
        fetchInterventionsList(true).catch(() => {});
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
        if (config.autoSync && config.activeIntervention && config.activeIntervention.id) {
          const current = config.activeIntervention;
          await checkForUpdates(current.id, current.updated_at || current.modifie_le);
        }
      } catch (err) {
        console.warn("[CelPros SW Alarm] Erreur sync périodique:", err.message);
      }
    }
  });
}
