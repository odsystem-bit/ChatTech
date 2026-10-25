import test from "node:test";
import assert from "node:assert/strict";
import {
  isInterventionTerminee,
  isInterventionEnCours,
  getInterventionBadge,
  matchesInterventionSearch,
  sortInterventions,
  filterAndOrganizeInterventions,
} from "./interventionFilters.js";

const sampleData = [
  {
    id: "intv-001-aaaa",
    nom_client: "Koffi Mensah",
    telephone_ligne: "21301020",
    mobile: "97001122",
    nom_technicien: "Stanislas",
    adresse_zone: "Cotonou Cadjehoun",
    statut: "termine",
    date: "2026-10-10 10:00:00",
    offre_souscrite: "Fibre Pro",
    fat_ref: "FAT-01",
    port: "3",
  },
  {
    id: "intv-002-bbbb",
    nom_client: "Amina Alabi",
    telephone_ligne: "",
    mobile: "96112233",
    nom_technicien: "Rodolpho",
    adresse_zone: "Porto-Novo Dowa",
    statut: "en_cours",
    date: "2026-10-13 14:00:00",
    offre_souscrite: "Fibre Particulier",
    fat_ref: "FAT-02",
    port: "5",
  },
  {
    id: "intv-003-cccc",
    nom_client: "",
    telephone_ligne: "",
    mobile: "",
    nom_technicien: "",
    adresse_zone: "",
    statut: "en_cours",
    date: "2026-10-14 09:00:00",
    offre_souscrite: "Fibre Pro",
  },
  {
    id: "intv-004-dddd",
    nom_client: "Cabinet Ogou",
    telephone_ligne: "21380000",
    mobile: "95000000",
    nom_technicien: "Stanislas",
    adresse_zone: "Cotonou Haie Vive",
    statut: "termine",
    date: "2026-10-08 12:00:00",
    offre_souscrite: "Fibre Entreprise",
  },
  {
    id: "intv-005-eeee",
    nom_client: "Bio Guera",
    telephone_ligne: "",
    mobile: "94556677",
    nom_technicien: "Steve",
    adresse_zone: "Parakou Albarika",
    statut: "en_cours",
    date: "2026-10-12 11:30:00",
    offre_souscrite: "Fibre Particulier",
  },
];

test("Catégorisation : nouvelle intervention apparaît dans En cours et non dans Terminées", () => {
  const newIntv = { id: "new-1", nom_client: "Nouveau", statut: "en_cours" };
  assert.equal(isInterventionEnCours(newIntv), true);
  assert.equal(isInterventionTerminee(newIntv), false);
});

test("Catégorisation : intervention terminée est bien classée dans Terminées", () => {
  const doneIntv = { id: "done-1", nom_client: "Ancien", statut: "termine" };
  assert.equal(isInterventionTerminee(doneIntv), true);
  assert.equal(isInterventionEnCours(doneIntv), false);

  // Variantes accentuées et orthographiques tolérées
  assert.equal(isInterventionTerminee({ statut: "Terminé" }), true);
  assert.equal(isInterventionTerminee({ statut: "terminée " }), true);
  assert.equal(isInterventionTerminee({ statut: "clôturé" }), true);
  assert.equal(isInterventionTerminee({ statut: "cloture" }), true);
  assert.equal(isInterventionTerminee({ date_cloture: "2026-10-14" }), true);
});

test("Badges : distinction entre À prendre en charge et En cours", () => {
  const unassigned = { id: "un-1", nom_client: "", nom_technicien: "", statut: "en_cours" };
  const inProgress = { id: "in-1", nom_client: "Amina", nom_technicien: "Rodolpho", statut: "en_cours" };
  const done = { id: "d-1", nom_client: "Koffi", nom_technicien: "Stanislas", statut: "termine" };

  assert.equal(getInterventionBadge(unassigned).label, "À prendre en charge");
  assert.equal(getInterventionBadge(inProgress).label, "En cours");
  assert.equal(getInterventionBadge(done).label, "Terminée");
});

test("Compteurs dynamiques calculés à partir de toutes les données réelles", () => {
  const result = filterAndOrganizeInterventions(sampleData, { activeTab: "en_cours" });
  assert.equal(result.enCoursCount, 3); // intv-002, intv-003, intv-005
  assert.equal(result.termineesCount, 2); // intv-001, intv-004
});

