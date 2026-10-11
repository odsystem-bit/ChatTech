/**
 * Parse une date venant du serveur (MySQL "YYYY-MM-DD HH:MM:SS",
 * ISO "YYYY-MM-DDTHH:MM:SS" ou français "DD/MM/YYYY") en objet Date local.
 * `new Date("2026-10-05 12:34:56")` renvoie Invalid Date sur Safari —
 * ce parseur couvre tous les formats utilisés par l'APK et l'API.
 * @param {string|Date|null|undefined} value
 * @returns {Date|null}
 */
export function parseServerDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  if (!s) return null;

  // Format français : DD/MM/YYYY [HH:MM[:SS]]
  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (fr) {
    return new Date(+fr[3], +fr[2] - 1, +fr[1], +(fr[4] || 0), +(fr[5] || 0), +(fr[6] || 0));
  }

  // Format ISO/MySQL : YYYY-MM-DD[T| ]HH:MM[:SS]
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    return new Date(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0));
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Formate une date serveur en date courte locale (ex: 05/10/2026).
 * Retourne la valeur brute si non parsable.
 */
export function formatDateFR(value) {
  const d = parseServerDate(value);
  if (!d) return value ? String(value) : "";
  return d.toLocaleDateString();
}

/**
 * Formate une date serveur en date + heure locale (ex: 05/10/2026 12:34:56).
 * Retourne la valeur brute si non parsable.
 */
export function formatDateTimeFR(value) {
  const d = parseServerDate(value);
  if (!d) return value ? String(value) : "";
  return d.toLocaleString();
}
