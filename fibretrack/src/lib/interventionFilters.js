import { parseServerDate } from "./date.js";

/**
 * Détermine si une intervention est terminée.
 * @param {object} intv
 * @returns {boolean}
 */
export function isInterventionTerminee(intv) {
  if (!intv || typeof intv !== "object") return false;
  const s = String(intv.statut || "").trim().toLowerCase();
  const norm = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (norm === "termine" || norm === "terminee" || norm === "cloture" || norm === "cloturee" || norm === "clos" || norm === "closed" || norm === "done") {
    return true;
  }
  if (intv.date_cloture || intv.cloture_le || intv.cloture_at) {
    return true;
  }
  return false;
}

/**
 * Détermine si une intervention est en cours (ou nouvelle / à prendre en charge).
 * @param {object} intv
 * @returns {boolean}
 */
export function isInterventionEnCours(intv) {
  return !isInterventionTerminee(intv);
}

/**
 * Détermine le libellé et le type de badge pour une intervention.
 * @param {object} intv
 * @returns {{ label: string, variant: 'done' | 'progress' | 'pending' }}
 */
export function getInterventionBadge(intv) {
  if (isInterventionTerminee(intv)) {
    return { label: "Terminée", variant: "done" };
  }
  // Si l'intervention vient d'être créée sans client ou sans technicien
  if (!intv?.nom_client || !intv?.nom_technicien) {
    return { label: "À prendre en charge", variant: "pending" };
  }
  return { label: "En cours", variant: "progress" };
}

/**
 * Normalise une chaîne pour recherche tolérante (minuscules, sans accents, trimmed).
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function normalizeSearchText(text) {
  if (!text) return "";
  return String(text)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Vérifie si une intervention correspond à une requête de recherche textuelle globale.
 * Recherche sur : ID (court ou long), nom client, téléphones (fixe et mobile),
 * technicien, type/offre, zone/adresse, FAT/MSAN.
 * @param {object} intv
 * @param {string} query
 * @returns {boolean}
 */
export function matchesInterventionSearch(intv, query) {
  const q = normalizeSearchText(query);
  if (!q) return true;

  // 1. Recherche par identifiant (ID complet ou court 8 caractères)
  const id = normalizeSearchText(intv.id);
  if (id.includes(q)) return true;

  // 2. Nom du client
  const client = normalizeSearchText(intv.nom_client);
  if (client.includes(q)) return true;

  // 3. Téléphones (fixe et mobile, recherche brute sans tirets/espaces également)
  const telFixe = normalizeSearchText(intv.telephone_ligne);
  const telMobile = normalizeSearchText(intv.mobile);
  const digitsOnlyQ = q.replace(/\D/g, "");
  if (telFixe.includes(q) || telMobile.includes(q)) return true;
  if (digitsOnlyQ.length >= 3) {
    const rawTelFixe = telFixe.replace(/\D/g, "");
    const rawTelMobile = telMobile.replace(/\D/g, "");
    if (rawTelFixe.includes(digitsOnlyQ) || rawTelMobile.includes(digitsOnlyQ)) return true;
  }

  // 4. Technicien ou responsable
  const tech = normalizeSearchText(intv.nom_technicien);
  const equipe = normalizeSearchText(intv.nom_equipe);
  if (tech.includes(q) || equipe.includes(q)) return true;

  // 5. Type d'intervention / Offre / État
  const offre = normalizeSearchText(intv.offre_souscrite);
  const etat = normalizeSearchText(intv.etat);
  if (offre.includes(q) || etat.includes(q)) return true;

  // 6. Adresse et zone géographique
  const zone = normalizeSearchText(intv.adresse_zone);
  if (zone.includes(q)) return true;

  // 7. Références FAT, MSAN, Port
  const fat = normalizeSearchText(intv.fat_ref);
  const msan = normalizeSearchText(intv.msan);
  const port = normalizeSearchText(intv.port);
  if (fat.includes(q) || msan.includes(q) || port.includes(q)) return true;

  return false;
}

/**
 * Trie une liste d'interventions selon le critère spécifié.
 * @param {object[]} list
 * @param {'date_desc' | 'date_asc' | 'client_asc' | 'client_desc'} sortBy
 * @returns {object[]}
 */