test("Onglet En cours n'affiche que les interventions en cours", () => {
  const result = filterAndOrganizeInterventions(sampleData, { activeTab: "en_cours" });
  assert.equal(result.items.length, 3);
  assert.deepEqual(
    result.items.map((i) => i.id),
    ["intv-003-cccc", "intv-002-bbbb", "intv-005-eeee"] // tri date_desc
  );
});

test("Onglet Terminées n'affiche que les interventions terminées", () => {
  const result = filterAndOrganizeInterventions(sampleData, { activeTab: "terminees" });
  assert.equal(result.items.length, 2);
  assert.deepEqual(
    result.items.map((i) => i.id),
    ["intv-001-aaaa", "intv-004-dddd"] // tri date_desc
  );
});

test("Recherche globale retrouve une intervention par ID exact et partiel", () => {
  assert.equal(matchesInterventionSearch(sampleData[0], "intv-001"), true);
  assert.equal(matchesInterventionSearch(sampleData[0], "aaaa"), true);
  assert.equal(matchesInterventionSearch(sampleData[0], "inconnu"), false);
});

test("Recherche globale retrouve par nom client (insensible casse et accents)", () => {
  assert.equal(matchesInterventionSearch(sampleData[0], "koffi"), true);
  assert.equal(matchesInterventionSearch(sampleData[0], "MENSAH"), true);
  assert.equal(matchesInterventionSearch(sampleData[4], "guera"), true);
});

test("Recherche globale retrouve par téléphone (fixe et mobile)", () => {
  // Téléphone fixe
  assert.equal(matchesInterventionSearch(sampleData[0], "21301020"), true);
  // Téléphone mobile
  assert.equal(matchesInterventionSearch(sampleData[1], "96112233"), true);
  // Recherche partielle de numéro
  assert.equal(matchesInterventionSearch(sampleData[1], "1122"), true);
});

test("Recherche globale fonctionne QUEL QUE SOIT L'ONGLET SÉLECTIONNÉ", () => {
  // Utilisateur dans l'onglet 'en_cours' qui recherche un client dont l'intervention est terminée ('Koffi')
  const result = filterAndOrganizeInterventions(sampleData, {
    activeTab: "en_cours",
    searchQuery: "Koffi",
  });
  // Doit trouver l'intervention terminée même si on est sur l'onglet en_cours !
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "intv-001-aaaa");
  assert.equal(result.items[0].statut, "termine");
});

test("Recherche globale retrouve par technicien et par zone", () => {
  // Par technicien
  const resultTech = filterAndOrganizeInterventions(sampleData, {
    searchQuery: "Rodolpho",
  });
  assert.equal(resultTech.items.length, 1);
  assert.equal(resultTech.items[0].nom_client, "Amina Alabi");

  // Par zone
  const resultZone = filterAndOrganizeInterventions(sampleData, {
    searchQuery: "Cadjehoun",
  });
  assert.equal(resultZone.items.length, 1);
  assert.equal(resultZone.items[0].nom_client, "Koffi Mensah");
});

test("Filtre technicien et options de tri", () => {
  // Filtrer par Stanislas dans l'onglet terminées
  const result = filterAndOrganizeInterventions(sampleData, {
    activeTab: "terminees",
    technicienFilter: "Stanislas",
    sortBy: "client_asc",
  });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].nom_client, "Cabinet Ogou"); // C avant K
  assert.equal(result.items[1].nom_client, "Koffi Mensah");
});

test("Pagination découpe correctement les listes", () => {
  const result = filterAndOrganizeInterventions(sampleData, {
    activeTab: "en_cours",
    pageSize: 2,
    page: 1,
  });
  assert.equal(result.items.length, 2);
  assert.equal(result.totalItems, 3);
  assert.equal(result.totalPages, 2);
  assert.equal(result.currentPage, 1);

  const page2 = filterAndOrganizeInterventions(sampleData, {
    activeTab: "en_cours",
    pageSize: 2,
    page: 2,
  });
  assert.equal(page2.items.length, 1);
  assert.equal(page2.currentPage, 2);
});

