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

/**
 * Vérifie si deux dates correspondent au même jour calendaire.
 * @param {string|Date|null} value
 * @param {string|Date} [ref]
 * @returns {boolean}
 */
export function isSameDay(value, ref = new Date()) {
  const d = parseServerDate(value);
  const r = parseServerDate(ref);
  if (!d || !r) return false;
  return (
    d.getFullYear() === r.getFullYear() &&
    d.getMonth() === r.getMonth() &&
    d.getDate() === r.getDate()
  );
}

/**
 * Vérifie si une date tombe dans la même semaine calendaire (du lundi au dimanche).
 * @param {string|Date|null} value
 * @param {string|Date} [ref]
 * @returns {boolean}
 */
export function isSameWeek(value, ref = new Date()) {
  const d = parseServerDate(value);
  const r = parseServerDate(ref);
  if (!d || !r) return false;

  const getMonday = (date) => {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = copy.getDay(); // 0 is Sunday, 1 is Monday
    const diff = (day === 0 ? -6 : 1) - day;
    copy.setDate(copy.getDate() + diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  const monRef = getMonday(r);
  const sunRef = new Date(monRef);
  sunRef.setDate(sunRef.getDate() + 6);
  sunRef.setHours(23, 59, 59, 999);

  return d >= monRef && d <= sunRef;
}

/**
 * Vérifie si une date tombe dans le même mois et même année.
 * @param {string|Date|null} value
 * @param {string|Date} [ref]
 * @returns {boolean}
 */
export function isSameMonth(value, ref = new Date()) {
  const d = parseServerDate(value);
  const r = parseServerDate(ref);
  if (!d || !r) return false;
  return d.getFullYear() === r.getFullYear() && d.getMonth() === r.getMonth();
}

