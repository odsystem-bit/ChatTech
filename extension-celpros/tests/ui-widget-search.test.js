import test from "node:test";
import assert from "node:assert/strict";

// Données d'exemple réelles pour le test
const mockInterventions = [
  {
    id: "1e64109d-26b6-47aa-87ee-1fa60d0bd59b",
    nom_client: "DOSSOU  ABELLANGE CARTER ARMELLE \t",
    statut: "en_cours",
    telephone_ligne: "0121290332",
    mobile: "0147980366",
    msan: "OGA-PL51",
    fat_ref: "FAT-164",
    date: "2026-10-14 13:39:06"
  },
  {
    id: "dc1e4512-dcf9-444b-aa04-528f83521b42",
    nom_client: "EBO ROUKAYATOU\t",
    statut: "termine",
    telephone_ligne: "0121254187",
    mobile: "0197147528",
    msan: "KAN-PL205",
    fat_ref: " FAT61",
    date: "2026-09-22T16:57:55"
  },
  {
    id: "cb41a544-a91d-4287-ab0c-044aae3e3017",
    nom_client: "KPOSSOU FINONME BLANDINE",
    statut: "termine",
    telephone_ligne: "0121257536",
    mobile: "0196385750",
    msan: "KAN PL205",
    fat_ref: "FAT 99",
    date: "2026-09-22T14:06:56"
  }
];

function filterInterventions(list, filterText, statusFilter = "all") {
  const filter = (filterText || "").toLowerCase().trim();
  let base = list;
  if (filter) {
    base = list.filter((item) => {
      const text = `${item.nom_client || ""} ${item.msan || ""} ${item.fat_ref || ""} ${item.telephone_ligne || ""} ${item.mobile || ""} ${item.id || ""}`.toLowerCase();
      return text.includes(filter);
    });
  } else {
    if (statusFilter === "en_cours") {
      base = list.filter((i) => (i.statut || "").toLowerCase() !== "termine");
    } else if (statusFilter === "termine") {
      base = list.filter((i) => (i.statut || "").toLowerCase() === "termine");
    }
  }
  return base;
}

test("Recherche CelPros - Retrouve le dossier en cours par nom de client 'Dossou'", () => {
  const results = filterInterventions(mockInterventions, "Dossou");
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "1e64109d-26b6-47aa-87ee-1fa60d0bd59b");
});

test("Recherche CelPros - Retrouve par référence FAT '164'", () => {
  const results = filterInterventions(mockInterventions, "164");
  assert.equal(results.length, 1);
  assert.equal(results[0].nom_client.trim(), "DOSSOU  ABELLANGE CARTER ARMELLE");
});

test("Recherche CelPros - Retrouve par téléphone mobile '0147980366'", () => {
  const results = filterInterventions(mockInterventions, "0147980366");
  assert.equal(results.length, 1);
  assert.equal(results[0].fat_ref, "FAT-164");
});

test("Filtre statut CelPros - Onglet 'en_cours' n'affiche que les dossiers en cours", () => {
  const results = filterInterventions(mockInterventions, "", "en_cours");
  assert.equal(results.length, 1);
  assert.equal(results[0].statut, "en_cours");
});

test("Filtre statut CelPros - Onglet 'termine' n'affiche que les dossiers terminés", () => {
  const results = filterInterventions(mockInterventions, "", "termine");
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.statut === "termine"));
});

test("Recherche globale CelPros - Recherche textuelle ignore l'onglet et cherche dans tous les dossiers", () => {
  const results = filterInterventions(mockInterventions, "roukayatou", "en_cours");
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "dc1e4512-dcf9-444b-aa04-528f83521b42");
});
