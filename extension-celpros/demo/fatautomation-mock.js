// Script compagnon pour la page de démo FAT Automation (conforme CSP Manifest V3, aucun script inline)

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btnFatSubmit");
  if (btn) {
    btn.addEventListener("click", () => {
      alert("Données FAT validées !");
    });
  }
});
