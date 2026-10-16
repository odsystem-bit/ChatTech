// Génération des Rapports d'Intervention Fibre (WhatsApp & Conformité)
// 1. Rapport Global WhatsApp : Structure officielle complète avec puces en gras (*...*)
// 2. Rapport de Conformité : Structure épurée conforme aux audits terrain

export function fmt2(n) {
  const num = Number(n ?? 0);
  if (isNaN(num)) return "00";
  return num < 10 ? `0${num}` : String(num);
}

function toIsoDate(dateVal) {
  if (!dateVal) return new Date().toISOString().slice(0, 10);
  const dObj = new Date(dateVal);
  if (isNaN(dObj.getTime())) return String(dateVal).slice(0, 10);
  return dObj.toISOString().slice(0, 10);
}

function toFrDate(dateVal) {
  if (!dateVal) {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  }
  const dObj = new Date(dateVal);
  if (isNaN(dObj.getTime())) return String(dateVal);
  return `${String(dObj.getDate()).padStart(2, "0")}/${String(dObj.getMonth() + 1).padStart(2, "0")}/${dObj.getFullYear()}`;
}

function formatMsanFat(msan, fatRef) {
  const m = (msan || "").trim();
  const f = (fatRef || "").trim();
  if (!m && !f) return "";
  if (!m) return f.toUpperCase().includes("FAT") ? f : `FAT${f}`;
  if (!f) return m;

  // Si fatRef contient déjà le msan (ex: "SEM-PL02  FAT191" ou "SEM-PL02 FAT191")
  if (f.toLowerCase().includes(m.toLowerCase())) {
    return f.replace(new RegExp(`(${m})\\s*(FAT)`, "i"), "$1  $2");
  }
  // Si msan contient déjà fatRef
  if (m.toLowerCase().includes(f.toLowerCase())) {
    return m;
  }
  const fLabel = f.toUpperCase().startsWith("FAT") ? f : `FAT${f}`;
  return `${m}  ${fLabel}`;
}

function fmtMeter(v, fallback = 0) {
  const num = Number(v !== undefined && v !== null && v !== "" ? v : fallback);
  return isNaN(num) ? `${v}m` : `${num.toFixed(1)}m`;
}

function fmtPower(v, defaultVal = "") {
  if (v === undefined || v === null || v === "") return defaultVal ? `${defaultVal} dBm` : "";
  let num = Number(v);
  if (isNaN(num)) return `${v} dBm`;
  if (num > 0) num = -num;
  return `${num.toFixed(2)} dBm`;
}

function isPoleArme(p) {
  if (!p) return false;
  return Boolean(p.arme || p.armed) || ["armé", "arme"].includes(String(p.sous_type || "").toLowerCase().trim());
}

function isPoleImplante(p) {
  if (!p) return false;
  return Boolean(p.implante || p.implanted) || ["implanté", "implante"].includes(String(p.sous_type || "").toLowerCase().trim());
}

function isPoleTraverse(p) {
  if (!p) return false;
  if (Boolean(p.traverse || p.traversed)) return true;
  if (isPoleImplante(p)) return false;
  return ["traversé", "traverse", ""].includes(String(p.sous_type || "").toLowerCase().trim());
}

function isSbeePole(p) {
  if (!p) return false;
  const txt = `${p.proprietaire || ""} ${p.type_poteau || ""} ${p.nom || ""}`.toLowerCase();
  return txt.includes("sbee");
}

function isPetitJeanPole(p) {
  if (!p) return false;
  const txt = `${p.proprietaire || ""} ${p.type_poteau || ""} ${p.nom || ""}`.toLowerCase();
  return txt.includes("petit") || txt.includes("jean") || txt.includes("pj");
}

function getGpsCoordinatesString(p) {
  if (!p) return "";
  const lat = p.lat ?? p.latitude;
  const lng = p.lng ?? p.longitude;
  if (lat == null || lng == null) return "";
  return `${lat},${lng}`;
}

/**
 * 1. RAPPORT GLOBAL WHATSAPP
 * Génère le rapport d'intervention complet selon la structure exacte attendue par l'équipe.
 * @param {import("../models/Intervention").Intervention} intervention
 * @param {{realises?: number, recus?: number}} compteurJour
 * @returns {string}
 */
