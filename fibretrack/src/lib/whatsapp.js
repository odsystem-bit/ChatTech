// Génération du rapport WhatsApp
// Format fidèle au modèle réel utilisé par l'équipe (fourni par l'utilisateur) :
// une ligne `*Champ: valeur*` par donnée, points GPS regroupés par catégorie
// (poteaux traversés par propriétaire, poteaux implantés, abonné, FAT).

function fmt2(n) {
  const num = Number(n ?? 0);
  return num < 10 ? `0${num}` : String(num);
}

/**
 * @param {import("../models/Intervention").Intervention} intervention
 * @param {{realises: number, recus: number}} compteurJour
 * @returns {string}
 */
export function generateWhatsAppReport(intervention, compteurJour) {
  const d = intervention;
  const dateStr = new Date(d.date).toLocaleDateString();
  const mp = d.materiel_pose || {};
  const val = (key) => fmt2(mp[key]);

  const poteauxTraverses = d.points_gps.filter((p) => p.type === "Poteau" && p.sous_type === "Traversé");
  const poteauxImplantes = d.points_gps.filter((p) => p.type === "Poteau" && p.sous_type === "Implanté");
  const poteauxArmes = d.points_gps.filter((p) => p.type === "Poteau" && p.sous_type === "Armé");
  const abonne = d.points_gps.find((p) => p.type === "Abonné");
  const fat = d.points_gps.find((p) => p.type === "FAT");

  const proprietairesOrder = [];
  for (const p of poteauxTraverses) {
    const prop = p.proprietaire || "Autre";
    if (!proprietairesOrder.includes(prop)) proprietairesOrder.push(prop);
  }

  const portsDisponibles = d.ports_disponibles || (d.port_disponible ? `${d.port_disponible} port(s)` : "");

  const lignes = [
    `*Chef d'Équipe : ${d.nom_technicien || ""}*`,
    ``,
    `*${fmt2(compteurJour.realises)} Réalisés / ${fmt2(compteurJour.recus)} Reçus*`,
    ``,
    `*RACCORDEMENT*`,
    ``,
    `*${dateStr}*`,
    ``,
    `*Client: ${d.nom_client || ""}*`,
    ``,
    `*Etat:${d.etat}*`,
    ``,
    `*Msan: ${d.msan || ""} ${d.fat_ref || ""}*`,
    ``,
    `*Port:${d.port || ""}*`,
    `*Ports disponibles: ${portsDisponibles}*`,
    `*Type de câble : ${d.type_cable || ""}*`,
    `*Départ :${d.depart_m}m*`,
    `*Arrivée :${d.arrivee_m}m*`,
    `*Linéaire:${d.lineaire_m}m*`,
    `*Puissance FAT: ${d.puissance_fat_dbm} dBm*`,
    `*Puissance PTO: ${d.puissance_pto_dbm} dBm*`,
    `*MAC: ${d.mac || ""}*`,
    `*SN : ${d.sn || ""}*`,
    `*Nombre de poteaux traversés : ${fmt2(d.nb_poteaux_traverses)}*`,
    `*Nombre de poteaux implantés: ${fmt2(d.nb_poteaux_implantes)}*`,
    `*Nombre de poteaux armés: ${fmt2(d.nb_poteaux_armes ?? poteauxArmes.length)}*`,
    `*Rue: ${val("rue")}*`,
    `*Pince:${val("pince")}*`,
    `*Crochets:${val("crochets")}*`,
    `*Susp: ${val("susp")}*`,
    `*Piton: ${val("piton")}*`,
    `*Closer: ${val("closer")}*`,
    `*RP1: ${val("rp1")}*`,
    `*Ligne: ${d.telephone_ligne || ""}*`,
    `*Mobile:${d.mobile || ""}*`,
    `*Traverse 13T: ${val("traverse_13t")}*`,
    `*Traverse 15T: ${val("traverse_15t")}*`,
    `*Semelle Eq: ${val("semelle_eq")}*`,
    `*Poteau SBEE non armé : ${val("poteau_sbee_non_arme")}*`,
    `*Poteau SBEE armé:${val("poteau_sbee_arme")}*`,
    `*Poteaux armé: ${val("poteau_sbee_arme")}*`,
    ``,
    `*GPS Poteaux traversés*`,
  ];

  for (const prop of proprietairesOrder) {
    lignes.push(`*GPS poteaux ${prop}*`);
    for (const p of poteauxTraverses.filter((pt) => (pt.proprietaire || "Autre") === prop)) {
      lignes.push(`*GPS PT${p.numero}: ${p.lat},${p.lng}*`);
    }
    lignes.push(``);
  }

  lignes.push(`*Poteaux implanté : ${fmt2(d.nb_poteaux_implantes)}*`);
  if (poteauxImplantes.length > 0) {
    lignes.push(`*GPS poteaux implantés*`);
    for (const p of poteauxImplantes) {
      lignes.push(`*GPS PT${p.numero}: ${p.lat},${p.lng}*`);
    }
  }
  lignes.push(``);

  lignes.push(`*Poteaux armé : ${fmt2(d.nb_poteaux_armes ?? poteauxArmes.length)}*`);
  if (poteauxArmes.length > 0) {
    lignes.push(`*GPS poteaux armés*`);
    for (const p of poteauxArmes) {
      lignes.push(`*GPS PT${p.numero}: ${p.lat},${p.lng}*`);
    }
  }
  lignes.push(``);

  lignes.push(`*GPS abonné: ${abonne ? `${abonne.lat},${abonne.lng}` : ""}*`);
  lignes.push(``);
  lignes.push(`*GPS FAT: ${fat ? `${fat.lat},${fat.lng}` : ""}*`);

  return lignes.join("\n").replace(/\*/g, "");
}

/**
 * Compte les interventions : réalisées = terminées aujourd'hui, reçues = total dossiers reçus (toutes dates).
 * @param {import("../models/Intervention").Intervention[]} interventions
 * @returns {{realises: number, recus: number}}
 */
export function computeDailyCount(interventions) {
  const today = new Date().toDateString();
  return {
    realises: interventions.filter(
      (i) => i.statut === "termine" && new Date(i.date).toDateString() === today
    ).length,
    recus: interventions.length,
  };
}
