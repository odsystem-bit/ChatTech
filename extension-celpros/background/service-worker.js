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

// Construction des en-têtes d'authentification
function getAuthHeaders(apiCode) {
  const headers = { "Content-Type": "application/json" };
  if (apiCode) {
    headers["X-User-Code"] = String(apiCode).trim();
  }
  return headers;
}

// Construction des URLs d'action API avec tolérance aux slashes et index.php
function formatApiActionUrl(baseUrl, action) {
  let clean = (baseUrl || DEFAULT_CONFIG.apiUrl).trim().replace(/\/+$/, "");
  if (!clean.includes(".php") && !clean.includes("?")) {
    clean = `${clean}/index.php`;
  }
  const sep = clean.includes("?") ? "&" : "?";
  return `${clean}${sep}action=${encodeURIComponent(action)}`;
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
async function fetchInterventionsList() {
  const config = await getConfig();
  const url = formatApiActionUrl(config.apiUrl, "interventions_list_light");

  try {
    const res = await fetch(url, {
      method: "GET",
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

    const list = await res.json();
    if (Array.isArray(list)) {
      // Trier : 'en_cours' en priorité, puis par date décroissante
      list.sort((a, b) => {
        const aIsDone = (a.statut || "").toLowerCase() === "termine";
        const bIsDone = (b.statut || "").toLowerCase() === "termine";
        if (aIsDone !== bIsDone) return aIsDone ? 1 : -1;
        const da = new Date(a.date || 0).getTime();
        const db = new Date(b.date || 0).getTime();
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
    console.warn("[CelPros Background] Erreur fetch interventions, tentative lecture cache local:", err.message);
    const stored = await chrome.storage.local.get(["cachedInterventions"]);
    if (Array.isArray(stored.cachedInterventions) && stored.cachedInterventions.length > 0) {
      console.log(`[CelPros Background] Utilisation de ${stored.cachedInterventions.length} fiches du cache local.`);
      return stored.cachedInterventions;
    }
    throw err;
  }
}

// Récupération complète des détails d'une intervention
async function fetchInterventionDetails(id) {
  if (!id) throw new Error("ID d'intervention manquant");
  const config = await getConfig();
  const url = formatApiActionUrl(config.apiUrl, "intervention_get");

  try {
    const res = await fetch(url, {
      method: "POST",
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
    console.warn(`[CelPros Background] Erreur fetch détails pour ${id}, tentative fallback:`, err.message);
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
      fetchInterventionsList()
        .then((list) => sendResponse({ ok: true, data: list }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "FETCH_INTERVENTION_DETAILS":
      fetchInterventionDetails(payload?.id)
        .then((item) => sendResponse({ ok: true, data: item }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case "SET_ACTIVE_INTERVENTION":
      chrome.storage.local
        .set({ activeIntervention: payload })
        .then(() => {
          // Notifier les onglets ouverts sans réémettre vers l'onglet qui a initié l'action
          const targetUrls = [
            "*://celpros.celtiis.bj/*",
            "*://fatautomation.celtiis.bj/*",
            "http://localhost/*",
            "http://127.0.0.1/*",
            "file:///*",
          ];
          chrome.tabs.query({ url: targetUrls }, (tabs) => {
            const senderTabId = sender?.tab?.id;
            tabs.forEach((tab) => {
              if (tab.id && tab.id !== senderTabId) {
                chrome.tabs.sendMessage(tab.id, {
                  action: "ACTIVE_INTERVENTION_UPDATED",
                  payload,
                }, () => {
                  // Consomme systématiquement chrome.runtime.lastError pour éviter tout avertissement non intercepté
                  if (chrome.runtime.lastError) {
                    /* onglet sans content script actif, ignoré en toute sécurité */
                  }
                });
              }
            });
          });
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

    default:
      sendResponse({ ok: false, error: `Action inconnue: ${action}` });
      return false;
  }
});
