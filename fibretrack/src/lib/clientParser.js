/**
 * Parseur intelligent pour la saisie rapide des informations client.
 * Extrait automatiquement :
 * - Nom du client (nom_client)
 * - Numéro de ligne (telephone_ligne)
 * - Numéro de téléphone / mobile (mobile)
 * Et facultativement si présents dans le message :
 * - MSAN (msan)
 * - Référence FAT (fat_ref)
 * 
 * Règles :
 * - Préserve rigoureusement les zéros initiaux des numéros (traitement sous forme de texte).
 * - Accepte les formats structurés avec libellés/parenthèses : NOM(...), Ligne(...), Tél(...)
 * - Accepte les formats tabulaires (copiés-collés d'Excel, messages colonnés, séparés par tabulations ou espaces).
 * - Gère les variations de libellés (Client, Nom, N° Ligne, ND, Tél, Mobile, etc.).
 */

function cleanSpaces(str) {
  if (!str) return "";
  return String(str).replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ").trim();
}

function cleanPhoneString(str) {
  if (!str) return "";
  // Retirer les espaces internes, tirets, points mais garder le '+' et tous les zéros initiaux
  const cleaned = String(str).trim().replace(/[\s\.\-_]/g, "");
  // Vérifier si c'est un format téléphonique valide (au moins 6 chiffres)
  if (/^\+?\d{6,15}$/.test(cleaned)) {
    return cleaned;
  }
  return "";
}