test("Tournée du jour : un dossier verrouillé / en attente n'apparaît JAMAIS dans En cours", () => {
  const dossierVerrouille = {
    id: "tournee-1",
    nom_client: "OJUS MALIKI",
    statut: "en_attente",
    tournee_verrouille: true,
    tournee_du_jour: "2026-10-19",
  };

  assert.equal(isInterventionEnCours(dossierVerrouille), false);
  assert.equal(isInterventionTerminee(dossierVerrouille), false);
  assert.equal(getInterventionBadge(dossierVerrouille).label, "En attente");
});

test("Tournée du jour : un dossier déverrouillé et lancé passe bien En cours", () => {
  const dossierLance = {
    id: "tournee-1",
    nom_client: "OJUS MALIKI",
    statut: "en_cours",
    tournee_verrouille: false,
    tournee_du_jour: "2026-10-19",
    date: "2026-10-19 08:30:00",
    nom_technicien: "Rodolphe",
  };

  assert.equal(isInterventionEnCours(dossierLance), true);
  assert.equal(isInterventionTerminee(dossierLance), false);
  assert.equal(getInterventionBadge(dossierLance).label, "En cours");
});

test("Suppression : une intervention supprimée est ignorée et exclue des compteurs et listes", () => {
  const dossierSupprime = {
    id: "del-1",
    nom_client: "CLIENT SUPPRIME",
    statut: "supprime",
    supprime_le: "2026-10-19T10:00:00Z",
  };

  assert.equal(isInterventionEnCours(dossierSupprime), false);
  assert.equal(isInterventionTerminee(dossierSupprime), false);

  const list = [
    dossierSupprime,
    { id: "active-1", nom_client: "Actif", statut: "en_cours" },
  ];

  const res = filterAndOrganizeInterventions(list, { activeTab: "en_cours" });
  assert.equal(res.enCoursCount, 1);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].id, "active-1");
});

test("Tournée du jour : 5 dossiers importés verrouillés donnent 0 en cours", () => {
  const cinqDossiers = [
    { id: "d1", nom_client: "Dossier 1", statut: "en_attente", tournee_verrouille: true, tournee_du_jour: "2026-10-19" },
    { id: "d2", nom_client: "Dossier 2", statut: "en_attente", tournee_verrouille: true, tournee_du_jour: "2026-10-19" },
    { id: "d3", nom_client: "Dossier 3", statut: "en_attente", tournee_verrouille: true, tournee_du_jour: "2026-10-19" },
    { id: "d4", nom_client: "Dossier 4", statut: "en_attente", tournee_verrouille: true, tournee_du_jour: "2026-10-19" },
    { id: "d5", nom_client: "Dossier 5", statut: "en_attente", tournee_verrouille: true, tournee_du_jour: "2026-10-19" },
  ];

  const res = filterAndOrganizeInterventions(cinqDossiers, { activeTab: "en_cours" });
  assert.equal(res.enCoursCount, 0);
  assert.equal(res.items.length, 0);

  // Quand le premier dossier est lancé par le technicien
  cinqDossiers[0].statut = "en_cours";
  cinqDossiers[0].tournee_verrouille = false;

  const resApresLancement = filterAndOrganizeInterventions(cinqDossiers, { activeTab: "en_cours" });
  assert.equal(resApresLancement.enCoursCount, 1);
  assert.equal(resApresLancement.items.length, 1);
  assert.equal(resApresLancement.items[0].id, "d1");
});

test("Scénario 1 & 2 : création dans Tournée du jour, puis passage automatique dans En cours lors du démarrage", () => {
  const today = "2026-10-20";
  const intv = {
    id: "test-flow-1",
    nom_client: "Koffi Tournee",
    statut: "en_attente",
    tournee_du_jour: today,
    tournee_verrouille: true,
  };

  // 1. Apparaît dans Tournée du jour
  const resTournee = filterAndOrganizeInterventions([intv], { activeTab: "tournee", targetDate: today });
  assert.equal(resTournee.tourneeTodayCount, 1);
  assert.equal(resTournee.enCoursCount, 0);
  assert.equal(resTournee.termineesCount, 0);

  // 2. Démarrage : passe en statut en_cours
  intv.statut = "en_cours";
  intv.tournee_verrouille = false;

  // L'intervention quitte automatiquement Tournée du jour et passe dans En cours
  const resApresDemarrage = filterAndOrganizeInterventions([intv], { activeTab: "tournee", targetDate: today });
  assert.equal(resApresDemarrage.tourneeTodayCount, 0, "Doit quitter la feuille de route Tournée du jour");
  assert.equal(resApresDemarrage.enCoursCount, 1, "Doit être comptée dans En cours");

  const resOngletEnCours = filterAndOrganizeInterventions([intv], { activeTab: "en_cours" });
  assert.equal(resOngletEnCours.items.length, 1);
  assert.equal(resOngletEnCours.items[0].id, "test-flow-1");
});

