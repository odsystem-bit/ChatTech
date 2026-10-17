/**
 * Module de calcul automatique et dynamique des matériaux pour FibreTrack.
 *
 * Règles métier :
 * - Poteau linéaire : 2 crochets par poteau
 * - Poteau FAT : 1 crochet par poteau
 * - Piton : 1 unité obligatoire par client
 * - OTP : valeur par défaut de 1
 * - PTO : valeur par défaut de 1
 */

/**
 * Calcule automatiquement les quantités de matériaux recommandées pour une intervention.
 *
 * @param {Object} intervention
 * @returns {{
 *   crochets: number,
 *   nbLinearPoles: number,
 *   nbFatPoles: number,
 *   piton: number,
 *   pto: number,
 *   otp: number,
 *   ont: number,
 *   formula: string
 * }}
 */
export function calculateMaterials(intervention) {
  if (!intervention) {
    return {
      crochets: 0,
      nbLinearPoles: 0,
      nbFatPoles: 0,
      piton: 1,
      pto: 1,
      otp: 1,
      ont: 1,
      formula: "0 poteau = 0 crochet",
    };
  }

  const d = intervention;
  const pts = Array.isArray(d.points_gps) ? d.points_gps : [];
  const poles = pts.filter((p) => p && String(p.type || "").trim().toLowerCase() === "poteau");

  // Détection explicite d'un poteau FAT dans la liste des poteaux
  const isFatPole = (p) => {
    if (!p) return false;
    const st = String(p.sous_type || "").trim().toLowerCase();
    const tp = String(p.type_poteau || p.proprietaire || p.nom || "").trim().toLowerCase();
    return st.includes("fat") || tp.includes("fat") || Boolean(p.is_poteau_fat);
  };

  const explicitFatPoles = poles.filter(isFatPole).length;

  // Détection d'un point FAT ou d'une référence FAT dans l'intervention
  const hasFatPoint = pts.some((p) => p && String(p.type || "").trim().toUpperCase() === "FAT");
  const hasFatField = Boolean(
    d.fat_ref ||
    d.latitude_fat ||
    (Array.isArray(d.whatsapp_photos) && d.whatsapp_photos.some((w) => w?.slot === "fat" && w?.url))
  );

  let nbFatPoles = 0;
  if (explicitFatPoles > 0) {
    nbFatPoles = explicitFatPoles;
  } else if (hasFatPoint || hasFatField) {
    nbFatPoles = 1;
  }

  let nbLinearPoles = 0;
  if (poles.length > 0) {
    if (explicitFatPoles > 0) {
      nbLinearPoles = Math.max(0, poles.length - explicitFatPoles);
    } else {
      // Si le FAT est un point GPS dédié, tous les points Poteau sont des poteaux linéaires
      nbLinearPoles = poles.length;
    }
  } else {
    // Fallback : compteur déclaratif nb_poteaux_traverses
    const rawTraverses = Number(d.nb_poteaux_traverses ?? 0);
    nbLinearPoles = Math.max(0, rawTraverses);
  }

  // Si aucun poteau du tout et aucun FAT
  if (nbLinearPoles === 0 && !hasFatPoint && !hasFatField && explicitFatPoles === 0) {
    nbFatPoles = 0;
  }

  // Règle de calcul : 2 crochets par poteau linéaire, 1 crochet par poteau FAT
  const totalCrochets = (nbLinearPoles * 2) + (nbFatPoles * 1);

  // Formule lisible pour l'UI
  let formula = "";
  if (totalCrochets === 0) {
    formula = "0 poteau = 0 crochet";
  } else if (nbLinearPoles > 0 && nbFatPoles > 0) {
    formula = `${nbLinearPoles} lin. × 2 + ${nbFatPoles} FAT × 1 = ${totalCrochets} crochets`;
  } else if (nbLinearPoles > 0) {
    formula = `${nbLinearPoles} lin. × 2 = ${totalCrochets} crochets`;
  } else {
    formula = `${nbFatPoles} FAT × 1 = ${totalCrochets} crochet`;
  }

  // Matériel posé existant
  const mp = (d.materiel_pose && typeof d.materiel_pose === "object") ? d.materiel_pose : {};

  // Piton : 1 obligatoire par client
  const piton = mp.piton !== undefined && mp.piton !== null && mp.piton !== "" ? Number(mp.piton) : 1;

  // PTO : 1 par défaut
  const pto = mp.pto !== undefined && mp.pto !== null && mp.pto !== ""
    ? Number(mp.pto)
    : (d.pto_qte !== undefined && d.pto_qte !== null && d.pto_qte !== "" ? Number(d.pto_qte) : 1);

  // OTP / ONT : 1 par défaut
  const otp = mp.otp !== undefined && mp.otp !== null && mp.otp !== ""
    ? Number(mp.otp)
    : (mp.ont !== undefined && mp.ont !== null && mp.ont !== ""
      ? Number(mp.ont)
      : (d.ont_qte !== undefined && d.ont_qte !== null && d.ont_qte !== "" ? Number(d.ont_qte) : 1));

  return {
    crochets: totalCrochets,
    nbLinearPoles,
    nbFatPoles,
    piton,
    pto,
    otp,
    ont: otp,
    formula,
  };
}