export function parseClientInfo(rawText) {
  const result = {
    nom_client: "",
    telephone_ligne: "",
    mobile: "",
    msan: "",
    fat_ref: "",
  };
  const warnings = [];

  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return {
      success: false,
      data: result,
      warnings: ["Le texte collé est vide."],
      extractedCount: 0,
    };
  }

  const text = cleanSpaces(rawText);

  const LABEL_KEYWORD_REGEX = /^(?:NOM(?:\s+DU\s+CLIENT|\s+CLIENT|\s+ET\s+PR[EÉ]NOMS?)?|CLIENT|ABONN[EÉ]|NUM[EÉ]RO(?:\s+DE\s+)?(?:LIGNE|T[EÉ]L[EÉ]PHONE)?|N[°O]\s*(?:DE\s+)?LIGNE|N[°O]|LIGNE|T[EÉ]L[EÉ]PHONE|T[EÉ]L\.?|MOBILE|PORTABLE|CONTACT|ND|MSAN|FAT|R[EÉ]F[EÉ]RENCE(?:\s+FAT)?|FTTH|PON)$/i;

  // 1. Tenter l'extraction par libellés structurés (avec ou sans parenthèses/deux-points)
  // Format exemple : NOM(DOSSOU ABELLANGE) , numéro de ligne(0121290332) , numéro téléphone (0147980366) MSAN(OGA-PL51) , réference FAT(FAT164)
  
  // Nom
  const nomMatch = text.match(
    /(?:NOM(?:\s+DU\s+CLIENT|\s+CLIENT|\s+ET\s+PR[EÉ]NOMS?)?|CLIENT|ABONN[EÉ])\s*[\(:\-=]\s*([^\)\n,;/|]+?)(?:\)|(?=[,;\n/|]|\s*[-–—]\s*(?:NUM[EÉ]RO|N[°O]|LIGNE|T[EÉ]L|MOBILE|MSAN|FAT|R[EÉ]F)|\s+(?:NUM[EÉ]RO|N[°O]|LIGNE|T[EÉ]L|MOBILE|MSAN|FAT|R[EÉ]F)|\)|$))/i
  );
  if (nomMatch && nomMatch[1]) {
    const candidate = cleanSpaces(nomMatch[1]).replace(/^["']|["']$/g, "").replace(/[,;\-:]+$/, "").trim();
    if (candidate && !/^\d+$/.test(candidate) && !LABEL_KEYWORD_REGEX.test(candidate)) {
      result.nom_client = candidate;
    }
  }

  // Numéro de ligne
  const ligneMatch = text.match(
    /(?:NUM[EÉ]RO\s+(?:DE\s+)?LIGNE|N[°O]\s*(?:DE\s+)?LIGNE|NUM[EÉ]RO\s*LIGNE|T[EÉ]L[EÉ]PHONE\s+(?:DE\s+)?LIGNE|LIGNE|ND)\s*[\(:\-=]\s*([^\)\n,;/|]+?)(?:\)|(?=[,;\n/|]|\s*[-–—]\s*(?:NUM[EÉ]RO|N[°O]|T[EÉ]L|MOBILE|MSAN|FAT|R[EÉ]F)|\s+(?:NUM[EÉ]RO|N[°O]|T[EÉ]L|MOBILE|MSAN|FAT|R[EÉ]F)|\)|$))/i
  );
  if (ligneMatch && ligneMatch[1]) {
    const rawVal = cleanSpaces(ligneMatch[1]);
    const phone = cleanPhoneString(rawVal);
    if (phone) result.telephone_ligne = phone;
  }

  // Téléphone / Mobile
  const telMatch = text.match(
    /(?:NUM[EÉ]RO\s+(?:DE\s+)?T[EÉ]L[EÉ]PHONE|NUM[EÉ]RO\s*T[EÉ]L|T[EÉ]L[EÉ]PHONE|T[EÉ]L\.?|MOBILE|PORTABLE|CONTACT)\s*[\(:\-=]\s*([^\)\n,;/|]+?)(?:\)|(?=[,;\n/|]|\s*[-–—]\s*(?:MSAN|FAT|R[EÉ]F|LIGNE)|\s+(?:MSAN|FAT|R[EÉ]F|LIGNE)|\)|$))/i
  );
  if (telMatch && telMatch[1]) {
    const rawVal = cleanSpaces(telMatch[1]);
    const phone = cleanPhoneString(rawVal);
    if (phone) result.mobile = phone;
  }

  // MSAN
  const msanMatch = text.match(
    /(?:MSAN)\s*[\(:\-=]\s*([A-Za-z0-9_\-\.]+)(?:\)|(?=[,;\n/|\s]|$))/i
  );
  if (msanMatch && msanMatch[1]) {
    result.msan = cleanSpaces(msanMatch[1]);
  }

  // Référence FAT
  const fatMatch = text.match(
    /(?:R[EÉ]F[EÉ]RENCE\s+FAT|R[EÉ]F\.?\s*FAT|FAT_REF|FAT)\s*[\(:\-=]\s*([A-Za-z0-9_\-\.]+)(?:\)|(?=[,;\n/|\s]|$))/i
  );
  if (fatMatch && fatMatch[1]) {
    result.fat_ref = cleanSpaces(fatMatch[1]);
  }

  // 2. Si un ou plusieurs champs principaux n'ont pas été trouvés par libellé explicite,
  // tenter l'extraction par analyse des colonnes / jetons séparés par tabulation ou délimiteurs
  // Format exemple : DOSSOU ABELLANGE CARTER ARMELLE \t 0121290332 \t 0147980366 \t FTTH \t OGA-PL51 FAT164
  const needNom = !result.nom_client;
  const needLigne = !result.telephone_ligne;
  const needMobile = !result.mobile;

  if (needNom || needLigne || needMobile) {
    // Si la chaîne contient des tabulations, découpons par tabulations
    let segments = [];
    if (text.includes("\t")) {
      segments = text.split("\t").map(cleanSpaces).filter(Boolean);
    } else if (text.includes("\n")) {
      segments = text.split("\n").map(cleanSpaces).filter(Boolean);
    } else {
      // Découper sur les séquences d'espaces multiples (2 ou plus)
      segments = text.split(/\s{2,}/).map(cleanSpaces).filter(Boolean);
    }

    // Trouver tous les numéros de téléphone/ligne dans le texte ou les segments
    // On cherche les séquences de 7 à 14 chiffres pouvant avoir un 0 initial
    const allNumberMatches = [];
    const numberRegex = /(?:^|[^\w+])(0?\d{7,14})(?=[^\w]|$)/g;
    let m;
    while ((m = numberRegex.exec(text)) !== null) {
      allNumberMatches.push(m[1]);
    }

    // Filtrer les numéros qui ont déjà été affectés par un libellé explicite
    const unusedNumbers = allNumberMatches.filter(
      (num) => num !== result.telephone_ligne && num !== result.mobile
    );

    // Si on a des segments découpés
    if (segments.length >= 2) {
      if (needNom && !result.nom_client) {
        // Le premier segment qui ne contient pas que des chiffres ni des mots-clés système
        for (const seg of segments) {
          const cleanedSeg = cleanSpaces(seg).replace(/^["']|["']$/g, "").replace(/[,;\-:]+$/, "").trim();
          if (
            cleanedSeg &&
            !LABEL_KEYWORD_REGEX.test(cleanedSeg) &&
            !/^\+?\d{6,}$/.test(cleanPhoneString(cleanedSeg)) &&
            !/^(?:FTTH|PON|MSAN|FAT)/i.test(cleanedSeg) &&
            !/^(?:LIGNE|T[EÉ]L|MOBILE|CONTACT)/i.test(cleanedSeg)
          ) {
            result.nom_client = cleanedSeg;
            break;
          }
        }
      }
    } else if (needNom && allNumberMatches.length > 0) {
      // Prendre ce qui précède le premier numéro de téléphone s'il ne s'agit pas d'un simple libellé
      const firstNumIndex = text.search(/(?:^|[^\w+])0?\d{7,14}(?=[^\w]|$)/);
      if (firstNumIndex > 0) {
        const candidate = cleanSpaces(text.substring(0, firstNumIndex)).replace(/[,;\-:]+$/, "").trim();
        if (
          candidate &&
          !/^\d+$/.test(candidate) &&
          !LABEL_KEYWORD_REGEX.test(candidate) &&
          !/^(?:LIGNE|T[EÉ]L|MOBILE|CONTACT|NUM[EÉ]RO|N[°O]|CLIENT|NOM)/i.test(candidate)
        ) {
          result.nom_client = candidate;
        }
      }
    }

    // Affectation ordonnée des numéros restants si manquants
    // Règle usuelle : 1er numéro = numéro de ligne (fixe/FTTH), 2e numéro = numéro de téléphone mobile
    if (unusedNumbers.length >= 2) {
      if (!result.telephone_ligne) result.telephone_ligne = unusedNumbers[0];
      if (!result.mobile) result.mobile = unusedNumbers[1];
    } else if (unusedNumbers.length === 1) {
      if (!result.telephone_ligne && !result.mobile) {
        result.telephone_ligne = unusedNumbers[0];
        warnings.push("Un seul numéro détecté, affecté au champ « Numéro de ligne ». Vérifiez si un mobile est requis.");
      } else if (!result.telephone_ligne) {
        result.telephone_ligne = unusedNumbers[0];
      } else if (!result.mobile) {
        result.mobile = unusedNumbers[0];
      }
    }

    // Extraction MSAN / FAT autonome si non trouvée
    if (!result.msan) {
      const msanTokenMatch = text.match(/\b([A-Z]{2,4}-[A-Z0-9]{2,8})\b/i);
      if (msanTokenMatch) result.msan = msanTokenMatch[1].toUpperCase();
    }
    if (!result.fat_ref) {
      const fatTokenMatch = text.match(/\b(FAT[-_]?\d{1,4})\b/i);
      if (fatTokenMatch) result.fat_ref = fatTokenMatch[1].toUpperCase();
    }
  }

  // Nettoyage final du nom si présent
  if (result.nom_client) {
    result.nom_client = result.nom_client
      .replace(/^[\s,;:\-–—\(\)]+|[\s,;:\-–—\(\)]+$/g, "")
      .replace(/\s{2,}/g, " ");
  }

  // Validation des alertes
  if (!result.nom_client) warnings.push("Nom du client non détecté.");
  if (!result.telephone_ligne) warnings.push("Numéro de ligne non détecté.");
  if (!result.mobile) warnings.push("Numéro de téléphone mobile non détecté.");

  let extractedCount = 0;
  if (result.nom_client) extractedCount++;
  if (result.telephone_ligne) extractedCount++;
  if (result.mobile) extractedCount++;
  if (result.msan) extractedCount++;
  if (result.fat_ref) extractedCount++;

  return {
    success: extractedCount > 0,
    data: result,
    warnings,
    extractedCount,
  };
}
