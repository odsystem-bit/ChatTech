// Content Script Entry Point pour ChapTech CelPros
// Démarre automatiquement sur les pages cibles CelPros et FAT Automation

(function () {
  "use strict";

  console.log("[ChapTech CelPros] Content script chargé sur :", window.location.href);

  let widgetInstance = null;

  function initExtension() {
    if (widgetInstance) return;

    if (window.CelprosWidget) {
      widgetInstance = new window.CelprosWidget();
      widgetInstance.init();
      console.log("[ChapTech CelPros] Widget initialisé avec succès !");
    } else {
      console.warn("[ChapTech CelPros] CelprosWidget introuvable au chargement initial. Nouvelle tentative...");
      setTimeout(initExtension, 250);
    }
  }

  // Écoute des messages venant du Popup ou du Service Worker
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const { action, payload } = request || {};

      if (action === "TRIGGER_AUTOFILL") {
        if (widgetInstance) {
          widgetInstance.handleAutofill();
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: "Widget non initialisé" });
        }
        return true;
      }

      if (action === "SET_ACTIVE_INTERVENTION" || action === "ACTIVE_INTERVENTION_UPDATED") {
        if (widgetInstance && payload) {
          widgetInstance.setSelectedIntervention(payload, false);
          sendResponse({ ok: true });
        }
        return true;
      }

      if (action === "PING") {
        sendResponse({ ok: true, url: window.location.href });
        return true;
      }
    });
  }

  // Lancement dès que le DOM est prêt
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initExtension);
  } else {
    initExtension();
  }
})();
