// Bridge de synchronisation temps réel entre FibreTrack et l'extension CelPros
(function () {
  "use strict";

  console.log("[ChapTech CelPros Bridge] En écoute sur FibreTrack pour synchronisation instantanée...");

  let lastSentId = null;
  let lastSentTime = 0;
  let lastSentFingerprint = "";

  function getInterventionFingerprint(item) {
    if (!item || typeof item !== "object" || !item.id) return "";
    const waCount = Array.isArray(item.whatsapp_photos) ? item.whatsapp_photos.length : 0;
    const gpsCount = Array.isArray(item.points_gps) ? item.points_gps.length : 0;
    const waIds = Array.isArray(item.whatsapp_photos)
      ? item.whatsapp_photos.map((p) => `${p?.id || ""}:${p?.slot || ""}:${(p?.url || "").slice(-24)}`).join("|")
      : "";
    const gpsIds = Array.isArray(item.points_gps)
      ? item.points_gps.map((p) => `${p?.id || ""}:${p?.type || ""}:${p?.numero || ""}:${p?.lat || ""}:${p?.lng || ""}`).join("|")
      : "";
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
      waCount,
      gpsCount,
      waIds,
      gpsIds,
      JSON.stringify(item.materiel_pose || {}),
    ].join("::");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event || !event.data) return;
    if (event.data.type === "FIBRETRACK_INTERVENTION_UPDATED" && event.data.intervention) {
      const item = event.data.intervention;
      if (!item || !item.id) return;
      const now = Date.now();
      const fp = getInterventionFingerprint(item);

      // Ignorer si l'intervention est strictement identique ou envoyée il y a moins de 400ms
      if (fp && fp === lastSentFingerprint) return;
      if (lastSentId === item.id && now - lastSentTime < 400) return;

      lastSentId = item.id;
      lastSentTime = now;
      lastSentFingerprint = fp;

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

