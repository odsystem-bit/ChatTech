// Script compagnon pour la page de démo CelPros (conforme CSP Manifest V3, aucun script inline)

document.addEventListener("DOMContentLoaded", () => {
  const logBox = document.getElementById("eventLogs");
  let eventCount = 0;

  function logEvent(e) {
    if (!logBox) return;
    eventCount++;
    const id = e.target.id || e.target.name || e.target.tagName;
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    const line = `[#${eventCount}] Événement '${e.type}' sur ${id} -> "${val}"`;
    const p = document.createElement("div");
    p.textContent = line;
    logBox.prepend(p);
  }

  const form = document.getElementById("celprosForm");
  if (form) {
    form.addEventListener("input", logEvent, true);
    form.addEventListener("change", logEvent, true);
  }

  const btnSubmit = document.getElementById("btnCelprosSubmit");
  if (btnSubmit) {
    btnSubmit.addEventListener("click", () => {
      alert("Formulaire validé avec succès !");
    });
  }
});
