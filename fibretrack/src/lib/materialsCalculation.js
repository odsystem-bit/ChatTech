/**
 * Module de calcul automatique et dynamique des matériaux pour FibreTrack.
 *
 * Règles métier :
 * - Poteau linéaire : 2 crochets par poteau
 * - Poteau FAT : 1 crochet par poteau
 * - Piton : 1 unité obligatoire par client
 * - Cheville : 1 unité par défaut par client (utilisée lors de la pose du piton)
 * - ONT : valeur par défaut de 1 (pas d'OTP)
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
 *   cheville: number,
 *   pto: number,
 *   ont: number,
 *   otp: number,
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
      cheville: 1,
      pto: 1,
      otp: 1,
      ont: 1,
      formula: "0 poteau inséré = 0 crochet",
    };
  }

  const d = intervention;
  const pts = Array.isArray(d.points_gps) ? d.points_gps : [];
  const poles = pts.filter((p) => p && String(p.type || "").trim().toLowerCase() === "poteau");

  // Détection si un FAT est présent (référence fat_ref ou point GPS de type FAT)
  const hasFat = Boolean(
    String(d.fat_ref || "").trim() ||
    pts.some((p) => p && String(p.type || "").trim().toUpperCase() === "FAT")
  );

  // Détection explicite d'un poteau FAT parmi les poteaux insérés
  const isFatPole = (p) => {
    if (!p) return false;
    const st = String(p.sous_type || "").trim().toLowerCase();
    const tp = String(p.type_poteau || p.proprietaire || p.nom || "").trim().toLowerCase();
    return st.includes("fat") || tp.includes("fat") || Boolean(p.is_poteau_fat);
  };

  const explicitFatPoles = poles.filter(isFatPole).length;
  let nbFatPoles = explicitFatPoles;
  let nbLinearPoles = Math.max(0, poles.length - explicitFatPoles);

  // Fallback si aucun point GPS mais compteur déclaré nb_poteaux_traverses
  if (poles.length === 0 && Number(d.nb_poteaux_traverses ?? 0) > 0) {
    nbLinearPoles = Number(d.nb_poteaux_traverses);
  }

  // Règle métier : Le boîtier FAT est toujours placé sur un poteau (généralement le premier poteau).
  // Et il prend 1 crochet.
  if (nbFatPoles === 0) {
    const totalPolesCount = poles.length || nbLinearPoles;
    if (totalPolesCount > 0) {
      // S'il y a des poteaux et qu'aucun n'est explicitement marqué FAT :
      // Le premier poteau est le Poteau FAT (1 crochet), les suivants sont linéaires (2 crochets chacun)
      nbFatPoles = 1;
      nbLinearPoles = Math.max(0, totalPolesCount - 1);
    } else if (hasFat) {
      // 0 poteau intermédiaire mais le boîtier FAT est présent (placé sur son poteau FAT)
      nbFatPoles = 1;
      nbLinearPoles = 0;
    }
  }

  // Matériel posé existant
  const mp = (d.materiel_pose && typeof d.materiel_pose === "object") ? d.materiel_pose : {};

  // Piton : 1 obligatoire par client
  const piton = mp.piton !== undefined && mp.piton !== null && mp.piton !== "" ? Number(mp.piton) : 1;

  // Cheville : 1 par défaut par client (utilisée lors de la pose du piton, modifiable à 0 en cas exceptionnel)
  const cheville = mp.cheville !== undefined && mp.cheville !== null && mp.cheville !== "" ? Number(mp.cheville) : 1;

  // PTO : 1 par défaut
  const pto = mp.pto !== undefined && mp.pto !== null && mp.pto !== ""
    ? Number(mp.pto)
    : (d.pto_qte !== undefined && d.pto_qte !== null && d.pto_qte !== "" ? Number(d.pto_qte) : 1);

  // ONT : 1 par défaut (pas d'OTP)
  const ont = (mp.ont !== undefined && mp.ont !== null && mp.ont !== "")
    ? Number(mp.ont)
    : ((mp.otp !== undefined && mp.otp !== null && mp.otp !== "")
      ? Number(mp.otp)
      : (d.ont_qte !== undefined && d.ont_qte !== null && d.ont_qte !== "" ? Number(d.ont_qte) : 1));

  // Règle de calcul :
  // 1 poteau FAT (ou boîtier FAT présent) = 1 crochet
  // 1 poteau linéaire = 2 crochets
  // 1 piton = 1 crochet
  const totalPoles = nbLinearPoles + nbFatPoles;
  let totalCrochets = 0;
  let formula = "";

  if (totalPoles === 0 && !hasFat) {
    totalCrochets = 0;
    formula = "0 poteau inséré = 0 crochet";
  } else {
    const crochetsPoles = (nbLinearPoles * 2) + (nbFatPoles * 1);
    const crochetsPiton = Math.max(0, piton * 1);
    totalCrochets = crochetsPoles + crochetsPiton;

    const parts = [];
    if (nbFatPoles > 0) parts.push(`${nbFatPoles} FAT × 1`);
    if (nbLinearPoles > 0) parts.push(`${nbLinearPoles} lin. × 2`);
    if (crochetsPiton > 0) parts.push(`${piton} piton × 1`);
    formula = `${parts.join(" + ")} = ${totalCrochets} crochets`;
  }

  return {
    crochets: totalCrochets,
    nbLinearPoles,
    nbFatPoles,
    piton,
    cheville,
    pto,
    otp: ont,
    ont,
    formula,
  };
}
