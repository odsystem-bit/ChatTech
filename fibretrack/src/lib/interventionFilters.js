import { parseServerDate, isSameDay, isSameWeek, isSameMonth } from "./date.js";

/**
 * Détermine si une intervention est supprimée.
 * @param {object} intv
 * @returns {boolean}
 */
export function isInterventionSupprimee(intv) {
  if (!intv || typeof intv !== "object") return true;
  if (intv.supprime_le) return true;
  const s = String(intv.statut || "").trim().toLowerCase();
  return s === "supprime" || s === "supprimee" || s === "deleted";
}

/**
 * Détermine si une intervention a été déclarée non traitée / annulée (conservée dans l'historique).
 * RÈGLE ABSOLUE : Une intervention non traitée N'EST JAMAIS une intervention terminée.
 * @param {object} intv
 * @returns {boolean}
 */
export function isInterventionNonTraitee(intv) {
  if (!intv || typeof intv !== "object") return false;
  if (isInterventionSupprimee(intv)) return false;
  const s = String(intv.statut || "").trim().toLowerCase();
  const norm = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (norm === "non_traite" || norm === "non_traitee" || norm === "annule" || norm === "annulee" || norm === "inacheve" || norm === "inachevee") {
    return true;
  }
  if (intv.motif_non_traite && String(intv.motif_non_traite).trim() !== "" && norm !== "termine" && norm !== "terminee") {
    return true;
  }
  return false;
}

/**
 * Détermine la date de complétion d'une intervention pour les filtres par période.
 * @param {object} intv
 * @returns {string|null}
 */
export function getInterventionCompletionDate(intv) {
  return intv?.date_cloture || intv?.cloture_le || intv?.cloture_at || intv?.modifie_le || intv?.date || null;
}

/**
 * Détermine si une intervention est terminée.
 * Une intervention est terminée lorsqu'elle a été menée à son terme avec succès.
 * Les interventions non traitées / inachevées sont strictement exclues.
 * @param {object} intv
 * @returns {boolean}
 */
