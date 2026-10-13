/**
 * Analyse et extraction fidèle des codes-barres et textes OCR pour étiquettes ONT Fibre (MAC & SN).
 * Conserve EXACTEMENT la valeur brute telle qu'imprimée, sans troncation ni altération.
 */

/**
 * Nettoie uniquement le préfixe de label éventuel (ex: "MAC: ", "S/N: ")
 * tout en conservant l'intégralité exacte du numéro et de ses suffixes (ex: 18D6DDF6719E-AE(17)).
 * @param {string} raw
 * @returns {string}
 */
export function cleanRawBarcode(raw) {
  if (!raw || typeof raw !== "string") return "";
  let val = raw.trim();
  // Enlever les éventuels préfixes textuels d'étiquette au début
  val = val.replace(
    /^(?:GPON\s*SN|S\/?N|SERIAL|ONT\s*SN|SER\.?\s*NO\.?|MAC\s*(?:ADDR|ADDRESS)?|WAN\s*MAC|LAN\s*MAC)[\s.:=-]+/i,
    ""
  );
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

  // 1. Détection explicite par préfixe MAC ("MAC: ...", "WAN MAC: ...")
  if (/^(?:MAC|WAN\s*MAC|LAN\s*MAC|MAC\s*ADDR(?:ESS)?)[\s.:=-]/i.test(trimmed)) {
    return { type: "mac", value: cleaned, raw: trimmed };
  }

  // 2. Détection explicite par préfixe SN ("SN: ...", "S/N: ...", "GPON SN: ...")
  if (/^(?:GPON\s*SN|S\/?N|SERIAL|ONT\s*SN|SER\.?\s*NO\.?)[\s.:=-]/i.test(trimmed)) {
    return { type: "sn", value: cleaned, raw: trimmed };
  }

  // 3. Format SN GPON standard Huawei en hexadécimal pur (ex: "485754437572231B8", commence par 48575443 = HWTC)
  // PRIORITAIRE sur les motifs hexadécimaux
  if (/^48575443[0-9A-Za-z]{6,20}$/i.test(cleaned)) {
    return { type: "sn", value: cleaned, raw: trimmed };
  }

  // 4. Format SN GPON ZTE en hexadécimal pur (commence par 5A544547 = ZTEG)
  if (/^5A544547[0-9A-Za-z]{6,20}$/i.test(cleaned)) {
    return { type: "sn", value: cleaned, raw: trimmed };
  }

  // 5. Préfixes constructeurs GPON textuels (ZTEG..., HWTC..., ALCL..., FHTT...)
  if (/^(?:ZTEG|HWTC|ALCL|FHTT|TPLG|NOK|ISKR|GNON)[0-9A-Za-z]{6,16}$/i.test(cleaned)) {
    return { type: "sn", value: cleaned, raw: trimmed };
  }

  // 6. Format MAC spécifique opérateur / constructeur avec suffixe délimité (ex: "18D6DDF6719E-AE(17)")
  // 12 caractères hexadécimaux suivis impérativement d'un tiret ou parenthèse
  if (/^[0-9A-Fa-f]{12}(?:[-_][A-Za-z0-9()]+|\([0-9A-Za-z]+\))+$/i.test(cleaned)) {
    return { type: "mac", value: cleaned, raw: trimmed };
  }

  // 7. Format MAC standard avec séparateurs ":" ou "-" (ex: 54:83:3A:4B:2C:1D)
  if (/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/i.test(cleaned)) {
    return { type: "mac", value: cleaned, raw: trimmed };
  }

  // 8. 12 caractères hexadécimaux purs sans séparateur (ex: "18D6DDF6719E")
  if (/^[0-9A-Fa-f]{12}$/.test(cleaned)) {
    return { type: "mac", value: cleaned, raw: trimmed };
  }

  // 9. Chaîne longue (> 14 caractères) débutant par des chiffres/hex sans espaces -> SN
  if (cleaned.length >= 14 && /^[0-9A-Za-z]{14,24}$/.test(cleaned)) {
    return { type: "sn", value: cleaned, raw: trimmed };
  }

  // 10. Chaîne alphanumérique sans espaces contenant des lettres hors hexadécimal (G à Z) -> SN
  if (!/\s/.test(cleaned) && /[G-Zg-z]/.test(cleaned) && cleaned.length >= 8 && cleaned.length <= 24) {
    return { type: "sn", value: cleaned, raw: trimmed };
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
    /(?:MAC(?:\s*ADDR(?:ESS)?)?|WAN\s*MAC|LAN\s*MAC)[\s.:=-]+([0-9A-Fa-f]{12}(?:[-_][A-Za-z0-9()]+)*|[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5})/i
  );
  if (macLabelMatch && macLabelMatch[1]) {
    foundMac = macLabelMatch[1].trim();
  }

  // SN:
  const snLabelMatch = text.match(
    /(?:GPON\s*SN|ONT\s*SN|S\/?N|SERIAL|SER\.?\s*NO\.?)[\s.:=-]+([0-9A-Za-z]{10,24})/i
  );
  if (snLabelMatch && snLabelMatch[1]) {
    foundSn = snLabelMatch[1].trim();
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
    const huaweiMatch = text.match(/\b(48575443[0-9A-Za-z]{6,20})\b/i);
    if (huaweiMatch) {
      foundSn = huaweiMatch[1].trim();
    } else {
      const zteMatch = text.match(/\b(5A544547[0-9A-Za-z]{6,20})\b/i);
      if (zteMatch) {
        foundSn = zteMatch[1].trim();
      } else {
        const vendorMatch = text.match(
          /\b((?:HWTC|ZTEG|ALCL|FHTT|TPLG|NOK|ISKR|GNON)[0-9A-Za-z]{6,16})\b/i
        );
        if (vendorMatch) {
          foundSn = vendorMatch[1].trim();
        }
      }
    }
  }

  // 4. Recherche de MAC avec suffixe opérateur (ex: 18D6DDF6719E-AE(17))
  if (!foundMac) {
    const macSuffixMatch = text.match(/\b([0-9A-Fa-f]{12}(?:[-_][A-Za-z0-9()]+)+)\b/i);
    if (macSuffixMatch) {
      foundMac = macSuffixMatch[1].trim();
    }
  }

  // 5. Recherche de MAC délimitée par ":" ou "-"
  if (!foundMac) {
    const macDelimMatch = text.match(/\b([0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5})\b/i);
    if (macDelimMatch) {
      foundMac = macDelimMatch[1].trim();
    }
  }

  // 6. Recherche de MAC brute 12 hex (sans collision avec le SN)
  if (!foundMac) {
    const hex12Matches = text.match(/\b([0-9A-Fa-f]{12})\b/gi);
    if (hex12Matches) {
      for (const m of hex12Matches) {
        if (!foundSn || !foundSn.includes(m)) {
          foundMac = m;
          break;
        }
      }
    }
  }

  return { mac: foundMac, sn: foundSn };
}
