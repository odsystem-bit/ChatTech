/**
 * Analyse et extraction intelligente des codes-barres pour étiquettes ONT Fibre (MAC & SN).
 * Distingue automatiquement l'adresse MAC du numéro de série (SN).
 */

/**
 * Nettoie et formate une adresse MAC au format standard XX:XX:XX:XX:XX:XX
 * @param {string} raw
 * @returns {string|null}
 */
export function formatMacAddress(raw) {
  if (!raw) return null;
  // Extraire uniquement les caractères hexadécimaux
  const hex = raw.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  if (hex.length === 12) {
    return hex.match(/.{1,2}/g).join(":");
  }
  return null;
}

/**
 * Nettoie et formate un Serial Number (SN / GPON SN)
 * Décode également les SN Huawei encodés en hexadécimal (48575443 -> HWTC)
 * @param {string} raw
 * @returns {string|null}
 */
export function formatSerialNumber(raw) {
  if (!raw) return null;
  let sn = raw.trim();

  // Enlever les préfixes communs : "S/N:", "SN:", "GPON SN:", "SERIAL:", etc.
  sn = sn.replace(/^(?:GPON\s*SN|S\/?N|SERIAL\s*(?:NO|NUMBER)?|ONT\s*SN|PRODUCT\s*SN)[\s.:=-]*/i, "").trim();

  // Cas spécial Huawei : 16 caractères hex commençant par 48575443 (HWTC en ASCII)
  if (/^48575443[0-9A-Fa-f]{8}$/i.test(sn)) {
    return "HWTC" + sn.slice(8).toUpperCase();
  }
  // Cas spécial ZTE : 16 caractères hex commençant par 5A544547 (ZTEG en ASCII)
  if (/^5A544547[0-9A-Fa-f]{8}$/i.test(sn)) {
    return "ZTEG" + sn.slice(8).toUpperCase();
  }
  // Cas spécial Alcatel : 16 caractères hex commençant par 414C434C (ALCL en ASCII)
  if (/^414C434C[0-9A-Fa-f]{8}$/i.test(sn)) {
    return "ALCL" + sn.slice(8).toUpperCase();
  }

  // Nettoyer espaces ou tirets inutiles
  return sn.toUpperCase();
}

/**
 * Analyse une chaîne issue d'un code-barres et détermine son type (mac, sn ou inconnu).
 * @param {string} raw
 * @returns {{ type: 'mac'|'sn'|'unknown', value: string, raw: string }}
 */
export function parseBarcode(raw) {
  if (!raw || typeof raw !== "string") {
    return { type: "unknown", value: "", raw: "" };
  }

  const trimmed = raw.trim();

  // 1. Détection explicite par préfixe MAC
  if (/^(?:MAC|WAN\s*MAC|LAN\s*MAC|MAC\s*ADDR)[\s.:=-]/i.test(trimmed)) {
    const candidate = trimmed.replace(/^(?:MAC|WAN\s*MAC|LAN\s*MAC|MAC\s*ADDR)[\s.:=-]*/i, "");
    const formatted = formatMacAddress(candidate);
    if (formatted) {
      return { type: "mac", value: formatted, raw: trimmed };
    }
  }

  // 2. Détection explicite par préfixe SN
  if (/^(?:GPON\s*SN|S\/?N|SERIAL\s*(?:NO|NUMBER)?|ONT\s*SN)[\s.:=-]/i.test(trimmed)) {
    const formatted = formatSerialNumber(trimmed);
    if (formatted && formatted.length >= 6) {
      return { type: "sn", value: formatted, raw: trimmed };
    }
  }

  // 3. Préfixes constructeurs GPON reconnus (ZTEG, HWTC, ALCL, FHTT, TPLG, EG, etc.)
  if (/^(?:ZTEG|HWTC|ALCL|FHTT|TPLG|NOK|ISKR|GNON)[0-9A-Za-z]{6,16}$/i.test(trimmed)) {
    return { type: "sn", value: formatSerialNumber(trimmed), raw: trimmed };
  }

  // 4. Code hexadécimal encodé (HWTC, ZTEG, ALCL)
  if (/^(?:48575443|5A544547|414C434C)[0-9A-Fa-f]{8}$/i.test(trimmed)) {
    return { type: "sn", value: formatSerialNumber(trimmed), raw: trimmed };
  }

  // 5. Adresse MAC déjà formatée avec ':' ou '-' (ex: 54:83:3A:12:34:56)
  if (/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/i.test(trimmed)) {
    const formatted = formatMacAddress(trimmed);
    if (formatted) {
      return { type: "mac", value: formatted, raw: trimmed };
    }
  }

  // 6. Chaîne contenant des lettres hors hexadécimal (G à Z) -> NE PEUT PAS être une MAC
  // Exemple: ZTEGC8123456, S123456789, HWTC99...
  if (/[G-Zg-z]/.test(trimmed) && trimmed.length >= 8 && trimmed.length <= 24) {
    return { type: "sn", value: formatSerialNumber(trimmed), raw: trimmed };
  }

  // 7. Chaîne de exactement 12 caractères hexadécimaux sans séparateur (ex: 54833A123456)
  // Dans le standard télécom ONT, un code-barres 12 hex correspond à la MAC.
  if (/^[0-9A-Fa-f]{12}$/.test(trimmed)) {
    const formatted = formatMacAddress(trimmed);
    return { type: "mac", value: formatted, raw: trimmed };
  }

  // 8. Chaîne de 16 caractères alphanumériques ou hexadécimaux
  if (/^[0-9A-Fa-f]{16}$/.test(trimmed)) {
    return { type: "sn", value: formatSerialNumber(trimmed), raw: trimmed };
  }

  // 9. Par défaut, si au moins 8 caractères alphanumériques
  if (/^[A-Za-z0-9_-]{6,30}$/.test(trimmed)) {
    return { type: "sn", value: trimmed.toUpperCase(), raw: trimmed };
  }

  return { type: "unknown", value: trimmed, raw: trimmed };
}