test("Scénario 5 : intervention terminée quitte En cours et passe dans Terminées sans perte de données", () => {
  const intv = {
    id: "test-flow-2",
    nom_client: "Mme Mensah",
    statut: "termine",
    date_cloture: "2026-10-20T16:00:00Z",
    nom_technicien: "Stanislas",
    whatsapp_photos: [{ id: "p1", slot: "fat", url: "https://example.com/p1.jpg" }],
    videos_terrain: [{ id: "v1", url: "https://example.com/v1.mp4" }],
  };

  const resEnCours = filterAndOrganizeInterventions([intv], { activeTab: "en_cours" });
  assert.equal(resEnCours.enCoursCount, 0);
  assert.equal(resEnCours.items.length, 0);

  const resTerminees = filterAndOrganizeInterventions([intv], { activeTab: "terminees" });
  assert.equal(resTerminees.termineesCount, 1);
  assert.equal(resTerminees.items.length, 1);
  assert.equal(resTerminees.items[0].whatsapp_photos.length, 1);
  assert.equal(resTerminees.items[0].videos_terrain.length, 1);
});

test("Scénario 6 : intervention déclarée non traitée quitte Tournée du jour avec statut et motif conservés", () => {
  const today = "2026-10-20";
  const intvNonTraitee = {
    id: "test-nt-1",
    nom_client: "Client Absent",
    statut: "non_traite",
    motif_non_traite: "Client injoignable après 3 appels",
    tournee_du_jour: today,
    tournee_verrouille: false,
    date: "2026-10-20 09:00:00",
  };

  // Quitte la feuille de route du jour
  const resTournee = filterAndOrganizeInterventions([intvNonTraitee], { activeTab: "tournee", targetDate: today });
  assert.equal(resTournee.tourneeTodayCount, 0, "Doit quitter la feuille de route Tournée du jour");

  // N'apparaît pas dans En cours
  const resEnCours = filterAndOrganizeInterventions([intvNonTraitee], { activeTab: "en_cours" });
  assert.equal(resEnCours.enCoursCount, 0);
  assert.equal(resEnCours.items.length, 0);

  // Conservée dans l'historique sous le filtre non_traitees
  const resHistoryNT = filterAndOrganizeInterventions([intvNonTraitee], { activeTab: "terminees", historySubFilter: "non_traitees" });
  assert.equal(resHistoryNT.nonTraiteesCount, 1);
  assert.equal(resHistoryNT.items.length, 1);
  assert.equal(resHistoryNT.items[0].motif_non_traite, "Client injoignable après 3 appels");
});

test("Scénario 7 : intervention supprimée ne s'affiche plus dans Tournée du jour", () => {
  const today = "2026-10-20";
  const intvSupprimee = {
    id: "test-del-2",
    nom_client: "Dossier Annulé",
    statut: "supprime",
    supprime_le: "2026-10-20T11:00:00Z",
    tournee_du_jour: today,
  };

  const resTournee = filterAndOrganizeInterventions([intvSupprimee], { activeTab: "tournee", targetDate: today });
  assert.equal(resTournee.tourneeTodayCount, 0);
  assert.equal(resTournee.items.length, 0);
});

