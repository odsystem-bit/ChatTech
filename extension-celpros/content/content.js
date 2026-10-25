// Content Script Entry Point pour ChapTech CelPros
// Démarre automatiquement sur les pages cibles CelPros et FAT Automation

(function () {
  "use strict";

  // GARDE-FOU 1 : Ne JAMAIS exécuter l'extension dans les iframes (Google Maps, Auth, etc.)
  if (typeof window !== "undefined" && window.self !== window.top) {
    return;
  }

  console.log("[ChapTech CelPros] Content script chargé sur :", window.location.href);

  let widgetInstance = null;

  // GARDE-FOU 2 : Attendre que l'application CelPros (Angular) ait fini son amorçage
  // Tant que l'animation .app-loading / .lds-pacman tourne, Angular n'a pas fini d'initialiser son router
  function isCelprosAppReady() {
    if (typeof document === "undefined" || !document.body) return false;
    const loadingEl = document.querySelector(".app-loading, .lds-pacman");
    if (loadingEl) {
      return false;
    }
    return true;
  }

  function initExtension() {
    if (widgetInstance) return;

    if (!isCelprosAppReady()) {
      setTimeout(initExtension, 250);
      return;
    }

    if (window.CelprosWidget) {
      widgetInstance = new window.CelprosWidget();
      widgetInstance.init();
      console.log("[ChapTech CelPros] Widget initialisé avec succès !");
    } else {
      setTimeout(initExtension, 250);
    }
  }

  // Écoute des synchronisations de stockage local (immédiat sans message)
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;

      if (changes.chaptech_autopilot_enabled !== undefined || changes.autoPilotEnabled !== undefined) {
        const nextAutoPilot =
          changes.chaptech_autopilot_enabled !== undefined
            ? Boolean(changes.chaptech_autopilot_enabled.newValue)
            : Boolean(changes.autoPilotEnabled.newValue);
        if (widgetInstance && typeof widgetInstance.setAutoPilotState === "function") {
          widgetInstance.setAutoPilotState(nextAutoPilot, false);
        }
      }

      if (changes.activeIntervention) {
        const newIntv = changes.activeIntervention.newValue;
        if (newIntv) {
          if (!widgetInstance && window.CelprosWidget) {
            initExtension();
          }
          if (widgetInstance) {
            const didChange = widgetInstance.setSelectedIntervention(newIntv, false);
            if (didChange && widgetInstance.canAutoFill()) {
              widgetInstance.handleAutofill(true);
            }
          }
        }
      }
    });
  }

  // Écoute des messages venant du Popup ou du Service Worker
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const { action, payload } = request || {};

      if (action === "TRIGGER_AUTOFILL") {
        if (!widgetInstance && window.CelprosWidget) {
          initExtension();
        }
        if (widgetInstance) {
          widgetInstance.handleAutofill(false);
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: "Widget CelPros non prêt" });
        }
        return true;
      }

      if (action === "SET_AUTOPILOT_STATE") {
        const enabled = Boolean(payload?.enabled ?? payload);
        if (widgetInstance && typeof widgetInstance.setAutoPilotState === "function") {
          widgetInstance.setAutoPilotState(enabled, false);
        }
        sendResponse({ ok: true, autoPilotEnabled: enabled });
        return true;
      }

      if (action === "SET_ACTIVE_INTERVENTION" || action === "ACTIVE_INTERVENTION_UPDATED") {
        if (!widgetInstance && window.CelprosWidget) {
          initExtension();
        }
        if (widgetInstance && payload) {
          const didChange = widgetInstance.setSelectedIntervention(payload, false);
          if (didChange) {
            widgetInstance.showToast(
              `⚡ Données actualisées en direct (${payload.nom_client || "Dossier"}) !`,
              "info",
              3000
            );
            if (widgetInstance.canAutoFill()) {
              widgetInstance.handleAutofill(true);
            }
          }
          sendResponse({ ok: true, changed: didChange });
        } else {
          sendResponse({ ok: true, changed: false });
        }
        return true;
      }

      if (action === "PING") {
        sendResponse({ ok: true, url: window.location.href });
        return true;
      }

      sendResponse({ ok: false, error: "Action non gérée" });
      return true;
    });
  }

  // Lancement dès que le DOM est prêt
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initExtension);
  } else {
    initExtension();
  }
})();
