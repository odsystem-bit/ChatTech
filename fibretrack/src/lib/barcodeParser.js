/**
 * Analyse et extraction fidèle des codes-barres et textes OCR pour étiquettes ONT Fibre (MAC & SN).
 * Conserve EXACTEMENT la valeur brute telle qu'imprimée, sans troncation ni altération,
 * tout en corrigeant la casse et le bruit d'espacement généré par l'OCR.
 */

/**
 * Nettoie uniquement le préfixe de label éventuel (ex: "MAC: ", "S/N: ")
 * et la ponctuation parasite en fin de chaîne tout en conservant l'intégralité
 * exacte du numéro et de ses suffixes (ex: 18D6DDF6719E-AE(17)).
 * @param {string} raw
 * @returns {string}
 */
export function cleanRawBarcode(raw) {
  if (!raw || typeof raw !== "string") return "";
  let val = raw.trim();
  // Enlever les éventuels préfixes textuels d'étiquette au début
  val = val.replace(
    /^(?:GPON\s*SN|ONT\s*SN|S\/?N|SERIAL|ONT\s*S\/N|SER\.?\s*NO\.?|MAC\s*(?:ADDR|ADDRESS)?|WAN\s*MAC|LAN\s*MAC)[\s.:=-]+/i,
    ""
  );
  // Enlever la ponctuation parasite en fin de chaîne (points, virgules, guillemets),
  // mais préserver la parenthèse fermante indispensable pour les formats type -AE(17)
  val = val.replace(/[.,;:"'`]+$/, "");
  return val.trim();
}

/**
 * Détermine si une chaîne unique correspond à un code-barres MAC ou SN
 * et extrait fidèlement la valeur exacte.
 *
 * Exemples réels :
 * - MAC : "18D6DDF6719E-AE(17)" ou "MAC: 18D6DDF6719E-AE(17)" ou "54:83:3A:4B:2C:1D"
 * - SN  : "485754437572231B8" ou "ZTEGC8923412" ou "HWTC12345678" ou "SN: 485754437572231B8"
 *
 * @param {string} raw
 * @returns {{ type: 'mac'|'sn'|'unknown', value: string, raw: string }}
 */
export function parseBarcode(raw) {
  if (!raw || typeof raw !== "string") {
    return { type: "unknown", value: "", raw: "" };
  }

  const trimmed = raw.trim();
  const cleaned = cleanRawBarcode(trimmed);

  // Ignorer les lignes de marque/modèle/tension connues qui ne sont ni MAC ni SN
  if (
    /^(?:HUAWEI|ECHOLIFE|ZTE|NOKIA|ALCATEL|FIBERHOME|TP-LINK|POWER|MODEL|SSID|WIFI|MADE\s*IN|INPUT|OUTPUT|GPON\s*TERMINAL)\b/i.test(
      cleaned
    ) &&
    !/^(?:ZTEG|HWTC|ALCL|FHTT|TPLG)/i.test(cleaned) &&
    !/^(?:GPON\s*SN|S\/?N|MAC)/i.test(trimmed)
  ) {
    return { type: "unknown", value: cleaned, raw: trimmed };
  }

  // Normalisation pour MAC (compacte les espaces autour des tirets et parenthèses)
  const macClean = cleaned.replace(/\s*([-_()]+)\s*/g, "$1");
  const macNorm = macClean.toUpperCase();
  // Normalisation pour SN (supprime tous les espaces internes parasites de l'OCR)
  const snClean = cleaned.replace(/\s+/g, "");
  const noSpaces = snClean.toUpperCase();

  // 1. Détection explicite par préfixe MAC ("MAC: ...", "WAN MAC: ...")
  if (/^(?:MAC|WAN\s*MAC|LAN\s*MAC|MAC\s*ADDR(?:ESS)?)[\s.:=-]/i.test(trimmed)) {
    return { type: "mac", value: macClean, raw: trimmed };
  }

  // 2. Détection explicite par préfixe SN ("SN: ...", "S/N: ...", "GPON SN: ...")
  if (/^(?:GPON\s*SN|S\/?N|SERIAL|ONT\s*SN|SER\.?\s*NO\.?)[\s.:=-]/i.test(trimmed)) {
    return { type: "sn", value: snClean, raw: trimmed };
  }

  // 3. Format SN GPON standard Huawei en hexadécimal pur (ex: "485754437572231B8", commence par 48575443 = HWTC)
  // PRIORITAIRE sur les motifs hexadécimaux
  if (/^48575443[0-9A-Za-z]{6,20}$/i.test(noSpaces)) {
    return { type: "sn", value: snClean, raw: trimmed };
  }

  // 4. Format SN GPON ZTE en hexadécimal pur (commence par 5A544547 = ZTEG)
  if (/^5A544547[0-9A-Za-z]{6,20}$/i.test(noSpaces)) {
    return { type: "sn", value: snClean, raw: trimmed };
  }

  // 5. Préfixes constructeurs GPON textuels (ZTEG..., HWTC..., ALCL..., FHTT...)
  if (/^(?:ZTEG|HWTC|ALCL|FHTT|TPLG|NOK|ISKR|GNON)[0-9A-Za-z]{6,16}$/i.test(noSpaces)) {
    return { type: "sn", value: snClean, raw: trimmed };
  }

  // 6. Format MAC spécifique opérateur / constructeur avec suffixe délimité (ex: "18D6DDF6719E-AE(17)")
  // 12 caractères hexadécimaux suivis impérativement d'un tiret ou parenthèse
  if (/^[0-9A-Fa-f]{12}(?:[-_][A-Za-z0-9()]+|\([0-9A-Za-z]+\))+$/i.test(macNorm)) {
    return { type: "mac", value: macClean, raw: trimmed };
  }

  // 7. Format MAC standard avec séparateurs ":" ou "-" (ex: 54:83:3A:4B:2C:1D)
  if (/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/i.test(macNorm)) {
    return { type: "mac", value: macClean, raw: trimmed };
  }

  // 8. 12 caractères hexadécimaux purs sans séparateur (ex: "18D6DDF6719E")
  if (/^[0-9A-Fa-f]{12}$/i.test(noSpaces)) {
    return { type: "mac", value: macClean, raw: trimmed };
  }

  // 9. Chaîne longue (>= 14 caractères) débutant par des chiffres/hex sans espaces -> SN
  if (noSpaces.length >= 14 && /^[0-9A-Za-z]{14,24}$/.test(noSpaces)) {
    return { type: "sn", value: snClean, raw: trimmed };
  }

  // 10. Chaîne alphanumérique sans espaces contenant des lettres hors hexadécimal (G à Z) -> SN
  if (/[G-Zg-z]/.test(noSpaces) && noSpaces.length >= 8 && noSpaces.length <= 24 && /^[0-9A-Za-z]+$/.test(noSpaces)) {
    return { type: "sn", value: snClean, raw: trimmed };
  }

  // 11. Chaîne purement numérique de longueur 8 à 24 (hors 12) -> SN
  if (/^\d{8,24}$/.test(noSpaces) && noSpaces.length !== 12) {
    return { type: "sn", value: snClean, raw: trimmed };
  }

  // Fallback générique
  return { type: "unknown", value: cleaned, raw: trimmed };
}

/**
 * Analyse un bloc de texte complet (multi-lignes, extrait OCR ou lecture globale)
 * pour en extraire fidèlement la MAC et le SN de l'ONT.
 *
 * @param {string} text
 * @returns {{ mac: string|null, sn: string|null }}
 */
export function extractOntDataFromText(text) {
  if (!text || typeof text !== "string") {
    return { mac: null, sn: null };
  }

  let foundMac = null;
  let foundSn = null;

  // 1. Extraction explicite par préfixes textuels (priorité maximale)
  // MAC:
  const macLabelMatch = text.match(
    /(?:MAC(?:\s*ADDR(?:ESS)?)?|WAN\s*MAC|LAN\s*MAC)[\s.:=-]+([0-9A-Fa-f]{12}(?:\s*[-_]\s*[A-Za-z0-9()]+|\s*\(\s*[0-9A-Za-z]+\s*\)+)*|[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5})/i
  );
  if (macLabelMatch && macLabelMatch[1]) {
    foundMac = macLabelMatch[1]
      .replace(/\s*([-_()]+)\s*/g, "$1")
      .replace(/[.,;:"'`]+$/, "")
      .toUpperCase();
  }

  // SN (recherche sur la même ligne pour ne pas déborder sur la ligne suivante):
  const snLabelMatch = text.match(
    /(?:GPON\s*SN|ONT\s*SN|S\/?N|SERIAL|SER\.?\s*NO\.?)[\s.:=-]+([0-9A-Za-z \t]{10,28})/i
  );
  if (snLabelMatch && snLabelMatch[1]) {
    const rawSn = snLabelMatch[1]
      .replace(/\s+/g, "")
      .replace(/[.,;:"'`]+$/, "")
      .toUpperCase();
    if (rawSn.length >= 8) {
      foundSn = rawSn;
    }
  }

  // 2. Si un champ manque, analyse ligne par ligne avec parseBarcode
  const lines = text
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parsed = parseBarcode(line);
    if (!foundMac && parsed.type === "mac") {
      foundMac = parsed.value;
    }
    if (!foundSn && parsed.type === "sn") {
      foundSn = parsed.value;
    }
  }

  // 3. Recherche de SN par signatures constructeurs (Huawei 48575443..., ZTE 5A544547..., etc.)
  if (!foundSn) {
    const huaweiMatch = text.match(/\b(4857\s*5443[\s0-9A-Za-z]{6,20})/i);
    if (huaweiMatch) {
      foundSn = huaweiMatch[1].replace(/\s+/g, "").toUpperCase();
    } else {
      const zteMatch = text.match(/\b(5A54\s*4547[\s0-9A-Za-z]{6,20})/i);
      if (zteMatch) {
        foundSn = zteMatch[1].replace(/\s+/g, "").toUpperCase();
      } else {
        const vendorMatch = text.match(
          /\b((?:HWTC|ZTEG|ALCL|FHTT|TPLG|NOK|ISKR|GNON)[\s0-9A-Za-z]{6,16})/i
        );
        if (vendorMatch) {
          foundSn = vendorMatch[1].replace(/\s+/g, "").toUpperCase();
        }
      }
    }
  }

  // 4. Recherche de MAC avec suffixe opérateur (ex: 18D6DDF6719E-AE(17)) sans piège de frontière \b
  if (!foundMac) {
    const macSuffixMatch = text.match(
      /(?:^|[^0-9A-Za-z])([0-9A-Fa-f]{12}(?:\s*[-_]\s*[A-Za-z0-9()]+|\s*\(\s*[0-9A-Za-z]+\s*\)+)+)(?=[^0-9A-Za-z]|$|[.,;])/i
    );
    if (macSuffixMatch) {
      foundMac = macSuffixMatch[1]
        .replace(/\s*([-_()]+)\s*/g, "$1")
        .replace(/[.,;:"'`]+$/, "")
        .toUpperCase();
    }
  }

  // 5. Recherche de MAC délimitée par ":" ou "-"
  if (!foundMac) {
    const macDelimMatch = text.match(/\b([0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5})\b/i);
    if (macDelimMatch) {
      foundMac = macDelimMatch[1].toUpperCase();
    }
  }

  // 6. Recherche de MAC brute 12 hex (sans collision avec le SN)
  if (!foundMac) {
    const hex12Matches = text.match(/\b([0-9A-Fa-f]{12})\b/gi);
    if (hex12Matches) {
      for (const m of hex12Matches) {
        const upper = m.toUpperCase();
        if (!foundSn || !foundSn.includes(upper)) {
          foundMac = upper;
          break;
        }
      }
    }
  }

  return { mac: foundMac, sn: foundSn };
}

/**
 * Analyse un texte OCR extrait d'une photo de boîtier FAT
 * pour en extraire automatiquement la Référence FAT et le MSAN.
 *
 * Règle métier :
 * - Le MSAN commence généralement par "OGA..." (ou préfixé par MSAN:)
 * - La référence FAT commence par "FAT..." (ou préfixé par FAT/REF:)
 * - Sur la photo, le MSAN est généralement au-dessus et le FAT en dessous.
 * - Tolérance aux erreurs OCR courantes (ex: 0GA au lieu de OGA).
 *
 * @param {string} text
 * @returns {{ fat_ref: string|null, msan: string|null }}
 */
export function extractFatAndMsanFromText(text) {
  if (!text || typeof text !== "string") {
    return { fat_ref: null, msan: null };
  }

  let foundFat = null;
  let foundMsan = null;

  // 0. Correction préliminaire des confusions OCR fréquentes
  // "0RGA" -> "ORGA", "0GA" -> "OGA", "F4T" -> "FAT", espaces internes OCR
  const normalized = text
    .replace(/\b0RGA(?=[-_0-9A-Za-z]|\b)/gi, "ORGA")
    .replace(/\b0GA(?=[-_0-9A-Za-z]|\b)/gi, "OGA")
    .replace(/\bO\s*R\s*G\s*A\b/gi, "ORGA")
    .replace(/\bF\s*A\s*T\b/gi, "FAT")
    .replace(/\bF4T\b/gi, "FAT");

  // 1. Filtrer les lignes parasites (bannières GPS incrustées, métadonnées, etc.)
  const cleanLines = normalized
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      // Exclure les bruits du bandeau GPS (type GPS Map Camera) sans jeter les numéros purs
      if (/^(?:Lat|Lng|Latitude|Longitude|Lieu|Pr[eé]cision|Horodatage|Bo[iî]tier\s*FAT\s*[-–—]|Date\s*:)[\s.:]/i.test(l)) return false;
      if (/^±\s*\d+/i.test(l)) return false;
      if (/^Bo[iî]tier\s*FAT\s*[-–—]/i.test(l)) return false;
      return true;
    });

  const cleanText = cleanLines.join("\n");

  // 2. Recherche explicite par préfixes textuels (MSAN: ..., REF FAT: ...)
  const msanPrefixMatch = cleanText.match(
    /(?:MSAN|M\.S\.A\.N)[\s.:=-]+([A-Za-z0-9_\-\.\/]+(?:[ \t]+[A-Za-z0-9_\-\.\/]+)?)/i
  );
  if (msanPrefixMatch && msanPrefixMatch[1]) {
    const raw = msanPrefixMatch[1].trim();
    if (raw.length >= 2) {
      foundMsan = raw;
    }
  }

  const fatPrefixMatch = cleanText.match(
    /(?:R[EÉ]F(?:[EÉ]RENCE)?\s*FAT|R[EÉ]F\s*FAT)[\s.:=-]+([A-Za-z0-9_\-\.\/]+(?:[ \t]+[A-Za-z0-9_\-\.\/]+)?)/i
  );
  if (fatPrefixMatch && fatPrefixMatch[1]) {
    const raw = fatPrefixMatch[1].trim();
    if (raw.length >= 1) {
      foundFat = /^FAT/i.test(raw) ? raw : `FAT-${raw}`;
    }
  }

  // 3. Recherche par signature de code MSAN (ORGA ou OGA : ex: ORGA-PL51, ORGA 12, ORGA04, OGA-01, OGA-CADJEHOUN-02)
  if (!foundMsan) {
    const msanMatch = cleanText.match(/\b((?:ORGA|OGA)[\s\-_.:]?[A-Za-z0-9]+(?:[\-_.\/][A-Za-z0-9]+)*)\b/i);
    if (msanMatch && msanMatch[1]) {
      foundMsan = msanMatch[1].trim();
    }
  }

  // 4. Recherche par signature de code FAT (ex: FAT-04, FAT 04, FAT 164, FAT164, FAT_12, FAT-01/02)
  if (!foundFat) {
    const fatMatch = cleanText.match(/\b(FAT[\s\-_.:]?[0-9A-Za-z]+(?:[\-_.\/][0-9A-Za-z]+)*)\b/i);
    if (fatMatch && fatMatch[1]) {
      foundFat = fatMatch[1].trim();
    }
  }

  // 5. Analyse multi-lignes positionnelle (MSAN au-dessus, FAT en dessous sur le boîtier)
  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i];
    const isMsanLine = /^(?:ORGA|OGA)/i.test(line) || (foundMsan && line.includes(foundMsan));

    // Règle métier terrain : MSAN au-dessus (généralement ORGA ou OGA) et référence FAT en-dessous
    if (isMsanLine && !foundFat && i + 1 < cleanLines.length) {
      const nextLine = cleanLines[i + 1];
      if (/^FAT/i.test(nextLine)) {
        foundFat = nextLine;
      } else if (/^\d{1,4}[A-Za-z]?$/.test(nextLine)) {
        foundFat = `FAT-${nextLine}`;
      } else if (/^[A-Za-z0-9\-_.\/]{1,8}$/.test(nextLine) && !/^(?:ORGA|OGA)/i.test(nextLine)) {
        foundFat = `FAT-${nextLine}`;
      }
    }

    // Cas inverse : si FAT est identifié en premier sur une ligne et que la ligne précédente ressemble à un MSAN
    const isFatLine = /^FAT/i.test(line) || (foundFat && line.includes(foundFat));
    if (isFatLine && !foundMsan && i > 0) {
      const prevLine = cleanLines[i - 1];
      if (/^(?:ORGA|OGA)/i.test(prevLine) || /^[A-Z]{2,6}[-_][A-Z0-9]+$/i.test(prevLine)) {
        foundMsan = prevLine;
      }
    }
  }

  // Nettoyage ponctuation résiduelle en fin de chaîne
  if (foundFat) {
    foundFat = foundFat.replace(/[.,;:"'`]+$/, "").trim();
  }
  if (foundMsan) {
    foundMsan = foundMsan.replace(/[.,;:"'`]+$/, "").trim();
  }

  return { fat_ref: foundFat, msan: foundMsan };
}
