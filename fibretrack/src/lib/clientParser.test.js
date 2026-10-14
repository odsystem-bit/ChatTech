import test from "node:test";
import assert from "node:assert/strict";
import { parseClientInfo } from "./clientParser.js";

test("parseClientInfo - Format structuré avec parenthèses et libellés (exemple 1 cahier des charges)", () => {
  const input =
    "NOM(DOSSOU  ABELLANGE CARTER ARMELLE ) , numéro de ligne(	0121290332) , numéro téléphone (0147980366) MSAN(OGA-PL51) , réference FAT(FAT164)";

  const res = parseClientInfo(input);

  assert.equal(res.success, true);
  assert.equal(res.data.nom_client, "DOSSOU ABELLANGE CARTER ARMELLE");
  assert.equal(res.data.telephone_ligne, "0121290332");
  assert.equal(res.data.mobile, "0147980366");
  assert.equal(res.data.msan, "OGA-PL51");
  assert.equal(res.data.fat_ref, "FAT164");
  assert.equal(res.warnings.length, 0);
});

test("parseClientInfo - Format tabulaire avec tabulations (exemple 2 cahier des charges)", () => {
  const input =
    "DOSSOU  ABELLANGE CARTER ARMELLE \t0121290332\t0147980366\tFTTH\tOGA-PL51 FAT164";

  const res = parseClientInfo(input);

  assert.equal(res.success, true);
  assert.equal(res.data.nom_client, "DOSSOU ABELLANGE CARTER ARMELLE");
  assert.equal(res.data.telephone_ligne, "0121290332");
  assert.equal(res.data.mobile, "0147980366");
  assert.equal(res.data.msan, "OGA-PL51");
  assert.equal(res.data.fat_ref, "FAT164");
});

test("parseClientInfo - Exemple classique avec zéros initiaux préservés", () => {
  const input = "Jean Dupont\t123456789\t97000000";

  const res = parseClientInfo(input);

  assert.equal(res.success, true);
  assert.equal(res.data.nom_client, "Jean Dupont");
  assert.equal(res.data.telephone_ligne, "123456789");
  assert.equal(res.data.mobile, "97000000");
});

test("parseClientInfo - Variations de libellés (Client, N° ligne, Tél., Mobile)", () => {
  const input = `Client: KOFFI Messan
N° ligne : 0120223344
Tél. : 0197887766`;

  const res = parseClientInfo(input);

  assert.equal(res.success, true);
  assert.equal(res.data.nom_client, "KOFFI Messan");
  assert.equal(res.data.telephone_ligne, "0120223344");
  assert.equal(res.data.mobile, "0197887766");
});

test("parseClientInfo - Préserve rigoureusement les zéros initiaux multiples", () => {
  const input = "Client(Société Alpha) Ligne(0022901234567) Mobile(0100987654)";

  const res = parseClientInfo(input);

  assert.equal(res.data.telephone_ligne, "0022901234567");
  assert.equal(res.data.mobile, "0100987654");
  assert.equal(typeof res.data.telephone_ligne, "string");
  assert.equal(typeof res.data.mobile, "string");
});

test("parseClientInfo - Signalement des informations manquantes sans blocage", () => {
  const input = "Client: Paul Martin\nTéléphone: 97112233";

  const res = parseClientInfo(input);

  assert.equal(res.success, true);
  assert.equal(res.data.nom_client, "Paul Martin");
  assert.equal(res.data.telephone_ligne, "");
  assert.equal(res.data.mobile, "97112233");
  assert.equal(res.warnings.includes("Numéro de ligne non détecté."), true);
});

test("parseClientInfo - Texte vide ou invalide géré gracieusement", () => {
  const emptyRes = parseClientInfo("");
  assert.equal(emptyRes.success, false);
  assert.equal(emptyRes.extractedCount, 0);

  const nullRes = parseClientInfo(null);
  assert.equal(nullRes.success, false);
});

test("parseClientInfo - Séparateurs /, |, - avec libellés structurés", () => {
  const t1 = parseClientInfo("Nom du client: KOUDJO Anne / N° de ligne: 0123004455 / Tél.: 0197889900");
  assert.equal(t1.data.nom_client, "KOUDJO Anne");
  assert.equal(t1.data.telephone_ligne, "0123004455");
  assert.equal(t1.data.mobile, "0197889900");

  const t2 = parseClientInfo("Nom: Pierre | Ligne: 0121290332 | Tel: 0147980366 | MSAN: OGA-PL51 | FAT: FAT164");
  assert.equal(t2.data.nom_client, "Pierre");
  assert.equal(t2.data.telephone_ligne, "0121290332");
  assert.equal(t2.data.mobile, "0147980366");
  assert.equal(t2.data.msan, "OGA-PL51");
  assert.equal(t2.data.fat_ref, "FAT164");

  const t3 = parseClientInfo("Nom: Jean Dupont - Ligne: 0121290332 - Tel: 0147980366");
  assert.equal(t3.data.nom_client, "Jean Dupont");
  assert.equal(t3.data.telephone_ligne, "0121290332");
  assert.equal(t3.data.mobile, "0147980366");
});

test("parseClientInfo - Ne confond pas les libellés de champs isolés avec un nom de client", () => {
  const resPhoneOnly = parseClientInfo("Téléphone: 0147980366");
  assert.equal(resPhoneOnly.data.nom_client, "");
  assert.equal(resPhoneOnly.data.mobile, "0147980366");

  const resLinesOnly = parseClientInfo("Ligne: 0121290332 / Mobile: 0147980366");
  assert.equal(resLinesOnly.data.nom_client, "");
  assert.equal(resLinesOnly.data.telephone_ligne, "0121290332");
  assert.equal(resLinesOnly.data.mobile, "0147980366");
});