export function generateGlobalReport(intervention, compteurJour = {}) {
  const d = intervention || {};
  const mp = d.materiel_pose && typeof d.materiel_pose === "object" ? d.materiel_pose : {};
  const val = (key) => fmt2(mp[key]);

  const dateIso = toIsoDate(d.date);
  const msanFat = formatMsanFat(d.msan, d.fat_ref);

  const pts = Array.isArray(d.points_gps) ? d.points_gps : [];
  const directPoles = Array.isArray(d.poteaux) ? d.poteaux : [];
  const gpsPoles = pts.filter((p) => p && String(p.type || "").toLowerCase() === "poteau");
  const poles = directPoles.length > 0 ? directPoles : gpsPoles;

  const poteauxTraverses = poles.filter(isPoleTraverse);
  const poteauxImplantes = poles.filter(isPoleImplante);
  const poteauxArmes = poles.filter(isPoleArme);

  const abonnePt = pts.find((p) => p && ["abonné", "abonne", "client"].includes(String(p.type || "").toLowerCase()));
  const fatPt = pts.find((p) => p && String(p.type || "").toLowerCase() === "fat");

  const latAbonne = abonnePt ? getGpsCoordinatesString(abonnePt) : (d.latitude && d.longitude ? `${d.latitude},${d.longitude}` : "");
  const latFat = fatPt ? getGpsCoordinatesString(fatPt) : (d.latitude_fat && d.longitude_fat ? `${d.latitude_fat},${d.longitude_fat}` : "");

  const nbArmes = d.nb_poteaux_armes ?? poteauxArmes.length;
  const nbTraverses = d.nb_poteaux_traverses ?? (poteauxTraverses.length || (poles.length - poteauxImplantes.length));
  const nbImplantes = d.nb_poteaux_implantes ?? poteauxImplantes.length;

  const chefEquipe = d.nom_technicien || d.nom_equipe || "Chef d'équipe";

  // Gestion des câbles CPC
  const cpcSizes = [50, 100, 150, 200, 250, 300, 350];
  const lin = Number(d.lineaire_m || 0);
  const getCpcVal = (size) => {
    const explicit = mp[`cpc_${size}`] ?? mp[`cpc${size}`];
    if (explicit !== undefined && explicit !== null && explicit !== "") {
      return fmt2(explicit);
    }
    const hasAnyCpc = cpcSizes.some((s) => mp[`cpc_${s}`] || mp[`cpc${s}`]);
    if (!hasAnyCpc && lin > 0 && lin === size) {
      return "01";
    }
    return "00";
  };

  const ontQte = mp.ont ?? d.ont_qte ?? (d.sn || d.ont_livre ? 1 : 1);
  const ptoQte = mp.pto ?? d.pto_qte ?? 1;
  const jarretiereQte = mp.jarretiere ?? (d.jarretiere ? 1 : 1);

  const lignes = [
    `*Chef d'Équipe : ${chefEquipe}*`,
    ``,
    `*${fmt2(compteurJour?.realises)} Réalisés / ${fmt2(compteurJour?.recus)} Reçus*`,
    ``,
    `*RACCORDEMENT*`,
    ``,
    `*${dateIso}*`,
    ``,
    `*Client: ${d.nom_client || ""}*`,
    ``,
    `*Etat:${d.etat || "PON"}*`,
    ``,
    `*Msan: ${msanFat}*`,
    ``,
    `*Port:${d.port || ""}*`,
    `*Ports disponibles: ${d.ports_disponibles || (d.port_disponible ? `Port ${d.port_disponible}` : "")}*`,
    `*Type de câble : ${d.type_cable || "CPC"}*`,
    `*Départ :${fmtMeter(d.depart_m, 0)}*`,
    `*Arrivée :${fmtMeter(d.arrivee_m, lin || 0)}*`,
    `*Linéaire:${fmtMeter(d.lineaire_m, lin || 0)}*`,
    `*Puissance FAT: ${fmtPower(d.puissance_fat_dbm, "-19.00")}*`,
    `*Puissance PTO: ${fmtPower(d.puissance_pto_dbm, "-19.00")}*`,
    `*MAC: ${d.mac || ""}*`,
    `*SN : ${d.sn || d.ont_sn || ""}*`,
    `*Nombre de poteaux armés : ${fmt2(nbArmes)}*`,
    `*Nombre de poteaux traversés : ${fmt2(nbTraverses)}*`,
    `*Nombre de poteaux implantés: ${fmt2(nbImplantes)}*`,
    `*ONT: ${fmt2(ontQte)}*`,
    `*PTO: ${fmt2(ptoQte)}*`,
    `*Jarretière: ${fmt2(jarretiereQte)}*`,
    `*Pince:${val("pince")}*`,
    `*Crochets:${val("crochets")}*`,
    `*Susp: ${val("susp")}*`,
    `*Piton: ${val("piton")}*`,
    `*Cheville: ${val("cheville")}*`,
    `*Connecteur: ${val("connecteur")}*`,
    `*Closer: ${val("closer")}*`,
    `*Câble Fibre 1FO: ${val("cable_1fo") !== "00" ? val("cable_1fo") : val("cable_fibre_1fo")}*`,
    `*Ligne: ${d.telephone_ligne || ""}*`,
    `*Mobile:${d.mobile || ""}*`,
    `*Traverse 13T: ${val("traverse_13t")}*`,
    `*Traverse 15T: ${val("traverse_15t")}*`,
    `*CPC 50: ${getCpcVal(50)}*`,
    `*CPC 100: ${getCpcVal(100)}*`,
    `*CPC 150: ${getCpcVal(150)}*`,
    `*CPC 200: ${getCpcVal(200)}*`,
    `*CPC 250: ${getCpcVal(250)}*`,
    `*CPC 300: ${getCpcVal(300)}*`,
    `*CPC 350: ${getCpcVal(350)}*`,
    ``,
    `*GPS Poteaux traversés*`,
  ];

  // Regroupement des poteaux traversés par propriétaire
  const sbeeTraverses = poteauxTraverses.filter(isSbeePole);
  const pjTraverses = poteauxTraverses.filter(isPetitJeanPole);
  const otherTraverses = poteauxTraverses.filter((p) => !isSbeePole(p) && !isPetitJeanPole(p));

  // Poteaux SBEE
  lignes.push(`*GPS poteaux SBEE*`);
  if (sbeeTraverses.length > 0) {
    sbeeTraverses.forEach((p, idx) => {
      const num = p.numero || idx + 1;
      lignes.push(`*GPS PT${num}: ${getGpsCoordinatesString(p)}*`);
    });
  } else if (poteauxTraverses.length > 0 && pjTraverses.length === 0) {
    // Si aucun propriétaire n'a été spécifié sur les poteaux, ils sont traités par défaut comme SBEE
    poteauxTraverses.forEach((p, idx) => {
      const num = p.numero || idx + 1;
      lignes.push(`*GPS PT${num}: ${getGpsCoordinatesString(p)}*`);
    });
  }
  lignes.push(``);

  // Poteaux Petit Jean
  if (pjTraverses.length > 0) {
    lignes.push(`*GPS poteaux Petit Jean*`);
    pjTraverses.forEach((p, idx) => {
      const num = p.numero || sbeeTraverses.length + idx + 1;
      lignes.push(`*GPS PT${num}: ${getGpsCoordinatesString(p)}*`);
    });
    lignes.push(``);
  }

  // Autres poteaux
  if (otherTraverses.length > 0) {
    lignes.push(`*GPS autres poteaux*`);
    otherTraverses.forEach((p, idx) => {
      const num = p.numero || idx + 1;
      lignes.push(`*GPS PT${num}: ${getGpsCoordinatesString(p)}*`);
    });
    lignes.push(``);
  }

  // Poteaux Armés
  lignes.push(`*Poteaux armés : ${fmt2(nbArmes)}*`);
  if (poteauxArmes.length > 0) {
    lignes.push(`*GPS poteaux armés*`);
    poteauxArmes.forEach((p, idx) => {
      const num = p.numero || idx + 1;
      lignes.push(`*GPS PT${num}: ${getGpsCoordinatesString(p)}*`);
    });
  }
  lignes.push(``);

  // Poteaux Implantés
  lignes.push(`*Poteaux implanté : ${fmt2(nbImplantes)}*`);
  if (poteauxImplantes.length > 0) {
    lignes.push(`*GPS poteaux implantés*`);
    poteauxImplantes.forEach((p, idx) => {
      const num = p.numero || idx + 1;
      lignes.push(`*GPS PT${num}: ${getGpsCoordinatesString(p)}*`);
    });
  }
  lignes.push(``);

  // Points Abonné & FAT
  lignes.push(`*GPS abonné: ${latAbonne}*`);
  lignes.push(``);
  lignes.push(`*GPS FAT: ${latFat}*`);

  return lignes.join("\n");
}

