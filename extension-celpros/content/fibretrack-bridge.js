// Bridge de synchronisation temps réel entre FibreTrack et l'extension CelPros
(function () {
  "use strict";

  console.log("[ChapTech CelPros Bridge] En écoute sur FibreTrack pour synchronisation instantanée...");

  let lastSentId = null;
  let lastSentTime = 0;

  window.addEventListener("message", (event) => {
    if (!event || !event.data) return;
    if (event.data.type === "FIBRETRACK_INTERVENTION_UPDATED" && event.data.intervention) {
      const item = event.data.intervention;
      const now = Date.now();
      // Anti-rebond : max 1 envoi toutes les 200ms pour le même ID
      if (lastSentId === item.id && now - lastSentTime < 200) return;
      lastSentId = item.id;
      lastSentTime = now;

      console.log("[ChapTech CelPros Bridge] ⚡ Synchronisation immédiate vers l'extension :", item.nom_client || item.id);
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(
          {
            action: "FIBRETRACK_UPDATE_BROADCAST",
            payload: item,
          },
          () => {
            if (chrome.runtime.lastError) {
              /* ignorer silencieusement si extension déconnectée */
            }
          }
        );
      }
    }
  });
})();