export function isInterventionTerminee(intv) {
  if (!intv || typeof intv !== "object") return false;
  if (isInterventionSupprimee(intv)) return false;
  if (isInterventionNonTraitee(intv)) return false;
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
 * Détermine si une intervention appartient à la feuille de route "Tournée du jour" (uniquement à effectuer).
 * Une intervention terminée, supprimée, déclarée non traitée ou déjà en cours de traitement
 * quitte automatiquement la tournée du jour.
 * @param {object} intv
 * @param {string|null} [targetDate] - Date cible YYYY-MM-DD (optionnel)
 * @returns {boolean}
 */
export function isInterventionATraiterTournee(intv, targetDate = null) {
  if (!intv || typeof intv !== "object") return false;
  if (isInterventionSupprimee(intv)) return false;
  if (isInterventionTerminee(intv)) return false;
  if (isInterventionNonTraitee(intv)) return false;

  const s = String(intv.statut || "").trim().toLowerCase();
  const isWaiting = Boolean(intv.tournee_verrouille) || s === "en_attente" || s === "a_faire" || s === "planifie" || s === "planifiee";
  if (!isWaiting) return false;

  if (targetDate) {
    if (intv.tournee_du_jour) {
      return String(intv.tournee_du_jour).slice(0, 10) === targetDate;
    }
    const intvDate = String(intv.date || "").slice(0, 10);
    return intvDate === targetDate;
  }

  return true;
}

/**
 * Détermine si une intervention est en cours (effectivement démarrée / prise en charge et non terminée).
 * Les interventions simplement planifiées dans la tournée mais non lancées (statut 'en_attente' ou 'tournee_verrouille')
 * NE SONT PAS en cours.
 * @param {object} intv
 * @returns {boolean}
 */
export function isInterventionEnCours(intv) {
  if (!intv || typeof intv !== "object") return false;
  if (isInterventionSupprimee(intv)) return false;
  if (isInterventionTerminee(intv)) return false;
  if (isInterventionNonTraitee(intv)) return false;
  const s = String(intv.statut || "").trim().toLowerCase();
  if (s === "en_attente" || s === "a_faire" || s === "planifie" || s === "planifiee") return false;
  if (Boolean(intv.tournee_verrouille)) return false;
  if (intv.tournee_du_jour && (Boolean(intv.tournee_verrouille) || s !== "en_cours")) return false;
  return true;
}

/**
 * Détermine le libellé et le type de badge pour une intervention.
 * @param {object} intv
 * @returns {{ label: string, variant: 'done' | 'progress' | 'pending' | 'danger' }}
 */
export function getInterventionBadge(intv) {
  if (isInterventionNonTraitee(intv)) {
    return { label: "Non traitée", variant: "danger" };
  }
  const s = String(intv?.statut || "").trim().toLowerCase();
  if (intv?.tournee_verrouille || s === "en_attente" || s === "a_faire" || s === "planifie" || s === "planifiee") {
    return { label: "En attente", variant: "pending" };
  }
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
  let norm = String(text)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  // Tolérance orthographique prénoms courants de l'équipe
  if (norm.includes("rodolphe")) norm = norm.replace(/rodolphe/g, "rodolpho");
  return norm;
}

/**
 * Vérifie si une intervention correspond à une requête de recherche textuelle globale.
 * Recherche sur : ID (court ou long), nom client, téléphones (fixe et mobile),
 * technicien, type/offre, zone/adresse, FAT/MSAN, date.
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

  // 2. Nom du client ou dossier
  const client = normalizeSearchText(intv.nom_client);
  const dossier = normalizeSearchText(intv.nom_dossier);
  if (client.includes(q) || dossier.includes(q)) return true;

  // 3. Téléphones (fixe et mobile, recherche brute sans tirets/espaces également)
  const telFixe = normalizeSearchText(intv.telephone_ligne || intv.telephone);
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

  // 5. Type d'intervention / Offre / État / Motif non traité
  const offre = normalizeSearchText(intv.offre_souscrite);
  const etat = normalizeSearchText(intv.etat);
  const motif = normalizeSearchText(intv.motif_non_traite);
  if (offre.includes(q) || etat.includes(q) || motif.includes(q)) return true;

  // 6. Adresse et zone géographique
  const zone = normalizeSearchText(intv.adresse_zone || intv.ville || intv.commune);
  if (zone.includes(q)) return true;

  // 7. Références FAT, MSAN, Port, SN
  const fat = normalizeSearchText(intv.fat_ref);
  const msan = normalizeSearchText(intv.msan);
  const port = normalizeSearchText(intv.port);
  const sn = normalizeSearchText(intv.ont_sn || intv.sn);
  if (fat.includes(q) || msan.includes(q) || port.includes(q) || sn.includes(q)) return true;

  // 8. Date (YYYY-MM-DD)
  const dateStr = normalizeSearchText(intv.tournee_du_jour || intv.date);
  if (dateStr.includes(q)) return true;

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
 *   activeTab?: 'tournee' | 'en_cours' | 'terminees' | 'non_traitees' | 'rapport',
 *   historySubFilter?: 'terminees' | 'non_traitees' | 'all',
 *   periodFilter?: 'today' | 'week' | 'month' | 'all',
 *   searchQuery?: string,
 *   searchTabFilter?: 'all' | 'en_cours' | 'terminees' | 'non_traitees',
 *   technicienFilter?: string,
 *   sortBy?: 'date_desc' | 'date_asc' | 'client_asc' | 'client_desc',
 *   page?: number,
 *   pageSize?: number
 * }} options
 */
export function filterAndOrganizeInterventions(allInterventions = [], options = {}) {
  const {
    activeTab = "en_cours",
    historySubFilter = "terminees",
    periodFilter = "all",
    searchQuery = "",
    searchTabFilter = "all",
    technicienFilter = "all",
    sortBy = "date_desc",
    page = 1,
    pageSize = 15,
    targetDate,
    selectedDate,
  } = options;

  // 1. Compteurs globaux (toujours basés sur TOUTES les interventions valides non supprimées)
  let enCoursCount = 0;
  let termineesCount = 0;
  let nonTraiteesCount = 0;
  let tourneeTodayCount = 0;
  let rapportCount = 0;
  let termineesTodayCount = 0;
  let termineesWeekCount = 0;
  let termineesMonthCount = 0;

  const now = new Date();
  const defaultToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const todayIso = targetDate || selectedDate || defaultToday;

  for (const intv of allInterventions) {
    if (isInterventionSupprimee(intv)) continue;
    rapportCount++;
    if (isInterventionTerminee(intv)) {
      termineesCount++;
      const cDate = getInterventionCompletionDate(intv);
      if (isSameDay(cDate)) termineesTodayCount++;
      if (isSameWeek(cDate)) termineesWeekCount++;
      if (isSameMonth(cDate)) termineesMonthCount++;
    } else if (isInterventionNonTraitee(intv)) {
      nonTraiteesCount++;
    } else if (isInterventionEnCours(intv)) {
      enCoursCount++;
    }

    if (isInterventionATraiterTournee(intv, todayIso)) {
      tourneeTodayCount++;
    }
  }

  // 2. Extraire la liste unique des techniciens pour le filtre
  const techniciens = [
    ...new Set(
      allInterventions
        .filter((i) => !isInterventionSupprimee(i))
        .map((i) => (i.nom_technicien || "").trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b, "fr"));

  const hasSearch = searchQuery.trim().length > 0;

  // 3. Application du filtre de recherche (recherche GLOBALE dans toutes les interventions actives)
  let filtered = allInterventions.filter((intv) => {
    if (isInterventionSupprimee(intv)) return false;
    return matchesInterventionSearch(intv, searchQuery);
  });

  // Compteurs dans les résultats de recherche
  let searchEnCoursCount = 0;
  let searchTermineesCount = 0;
  let searchNonTraiteesCount = 0;
  if (hasSearch) {
    for (const intv of filtered) {
      if (isInterventionTerminee(intv)) {
        searchTermineesCount++;
      } else if (isInterventionNonTraitee(intv)) {
        searchNonTraiteesCount++;
      } else if (isInterventionEnCours(intv)) {
        searchEnCoursCount++;
      }
    }
  }

  // 4. Filtrage par catégorie / onglet
  if (hasSearch) {
    // Si recherche active, filtrer selon le sous-onglet de recherche choisi
    if (searchTabFilter === "en_cours") {
      filtered = filtered.filter(isInterventionEnCours);
    } else if (searchTabFilter === "terminees") {
      filtered = filtered.filter(isInterventionTerminee);
    } else if (searchTabFilter === "non_traitees") {
      filtered = filtered.filter(isInterventionNonTraitee);
    }
  } else {
    // Mode standard : afficher uniquement la catégorie sélectionnée
    if (activeTab === "non_traitees" || (activeTab === "terminees" && historySubFilter === "non_traitees")) {
      filtered = filtered.filter(isInterventionNonTraitee);
    } else if (activeTab === "terminees") {
      if (historySubFilter === "all") {
        filtered = filtered.filter((i) => isInterventionTerminee(i) || isInterventionNonTraitee(i));
      } else {
        filtered = filtered.filter(isInterventionTerminee);
        if (periodFilter === "today") {
          filtered = filtered.filter((i) => isSameDay(getInterventionCompletionDate(i)));
        } else if (periodFilter === "week") {
          filtered = filtered.filter((i) => isSameWeek(getInterventionCompletionDate(i)));
        } else if (periodFilter === "month") {
          filtered = filtered.filter((i) => isSameMonth(getInterventionCompletionDate(i)));
        }
      }
    } else if (activeTab === "tournee") {
      filtered = filtered.filter((i) => isInterventionATraiterTournee(i, todayIso));
    } else if (activeTab === "rapport") {
      // L'onglet Rapport centralise toutes les interventions non supprimées
      filtered = filtered.filter((i) => !isInterventionSupprimee(i));
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
    allMatchingItems: sorted,
    totalItems,
    totalPages,
    currentPage,
    enCoursCount,
    termineesCount,
    termineesTodayCount,
    termineesWeekCount,
    termineesMonthCount,
    nonTraiteesCount,
    tourneeTodayCount,
    rapportCount,
    hasSearch,
    searchEnCoursCount,
    searchTermineesCount,
    searchNonTraiteesCount,
    techniciens,
  };
}