/**
 * 2. RAPPORT DE CONFORMITÉ
 * Génère le rapport de synthèse et conformité selon la structure officielle fournie par l'utilisateur.
 * @param {import("../models/Intervention").Intervention} intervention
 * @returns {string}
 */
export function generateConformiteReport(intervention) {
  const d = intervention || {};
  const dateFr = toFrDate(d.date);
  const msanFat = formatMsanFat(d.msan, d.fat_ref);

  const pts = Array.isArray(d.points_gps) ? d.points_gps : [];
  const directPoles = Array.isArray(d.poteaux) ? d.poteaux : [];
  const gpsPoles = pts.filter((p) => p && String(p.type || "").toLowerCase() === "poteau");
  const poles = directPoles.length > 0 ? directPoles : gpsPoles;

  const poteauxTraverses = poles.filter(isPoleTraverse);
  const poteauxImplantes = poles.filter(isPoleImplante);
  const poteauxArmes = poles.filter(isPoleArme);

  const sbeePoles = poteauxTraverses.filter(isSbeePole);
  const pjPoles = poteauxTraverses.filter(isPetitJeanPole);

  const countSbee = sbeePoles.length || (poteauxTraverses.length > 0 && pjPoles.length === 0 ? poteauxTraverses.length : 0);
  const countPj = pjPoles.length;

  const abonnePt = pts.find((p) => p && ["abonné", "abonne", "client"].includes(String(p.type || "").toLowerCase()));
  const fatPt = pts.find((p) => p && String(p.type || "").toLowerCase() === "fat");

  const latAbonne = abonnePt ? `${abonnePt.lat}, ${abonnePt.lng}` : (d.latitude && d.longitude ? `${d.latitude}, ${d.longitude}` : "");
  const latFat = fatPt ? `${fatPt.lat}, ${fatPt.lng}` : (d.latitude_fat && d.longitude_fat ? `${d.latitude_fat}, ${d.longitude_fat}` : "");

  const nbArmes = d.nb_poteaux_armes ?? poteauxArmes.length;
  const nbTraverses = d.nb_poteaux_traverses ?? (poteauxTraverses.length || (poles.length - poteauxImplantes.length));
  const nbImplantes = d.nb_poteaux_implantes ?? poteauxImplantes.length;

  const equipeName = d.nom_technicien || d.nom_equipe || "RODOLPHO";
  const lin = d.lineaire_m || 0;

  const lignes = [
    `Équipe : ${equipeName}`,
    ``,
    `${dateFr}`,
    ``,
    `RACCORDEMENT — CONFORMITÉ`,
    ``,
    `Client : ${d.nom_client || ""}`,
    ``,
    `Ligne : ${d.telephone_ligne || ""}`,
    ``,
    `MSAN : ${msanFat}`,
    ``,
    `Linéaire : ${lin} m`,
    ``,
    `GPS FAT : ${latFat}`,
    ``,
    `GPS abonné : ${latAbonne}`,
    ``,
    `Poteaux traversés : ${fmt2(nbTraverses)}`,
    ``,
    `Poteaux SBEE : ${fmt2(countSbee)}`,
    ``,
    `${countPj > 1 ? "Poteaux" : "Poteau"} Petit Jean : ${fmt2(countPj)}`,
    ``,
    `Poteaux implantés : ${fmt2(nbImplantes)}`,
    ``,
    `Poteaux armés : ${fmt2(nbArmes)}`,
  ];

  // Liste GPS poteaux SBEE
  const displaySbee = sbeePoles.length > 0 ? sbeePoles : (poles.length > 0 && pjPoles.length === 0 ? poles : []);
  if (displaySbee.length > 0) {
    lignes.push(``);
    lignes.push(`GPS poteaux SBEE :`);
    lignes.push(``);
    displaySbee.forEach((p, idx) => {
      const num = p.numero || idx + 1;
      const lat = p.lat ?? p.latitude;
      const lng = p.lng ?? p.longitude;
      lignes.push(`- PT${num} : ${lat}, ${lng}`);
    });
  }

  // Liste GPS poteaux armés
  if (poteauxArmes.length > 0) {
    lignes.push(``);
    lignes.push(`GPS poteaux armés :`);
    lignes.push(``);
    poteauxArmes.forEach((p, idx) => {
      const num = p.numero || idx + 1;
      const lat = p.lat ?? p.latitude;
      const lng = p.lng ?? p.longitude;
      lignes.push(`- Poteau (Armé) ${num} : ${lat}, ${lng}`);
    });
  }

  // Liste ou ligne unique GPS Petit Jean
  if (pjPoles.length === 1) {
    const lat = pjPoles[0].lat ?? pjPoles[0].latitude;
    const lng = pjPoles[0].lng ?? pjPoles[0].longitude;
    lignes.push(``);
    lignes.push(`GPS poteau Petit Jean : ${lat}, ${lng}`);
  } else if (pjPoles.length > 1) {
    lignes.push(``);
    lignes.push(`GPS poteaux Petit Jean :`);
    lignes.push(``);
    pjPoles.forEach((p, idx) => {
      const num = p.numero || idx + 1;
      const lat = p.lat ?? p.latitude;
      const lng = p.lng ?? p.longitude;
      lignes.push(`- PT${num} : ${lat}, ${lng}`);
    });
  }

  return lignes.join("\n");
}

/**
 * Alias de compatibilité pour le code existant
 */
export const generateWhatsAppReport = generateGlobalReport;

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