export function sortInterventions(list, sortBy = "date_desc") {
  const copy = [...list];
  switch (sortBy) {
    case "date_asc":
      return copy.sort((a, b) => {
        const da = parseServerDate(a.date)?.getTime() || 0;
        const db = parseServerDate(b.date)?.getTime() || 0;
        return da - db;
      });
    case "client_asc":
      return copy.sort((a, b) => (a.nom_client || "").localeCompare(b.nom_client || "", "fr", { sensitivity: "base" }));
    case "client_desc":
      return copy.sort((a, b) => (b.nom_client || "").localeCompare(a.nom_client || "", "fr", { sensitivity: "base" }));
    case "date_desc":
    default:
      return copy.sort((a, b) => {
        const da = parseServerDate(a.date)?.getTime() || 0;
        const db = parseServerDate(b.date)?.getTime() || 0;
        return db - da;
      });
  }
}

/**
 * Filtre et organise les interventions pour l'accueil.
 * @param {object[]} allInterventions
 * @param {{
 *   activeTab: 'en_cours' | 'terminees',
 *   searchQuery: string,
 *   searchTabFilter?: 'all' | 'en_cours' | 'terminees',
 *   technicienFilter?: string,
 *   sortBy?: 'date_desc' | 'date_asc' | 'client_asc' | 'client_desc',
 *   page?: number,
 *   pageSize?: number
 * }} options
 */
export function filterAndOrganizeInterventions(allInterventions = [], options = {}) {
  const {
    activeTab = "en_cours",
    searchQuery = "",
    searchTabFilter = "all",
    technicienFilter = "all",
    sortBy = "date_desc",
    page = 1,
    pageSize = 15,
  } = options;

  // 1. Compteurs globaux (toujours basés sur TOUTES les interventions disponibles)
  let enCoursCount = 0;
  let termineesCount = 0;
  for (const intv of allInterventions) {
    if (isInterventionTerminee(intv)) termineesCount++;
    else enCoursCount++;
  }

  // 2. Extraire la liste unique des techniciens pour le filtre
  const techniciens = [
    ...new Set(
      allInterventions
        .map((i) => (i.nom_technicien || "").trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b, "fr"));

  const hasSearch = searchQuery.trim().length > 0;

  // 3. Application du filtre de recherche (recherche GLOBALE dans toutes les interventions)
  let filtered = allInterventions.filter((intv) => matchesInterventionSearch(intv, searchQuery));

  // Compteurs dans les résultats de recherche
  let searchEnCoursCount = 0;
  let searchTermineesCount = 0;
  if (hasSearch) {
    for (const intv of filtered) {
      if (isInterventionTerminee(intv)) searchTermineesCount++;
      else searchEnCoursCount++;
    }
  }

  // 4. Filtrage par catégorie / onglet
  if (hasSearch) {
    // Si recherche active, filtrer selon le sous-onglet de recherche choisi ('all', 'en_cours', 'terminees')
    if (searchTabFilter === "en_cours") {
      filtered = filtered.filter(isInterventionEnCours);
    } else if (searchTabFilter === "terminees") {
      filtered = filtered.filter(isInterventionTerminee);
    }
  } else {
    // Mode standard : afficher uniquement la catégorie sélectionnée
    if (activeTab === "terminees") {
      filtered = filtered.filter(isInterventionTerminee);
    } else {
      filtered = filtered.filter(isInterventionEnCours);
    }
  }

  // 5. Filtre par technicien
  if (technicienFilter && technicienFilter !== "all") {
    filtered = filtered.filter(
      (intv) => (intv.nom_technicien || "").trim().toLowerCase() === technicienFilter.trim().toLowerCase()
    );
  }

  // 6. Tri
  const sorted = sortInterventions(filtered, sortBy);

  // 7. Pagination
  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedItems = sorted.slice(startIndex, startIndex + pageSize);

  return {
    items: paginatedItems,
    totalItems,
    totalPages,
    currentPage,
    enCoursCount,
    termineesCount,
    hasSearch,
    searchEnCoursCount,
    searchTermineesCount,
    techniciens,
  };
}