test("Scénario 8 : fin de journée lorsque toutes les interventions sont traitées (Tournée vide, 0 perte de données)", () => {
  const today = "2026-10-20";
  const dossiersJournee = [
    { id: "j1", nom_client: "Client Terminé 1", statut: "termine", tournee_du_jour: today },
    { id: "j2", nom_client: "Client Terminé 2", statut: "termine", tournee_du_jour: today },
    { id: "j3", nom_client: "Client Non Traité", statut: "non_traite", motif_non_traite: "Port saturé", tournee_du_jour: today },
  ];

  // La tournée du jour est vide
  const resTournee = filterAndOrganizeInterventions(dossiersJournee, { activeTab: "tournee", targetDate: today });
  assert.equal(resTournee.tourneeTodayCount, 0, "La tournée du jour doit être vide en fin de journée");
  assert.equal(resTournee.items.length, 0);

  // Toutes les données restent conservées
  assert.equal(resTournee.termineesCount, 2);
  assert.equal(resTournee.nonTraiteesCount, 1);
  assert.equal(resTournee.rapportCount, 3, "Toutes les interventions sont accessibles dans l'onglet Rapport");
});

test("Scénario 9 : Onglet Rapport centralise toutes les interventions avec leurs données", () => {
  const dossiers = [
    { id: "rep-1", nom_client: "ALPHA FIBRE", mobile: "97112233", statut: "termine", msan: "SEM-PL01", fat_ref: "FAT-10" },
    { id: "rep-2", nom_client: "BETA CONSULTING", mobile: "96445566", statut: "en_cours", msan: "SEM-PL02", fat_ref: "FAT-20" },
  ];

  const resRapport = filterAndOrganizeInterventions(dossiers, { activeTab: "rapport" });
  assert.equal(resRapport.rapportCount, 2);
  assert.equal(resRapport.items.length, 2);

  // Recherche par MSAN/FAT
  const resSearch = filterAndOrganizeInterventions(dossiers, { activeTab: "rapport", searchQuery: "SEM-PL02" });
  assert.equal(resSearch.items.length, 1);
  assert.equal(resSearch.items[0].id, "rep-2");
});

test("Scénario 10 : Onglet dédié Non traitées et séparation absolue de Terminées", () => {
  const mixed = [
    { id: "t1", nom_client: "Réussi 1", statut: "termine" },
    { id: "t2", nom_client: "Réussi 2", statut: "termine" },
    { id: "nt1", nom_client: "Échec 1", statut: "non_traite", motif_non_traite: "Client absent" },
    { id: "nt2", nom_client: "Échec 2", statut: "non_traite", motif_non_traite: "Tuyau bouché" },
  ];

  // Onglet Terminées : STRICTEMENT QUE les 2 réussies
  const resTerm = filterAndOrganizeInterventions(mixed, { activeTab: "terminees" });
  assert.equal(resTerm.termineesCount, 2);
  assert.equal(resTerm.items.length, 2);
  assert.ok(resTerm.items.every((i) => i.statut === "termine"));

  // Onglet Non traitées : STRICTEMENT QUE les 2 non traitées
  const resNT = filterAndOrganizeInterventions(mixed, { activeTab: "non_traitees" });
  assert.equal(resNT.nonTraiteesCount, 2);
  assert.equal(resNT.items.length, 2);
  assert.ok(resNT.items.every((i) => i.statut === "non_traite"));
  assert.equal(resNT.items[0].motif_non_traite, "Client absent");
});

test("Scénario 11 : Filtre temporel dans Terminées (Aujourd'hui, Cette semaine, Ce mois, Toutes)", () => {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} 10:00:00`;
  
  // Date de 2 mois plus tôt
  const pastDate = new Date(now.getFullYear(), now.getMonth() - 2, 5, 10, 0, 0);
  const pastStr = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, "0")}-${String(pastDate.getDate()).padStart(2, "0")} 10:00:00`;

  const pool = [
    { id: "today-1", nom_client: "Client Jour", statut: "termine", date: todayStr },
    { id: "past-1", nom_client: "Client Passé", statut: "termine", date: pastStr },
  ];

  const resAll = filterAndOrganizeInterventions(pool, { activeTab: "terminees", periodFilter: "all" });
  assert.equal(resAll.items.length, 2);
  assert.equal(resAll.termineesTodayCount, 1);
  assert.equal(resAll.termineesCount, 2);

  const resToday = filterAndOrganizeInterventions(pool, { activeTab: "terminees", periodFilter: "today" });
  assert.equal(resToday.items.length, 1);
  assert.equal(resToday.items[0].id, "today-1");
});



