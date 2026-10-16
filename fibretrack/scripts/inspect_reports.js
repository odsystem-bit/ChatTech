import { generateGlobalReport, generateConformiteReport } from "../src/lib/whatsapp.js";

async function main() {
  try {
    const res = await fetch("https://fibretrack.mantota.com/api/index.php?action=interventions_list_light&code=9999", {
      headers: { "X-User-Code": "9999" }
    });
    if (!res.ok) throw new Error("HTTP error " + res.status);
    const list = await res.json();
    console.log("Total fiches récupérées :", list.length);

    const terminees = list.filter((i) => i.statut === "termine" || i.etat === "PON" || i.date);
    console.log("Nombre d'interventions terminées/réalisées :", terminees.length);

    // Trier du plus récent au plus ancien
    terminees.sort((a, b) => {
      const da = new Date(a.date || a.modifie_le || 0).getTime();
      const db = new Date(b.date || b.modifie_le || 0).getTime();
      return db - da;
    });

    const toInspect = terminees.slice(0, 3);
    for (const light of toInspect) {
      console.log("\n========================================================");
      console.log(`Chargement fiche complète ID: ${light.id} - ${light.nom_client}`);
      console.log("========================================================");

      const fullRes = await fetch(`https://fibretrack.mantota.com/api/index.php?action=intervention_get&id=${light.id}&code=9999`, {
        headers: { "X-User-Code": "9999" }
      });
      const full = await fullRes.json();
      const intervention = full.data || full;

      console.log("\n--- RAPPORT GLOBAL (WhatsApp) ---");
      const global = generateGlobalReport(intervention, { realises: 1, recus: 1 });
      console.log(global);

      console.log("\n--- RAPPORT DE CONFORMITÉ ---");
      const conf = generateConformiteReport(intervention);
      console.log(conf);
    }
  } catch (err) {
    console.error("Erreur inspection:", err);
  }
}

main();
