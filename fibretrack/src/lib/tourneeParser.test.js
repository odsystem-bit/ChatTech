import test from "node:test";
import assert from "node:assert/strict";
import { parseTourneeListing, parseTourneeLine } from "./tourneeParser.js";

test("parseTourneeListing - Exemple exact fourni par l'utilisateur (séparé par tabulations)", () => {
  const rawText = `OJUS MALIKI ET FILS\t0121257097\t0197923750\tFTTH\tSEM-PL02 FAT103
BLOUEDOU  SEIDOU \t0121293241\t0169659530\tFTTH\tSEM-PL165 FAT23
SANNI AKIMOU ADEDIRAN ADJAHO\t0121297613\t0197181647\tFTTH\tSEM-PL151 FAT47
ANAGONOU ALLELUIA DORCAS\t0121295715\t0141129211/140929302\tFTTH\tSEM-PL02 FAT215`;

  const results = parseTourneeListing(rawText);
  assert.equal(results.length, 4);

  // Dossier 1
  assert.equal(results[0].ordre, 1);
  assert.equal(results[0].nom_client, "OJUS MALIKI ET FILS");
  assert.equal(results[0].telephone_ligne, "0121257097");
  assert.equal(results[0].mobile, "0197923750");
  assert.equal(results[0].offre_souscrite, "FTTH");
  assert.equal(results[0].msan, "SEM-PL02");
  assert.equal(results[0].fat_ref, "FAT103");

  // Dossier 2
  assert.equal(results[1].ordre, 2);
  assert.equal(results[1].nom_client, "BLOUEDOU SEIDOU");
  assert.equal(results[1].telephone_ligne, "0121293241");
  assert.equal(results[1].mobile, "0169659530");
  assert.equal(results[1].offre_souscrite, "FTTH");
  assert.equal(results[1].msan, "SEM-PL165");
  assert.equal(results[1].fat_ref, "FAT23");

  // Dossier 3
  assert.equal(results[2].ordre, 3);
  assert.equal(results[2].nom_client, "SANNI AKIMOU ADEDIRAN ADJAHO");
  assert.equal(results[2].telephone_ligne, "0121297613");
  assert.equal(results[2].mobile, "0197181647");
  assert.equal(results[2].offre_souscrite, "FTTH");
  assert.equal(results[2].msan, "SEM-PL151");
  assert.equal(results[2].fat_ref, "FAT47");

  // Dossier 4 (avec double numéro mobile avec barre oblique)
  assert.equal(results[3].ordre, 4);
  assert.equal(results[3].nom_client, "ANAGONOU ALLELUIA DORCAS");
  assert.equal(results[3].telephone_ligne, "0121295715");
  assert.equal(results[3].mobile, "0141129211/140929302");
  assert.equal(results[3].offre_souscrite, "FTTH");
  assert.equal(results[3].msan, "SEM-PL02");
  assert.equal(results[3].fat_ref, "FAT215");
});

test("parseTourneeListing - Copier-coller avec espaces multiples au lieu de tabulations", () => {
  const rawText = `OJUS MALIKI ET FILS    0121257097    0197923750    FTTH    SEM-PL02 FAT103
BLOUEDOU SEIDOU   0121293241   0169659530   FTTH   SEM-PL165 FAT23`;

  const results = parseTourneeListing(rawText);
  assert.equal(results.length, 2);

  assert.equal(results[0].nom_client, "OJUS MALIKI ET FILS");
  assert.equal(results[0].telephone_ligne, "0121257097");
  assert.equal(results[0].mobile, "0197923750");
  assert.equal(results[0].msan, "SEM-PL02");
  assert.equal(results[0].fat_ref, "FAT103");

  assert.equal(results[1].nom_client, "BLOUEDOU SEIDOU");
  assert.equal(results[1].telephone_ligne, "0121293241");
  assert.equal(results[1].mobile, "0169659530");
  assert.equal(results[1].msan, "SEM-PL165");
  assert.equal(results[1].fat_ref, "FAT23");
});
