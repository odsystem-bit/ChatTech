/**
 * Analyse et extraction fidèle des codes-barres pour étiquettes ONT Fibre (MAC & SN).
 * Conserve EXACTEMENT la valeur brute du code-barres telle qu'imprimée, sans altération.
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
  val = val.replace(/^(?:GPON\s*SN|S\/?N|SERIAL|ONT\s*SN|MAC\s*(?:ADDR|ADDRESS)?|WAN\s*MAC|LAN\s*MAC)[\s.:=-]+/i, "");
  return val.trim();
}

/**
 * Détermine si une chaîne correspond à un code-barres MAC ou SN
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

  // 1. Détection explicite par préfixe MAC ("MAC: ...", "WAN MAC: ...")
  if (/^(?:MAC|WAN\s*MAC|LAN\s*MAC|MAC\s*ADDR)[\s.:=-]/i.test(trimmed)) {
    return { type: "mac", value: cleaned, raw: trimmed };
  }

  // 2. Détection explicite par préfixe SN ("SN: ...", "S/N: ...", "GPON SN: ...")
  if (/^(?:GPON\s*SN|S\/?N|SERIAL|ONT\s*SN)[\s.:=-]/i.test(trimmed)) {
    return { type: "sn", value: cleaned, raw: trimmed };
  }

  // 3. Format MAC spécifique opérateur / constructeur (ex: "18D6DDF6719E-AE(17)")
  // 12 caractères hexadécimaux suivis d'un tiret et d'un suffixe entre parenthèses ou lettres
  if (/^[0-9A-Fa-f]{12}(?:-[A-Za-z0-9()]+)$/i.test(cleaned)) {
    return { type: "mac", value: cleaned, raw: trimmed };
  }

  // 4. Format SN GPON standard Huawei en hexadécimal pur (ex: "485754437572231B8", commence par 48575443 = HWTC)
  if (/^48575443[0-9A-Za-z]{8,12}$/i.test(cleaned)) {
    return { type: "sn", value: cleaned, raw: trimmed };
  }

  // 5. Format SN GPON ZTE en hexadécimal pur (commence par 5A544547 = ZTEG)
  if (/^5A544547[0-9A-Za-z]{8,12}$/i.test(cleaned)) {
    return { type: "sn", value: cleaned, raw: trimmed };
  }

  // 6. Préfixes constructeurs GPON textuels (ZTEG..., HWTC..., ALCL..., FHTT...)
  if (/^(?:ZTEG|HWTC|ALCL|FHTT|TPLG|NOK|ISKR|GNON)[0-9A-Za-z]{6,16}$/i.test(cleaned)) {
    return { type: "sn", value: cleaned, raw: trimmed };
  }

  // 7. Format MAC standard avec séparateurs ":" ou "-" (ex: 54:83:3A:4B:2C:1D)
  if (/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/i.test(cleaned)) {
    return { type: "mac", value: cleaned, raw: trimmed };
  }

  // 8. 12 caractères hexadécimaux purs sans séparateur (ex: "18D6DDF6719E")
  if (/^[0-9A-Fa-f]{12}$/.test(cleaned)) {
    return { type: "mac", value: cleaned, raw: trimmed };
  }

  // 9. Chaîne longue (> 14 caractères) débutant par des chiffres/hex -> SN
  if (cleaned.length >= 14 && /^[0-9A-Za-z]{14,24}$/.test(cleaned)) {
    return { type: "sn", value: cleaned, raw: trimmed };
  }

  // 10. Chaîne contenant des lettres hors hexadécimal (G à Z) -> SN
  if (/[G-Zg-z]/.test(cleaned) && cleaned.length >= 8) {
    return { type: "sn", value: cleaned, raw: trimmed };
  }

  // Fallback générique
  return { type: "unknown", value: cleaned, raw: trimmed };
}
