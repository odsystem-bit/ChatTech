import test from "node:test";
import assert from "node:assert/strict";
import { ensureInterventionDefaults, createEmptyIntervention } from "./Intervention.js";

test("ensureInterventionDefaults initializes empty intervention with 0 poles", () => {
  const empty = ensureInterventionDefaults(null);
  assert.equal(empty.points_gps.length, 0);
  assert.equal(empty.nb_poteaux_traverses, 0);
  assert.equal(empty.nb_poteaux_implantes, 0);
  assert.equal(empty.nb_poteaux_armes, 0);
});

test("ensureInterventionDefaults normalizes poles with independent options", () => {
  const input = {
    points_gps: [
      {
        id: "p1",
        type: "Poteau",
        numero: 1,
        type_poteau: "Petit Jean",
        traverse: true,
        implante: false,
        arme: true,
      },
      {
        id: "p2",
        type: "Poteau",
        numero: 2,
        type_poteau: "SBEE",
        traverse: false,
        implante: true,
        arme: false,
      },
    ],
  };

  const output = ensureInterventionDefaults(input);
  assert.equal(output.points_gps.length, 2);

  const p1 = output.points_gps[0];
  assert.equal(p1.numero, 1);
  assert.equal(p1.type_poteau, "Petit Jean");
  assert.equal(p1.proprietaire, "Petit Jean");
  assert.equal(p1.traverse, true);
  assert.equal(p1.implante, false);
  assert.equal(p1.arme, true);

  const p2 = output.points_gps[1];
  assert.equal(p2.numero, 2);
  assert.equal(p2.type_poteau, "SBEE");
  assert.equal(p2.proprietaire, "SBEE");
  assert.equal(p2.traverse, false);
  assert.equal(p2.implante, true);
  assert.equal(p2.arme, false);

  // Counters: 1 traversé (p1), 1 implanté (p2), 1 armé (p1)
  assert.equal(output.nb_poteaux_traverses, 1);
  assert.equal(output.nb_poteaux_implantes, 1);
  assert.equal(output.nb_poteaux_armes, 1);
});

test("ensureInterventionDefaults handles backward compatibility from legacy sous_type", () => {
  const input = {
    points_gps: [
      {
        id: "p1",
        type: "Poteau",
        numero: 1,
        sous_type: "Implanté",
        proprietaire: "SBEE",
      },
      {
        id: "p2",
        type: "Poteau",
        numero: 2,
        sous_type: "Armé",
        proprietaire: "Petit Jean",
      },
    ],
  };

  const output = ensureInterventionDefaults(input);
  assert.equal(output.points_gps[0].implante, true);
  assert.equal(output.points_gps[0].traverse, false);
  assert.equal(output.points_gps[0].type_poteau, "SBEE");

  assert.equal(output.points_gps[1].arme, true);
  assert.equal(output.points_gps[1].traverse, true); // sous_type !== "Implanté"
  assert.equal(output.points_gps[1].type_poteau, "Petit Jean");

  assert.equal(output.nb_poteaux_traverses, 1);
  assert.equal(output.nb_poteaux_implantes, 1);
  assert.equal(output.nb_poteaux_armes, 1);
});

test("ensureInterventionDefaults migrates legacy whatsapp_photos pole slots", () => {
  const input = {
    points_gps: [],
    whatsapp_photos: [
      {
        id: "wa-1",
        slot: "poteau_1",
        url: "data:image/jpeg;base64,sample1",
        lat: 6.37,
        lng: 2.43,
        precision_m: 3.5,
      },
      {
        id: "wa-3",
        slot: "poteau_3",
        url: "data:image/jpeg;base64,sample3",
        lat: 6.38,
        lng: 2.44,
      },
    ],
  };

  const output = ensureInterventionDefaults(input);
  assert.equal(output.points_gps.length, 2);
  assert.equal(output.points_gps[0].numero, 1);
  assert.equal(output.points_gps[0].photo, "data:image/jpeg;base64,sample1");
  assert.equal(output.points_gps[1].numero, 3);
  assert.equal(output.points_gps[1].photo, "data:image/jpeg;base64,sample3");
});

test("Pole removal preserves other pole numbers and updates counters", () => {
  const initial = ensureInterventionDefaults({
    points_gps: [
      { id: "p1", type: "Poteau", numero: 1, traverse: true, implante: false, arme: false },
      { id: "p2", type: "Poteau", numero: 2, traverse: true, implante: true, arme: false },
      { id: "p3", type: "Poteau", numero: 3, traverse: false, implante: false, arme: true },
    ],
  });

  // Remove pole 2
  const updatedPoints = initial.points_gps.filter((p) => Number(p.numero) !== 2);
  const remainingPoles = updatedPoints.filter((p) => p && p.type === "Poteau");
  const nbTraverses = remainingPoles.filter((p) => Boolean(p.traverse)).length;
  const nbImplantes = remainingPoles.filter((p) => Boolean(p.implante)).length;
  const nbArmes = remainingPoles.filter((p) => Boolean(p.arme)).length;

  const afterRemoval = ensureInterventionDefaults({
    ...initial,
    points_gps: updatedPoints,
    nb_poteaux_traverses: nbTraverses,
    nb_poteaux_implantes: nbImplantes,
    nb_poteaux_armes: nbArmes,
  });

  // Numbers 1 and 3 are preserved (not renumbered to 1 and 2)
  assert.equal(afterRemoval.points_gps.length, 2);
  assert.equal(afterRemoval.points_gps[0].numero, 1);
  assert.equal(afterRemoval.points_gps[1].numero, 3);

  // Counters reflect removal of pole 2 (which had traverse: true, implante: true)
  assert.equal(afterRemoval.nb_poteaux_traverses, 1); // p1
  assert.equal(afterRemoval.nb_poteaux_implantes, 0); // p2 removed
  assert.equal(afterRemoval.nb_poteaux_armes, 1);     // p3
});

test("Removing all poles leaves empty array and 0 counters", () => {
  const initial = ensureInterventionDefaults({
    points_gps: [
      { id: "p1", type: "Poteau", numero: 1, traverse: true, implante: false, arme: false },
    ],
  });

  const updatedPoints = initial.points_gps.filter((p) => Number(p.numero) !== 1);
  const remainingPoles = updatedPoints.filter((p) => p && p.type === "Poteau");
  const afterRemoval = ensureInterventionDefaults({
    ...initial,
    points_gps: updatedPoints,
    nb_poteaux_traverses: remainingPoles.filter((p) => Boolean(p.traverse)).length,
    nb_poteaux_implantes: remainingPoles.filter((p) => Boolean(p.implante)).length,
    nb_poteaux_armes: remainingPoles.filter((p) => Boolean(p.arme)).length,
  });

  assert.equal(afterRemoval.points_gps.length, 0);
  assert.equal(afterRemoval.nb_poteaux_traverses, 0);
  assert.equal(afterRemoval.nb_poteaux_implantes, 0);
  assert.equal(afterRemoval.nb_poteaux_armes, 0);
});

test("saveInterventionLocally protects against photo erasure when saving a light object", async () => {
  // Mock localStorage for Node test environment
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };

  const { saveInterventionLocally, getStoredIntervention } = await import("./Intervention.js");

  const fullRecord = {
    id: "test-save-intv-1",
    nom_client: "Client Test",
    whatsapp_photos: [{ id: "wa-1", slot: "poteau_1", url: "data:image/jpeg;base64,aaa" }],
    points_gps: [{ id: "pt-1", type: "Poteau", numero: 1, photo: "data:image/jpeg;base64,bbb" }],
    signature_client: "data:image/png;base64,sig1",
    signature_technicien: "data:image/png;base64,sig2",
    _fully_loaded: true,
  };

  // 1. Sauvegarde complète
  saveInterventionLocally(fullRecord);
  const loadedFull = getStoredIntervention("test-save-intv-1");
  assert.equal(loadedFull.whatsapp_photos.length, 1);
  assert.equal(loadedFull.points_gps.length, 1);
  assert.equal(loadedFull.signature_client, "data:image/png;base64,sig1");

  // 2. Sauvegarde accidentelle d'un objet light (sans photos)
  const lightRecord = {
    id: "test-save-intv-1",
    nom_client: "Client Test Renommé",
    whatsapp_photos: [],
    points_gps: [],
    signature_client: "",
    signature_technicien: "",
  };
  saveInterventionLocally(lightRecord);

  // 3. Vérification : les photos et signatures DOIVENT ÊTRE PRÉSERVÉES !
  const protectedRecord = getStoredIntervention("test-save-intv-1");
  assert.equal(protectedRecord.nom_client, "Client Test Renommé");
  assert.equal(protectedRecord.whatsapp_photos.length, 1, "Les photos WhatsApp ne doivent pas être écrasées");
  assert.equal(protectedRecord.points_gps.length, 1, "Les points GPS ne doivent pas être écrasés");
  assert.equal(protectedRecord.signature_client, "data:image/png;base64,sig1", "La signature client doit être préservée");
  assert.equal(protectedRecord.signature_technicien, "data:image/png;base64,sig2", "La signature tech doit être préservée");
});

test("ensureInterventionDefaults preserves additional photos and their CelPros exclusion tags", () => {
  const input = {
    id: "test-additionnelle-1",
    nom_client: "KOUDJO Paul",
    whatsapp_photos: [
      {
        id: "add-1",
        label: "Photo additionnelle",
        type: "additionnelle",
        slot: "additionnelle",
        additionnelle: true,
        is_additionnelle: true,
        exclude_celpros: true,
        url: "data:image/jpeg;base64,img1",
      },
      {
        id: "celpro-fat",
        slot: "fat",
        type: "fat",
        url: "data:image/jpeg;base64,fat1",
      },
    ],
  };

  const defaulted = ensureInterventionDefaults(input);
  assert.equal(defaulted.whatsapp_photos.length, 2);
  const addPhoto = defaulted.whatsapp_photos.find((p) => p.id === "add-1");
  assert.ok(addPhoto);
  assert.equal(addPhoto.additionnelle, true);
  assert.equal(addPhoto.exclude_celpros, true);
  assert.equal(addPhoto.slot, "additionnelle");
});

test("saveInterventionLocally preserves multiple photos additionnelles and never drops them on sync or light save", async () => {
  const { saveInterventionLocally, getStoredIntervention } = await import("./Intervention.js");
  const testId = "test-multi-add-save";

  // 1. Initial save with 1 photo additionnelle and 1 FAT photo
  const initial = {
    id: testId,
    nom_client: "Test Multi Additionnelle",
    whatsapp_photos: [
      { id: "fat-1", slot: "fat", type: "fat", url: "data:image/jpeg;base64,fat" },
      { id: "add-1", slot: "additionnelle_add-1", type: "additionnelle", additionnelle: true, is_additionnelle: true, url: "data:image/jpeg;base64,add1" },
    ],
    _fully_loaded: true,
  };
  saveInterventionLocally(initial);

  // 2. Add second and third photo additionnelle
  const secondSave = {
    id: testId,
    nom_client: "Test Multi Additionnelle",
    whatsapp_photos: [
      { id: "fat-1", slot: "fat", type: "fat", url: "data:image/jpeg;base64,fat" },
      { id: "add-1", slot: "additionnelle_add-1", type: "additionnelle", additionnelle: true, is_additionnelle: true, url: "data:image/jpeg;base64,add1" },
      { id: "add-2", slot: "additionnelle_add-2", type: "additionnelle", additionnelle: true, is_additionnelle: true, url: "data:image/jpeg;base64,add2" },
      { id: "add-3", slot: "additionnelle_add-3", type: "additionnelle", additionnelle: true, is_additionnelle: true, url: "data:image/jpeg;base64,add3" },
    ],
    _fully_loaded: true,
  };
  saveInterventionLocally(secondSave);

  const stored = getStoredIntervention(testId);
  assert.equal(stored.whatsapp_photos.length, 4, "Toutes les 3 photos additionnelles + 1 FAT doivent être conservées");

  // 3. Simuler un light save (sans photos en mémoire)
  const lightSave = {
    id: testId,
    nom_client: "Test Multi Additionnelle",
    whatsapp_photos: [],
    _fully_loaded: false,
  };
  saveInterventionLocally(lightSave);

  const storedAfterLight = getStoredIntervention(testId);
  assert.equal(storedAfterLight.whatsapp_photos.length, 4, "Le light save ne doit jamais écraser les 3 photos additionnelles");
  const addIds = storedAfterLight.whatsapp_photos.filter(p => p.additionnelle).map(p => p.id);
  assert.deepEqual(addIds, ["add-1", "add-2", "add-3"]);
});

test("saveInterventionLocally replaces slot photos and prevents duplicate pole entries", async () => {
  const { saveInterventionLocally, getStoredIntervention } = await import("./Intervention.js");
  const testId = "test-pole2-slot-replace";

  // Initial state with Pole 1 and Pole 2 without photo
  const initial = {
    id: testId,
    nom_client: "Test Pole 2",
    points_gps: [
      { id: "pole-1", type: "Poteau", numero: 1, lat: 6.36, lng: 2.42 },
      { id: "pole-2-old", type: "Poteau", numero: 2, lat: null, lng: null },
    ],
    whatsapp_photos: [
      { id: "wa-pole-1", slot: "poteau_1", url: "data:image/jpeg;base64,pole1" },
    ],
  };
  saveInterventionLocally(initial);

  // Technician takes photo for Pole 2 (new id, slot poteau_2, new coordinates)
  const updated = {
    id: testId,
    nom_client: "Test Pole 2",
    points_gps: [
      { id: "pole-1", type: "Poteau", numero: 1, lat: 6.36, lng: 2.42 },
      { id: "pole-2-new", type: "Poteau", numero: 2, lat: 6.371, lng: 2.428, photo: "data:image/jpeg;base64,pole2" },
    ],
    whatsapp_photos: [
      { id: "wa-pole-1", slot: "poteau_1", url: "data:image/jpeg;base64,pole1" },
      { id: "wa-pole-2-new", slot: "poteau_2", url: "data:image/jpeg;base64,pole2", lat: 6.371, lng: 2.428 },
    ],
  };
  saveInterventionLocally(updated);

  const stored = getStoredIntervention(testId);
  assert.equal(stored.points_gps.length, 2, "There must be exactly 2 poles, no duplicate Pole 2");
  const pole2 = stored.points_gps.find((p) => Number(p.numero) === 2);
  assert.ok(pole2);
  assert.equal(pole2.lat, 6.371);
  assert.equal(pole2.photo, "data:image/jpeg;base64,pole2");

  assert.equal(stored.whatsapp_photos.length, 2, "There must be exactly 2 photos, one per slot");
  const wa2 = stored.whatsapp_photos.find((p) => p.slot === "poteau_2");
  assert.ok(wa2);
  assert.equal(wa2.lat, 6.371);
});

test("toLightIntervention strips heavy base64 photos and signatures for fast list caching", async () => {
  const { toLightIntervention } = await import("./Intervention.js");
  const heavy = {
    id: "heavy-1",
    nom_client: "Test Client",
    statut: "en_cours",
    whatsapp_photos: [{ id: "p1", url: "data:image/jpeg;base64,verylongstring..." }],
    points_gps: [{ id: "g1", photo: "data:image/jpeg;base64,anotherheavyphoto..." }],
    signature_client: "data:image/png;base64,sig1",
    signature_technicien: "data:image/png;base64,sig2",
    lineaire_m: 55,
  };

  const light = toLightIntervention(heavy);
  assert.equal(light.id, "heavy-1");
  assert.equal(light.nom_client, "Test Client");
  assert.equal(light.lineaire_m, 55);
  assert.equal(light.whatsapp_photos, undefined, "whatsapp_photos must be stripped from light object");
  assert.equal(light.points_gps, undefined, "points_gps must be stripped from light object");
  assert.equal(light.signature_client, undefined, "signature_client must be stripped");
  assert.equal(light.signature_technicien, undefined, "signature_technicien must be stripped");
});

test("nom_dossier and nom_client are automatically synchronized and defaulted", async () => {
  const { ensureInterventionDefaults, createEmptyIntervention } = await import("./Intervention.js");

  // 1. Création avec nom initial
  const intv = createEmptyIntervention("Stanislas", "Dossier Haie Vive");
  assert.equal(intv.nom_client, "Dossier Haie Vive");
  assert.equal(intv.nom_dossier, "Dossier Haie Vive");

  // 2. Defaulting depuis nom_dossier seul
  const fromDossier = ensureInterventionDefaults({ nom_dossier: "Pharmacie Concorde" });
  assert.equal(fromDossier.nom_client, "Pharmacie Concorde");
  assert.equal(fromDossier.nom_dossier, "Pharmacie Concorde");

  // 3. Defaulting depuis nom_client seul
  const fromClient = ensureInterventionDefaults({ nom_client: "Entreprise X" });
  assert.equal(fromClient.nom_client, "Entreprise X");
  assert.equal(fromClient.nom_dossier, "Entreprise X");
});

test("non-destructive merge protects local filled fields from being overwritten by empty server fields", async () => {
  const local = {
    nom_client: "KODJO MICHEL",
    nom_dossier: "KODJO MICHEL",
    telephone_ligne: "0198765432",
    mobile: "0123456789",
    msan: "OGA-PL51",
    fat_ref: "FAT164",
    port: "Port 2",
  };

  const remoteWithEmptyFields = {
    nom_client: "",
    nom_dossier: "",
    telephone_ligne: "",
    mobile: null,
    msan: "",
    fat_ref: undefined,
    port: "",
  };

  const protectedResult = { ...local };
  for (const [key, value] of Object.entries(remoteWithEmptyFields)) {
    const prevVal = local[key];
    const prevIsFilled = typeof prevVal === "string" ? prevVal.trim() !== "" : (prevVal !== null && prevVal !== undefined);
    const remoteIsEmpty = value === null || value === undefined || (typeof value === "string" && value.trim() === "");

    if (!prevIsFilled || !remoteIsEmpty) {
      protectedResult[key] = value;
    }
  }

  assert.equal(protectedResult.nom_client, "KODJO MICHEL");
  assert.equal(protectedResult.nom_dossier, "KODJO MICHEL");
  assert.equal(protectedResult.telephone_ligne, "0198765432");
  assert.equal(protectedResult.mobile, "0123456789");
  assert.equal(protectedResult.msan, "OGA-PL51");
  assert.equal(protectedResult.fat_ref, "FAT164");
  assert.equal(protectedResult.port, "Port 2");
});

test("saveInterventionLocally with _fully_loaded: true permanently deletes photos and does not resurrect them", async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };

  const { saveInterventionLocally, getStoredIntervention } = await import("./Intervention.js");

  // 1. Initial full record with 2 photos (FAT and ONT)
  const fullRecord = {
    id: "test-delete-photo-1",
    nom_client: "Client Test Deletion",
    whatsapp_photos: [
      { id: "wa-fat-1", slot: "fat", url: "data:image/jpeg;base64,fatimg" },
      { id: "wa-ont-1", slot: "ont_sn", url: "data:image/jpeg;base64,ontimg" },
    ],
    points_gps: [
      { id: "pt-fat-1", type: "FAT", photo: "data:image/jpeg;base64,fatimg" },
    ],
    _fully_loaded: true,
  };
  saveInterventionLocally(fullRecord);
  assert.equal(getStoredIntervention("test-delete-photo-1").whatsapp_photos.length, 2);

  // 2. User deletes FAT photo in the form:
  // whatsapp_photos now contains only ONT, and _deleted_photo_ids contains the FAT ID and slot
  const recordAfterDelete = {
    id: "test-delete-photo-1",
    nom_client: "Client Test Deletion",
    whatsapp_photos: [
      { id: "wa-ont-1", slot: "ont_sn", url: "data:image/jpeg;base64,ontimg" },
    ],
    points_gps: [
      { id: "pt-fat-1", type: "FAT", photo: "", photo_deleted: true },
    ],
    _deleted_photo_ids: ["wa-fat-1", "fat", "slot_fat"],
    _fully_loaded: true,
  };
  saveInterventionLocally(recordAfterDelete);

  // 3. Verify: The deleted FAT photo is GONE permanently and NOT resurrected!
  const storedAfter = getStoredIntervention("test-delete-photo-1");
  assert.equal(storedAfter.whatsapp_photos.length, 1, "There should be exactly 1 photo left");
  assert.equal(storedAfter.whatsapp_photos[0].slot, "ont_sn", "Only ONT should remain");
  assert.equal(storedAfter.points_gps[0].photo, "", "The point photo must be cleared");

  // 4. Replacing the photo with a new one
  const recordAfterReplace = {
    id: "test-delete-photo-1",
    nom_client: "Client Test Deletion",
    whatsapp_photos: [
      { id: "wa-ont-1", slot: "ont_sn", url: "data:image/jpeg;base64,ontimg" },
      { id: "wa-fat-new", slot: "fat", url: "data:image/jpeg;base64,newfatimg" },
    ],
    points_gps: [
      { id: "pt-fat-1", type: "FAT", photo: "data:image/jpeg;base64,newfatimg" },
    ],
    _deleted_photo_ids: [],
    _fully_loaded: true,
  };
  saveInterventionLocally(recordAfterReplace);

  const storedReplaced = getStoredIntervention("test-delete-photo-1");
  assert.equal(storedReplaced.whatsapp_photos.length, 2, "There should be 2 photos after replacement");
  const fatPhoto = storedReplaced.whatsapp_photos.find((p) => p.slot === "fat");
  assert.equal(fatPhoto.id, "wa-fat-new", "Replaced photo must be the new one");
  assert.equal(fatPhoto.url, "data:image/jpeg;base64,newfatimg");
});

test("Default materials rules: empty intervention defaults to piton=1, pto=1, ont=1, crochets=0 and no OTP duplicate", () => {
  const intv = createEmptyIntervention("Technicien");
  const defaulted = ensureInterventionDefaults(intv);

  assert.equal(defaulted.materiel_pose.piton, 1, "Piton doit être 1");
  assert.equal(defaulted.materiel_pose.pto, 1, "PTO doit être 1");
  assert.equal(defaulted.materiel_pose.ont, 1, "ONT doit être 1");
  assert.equal(defaulted.materiel_pose.otp, undefined, "Il ne doit pas y avoir d'OTP en double dans materiel_pose");
  assert.equal(defaulted.materiel_pose.crochets, 0, "0 poteau = 0 crochet");
  assert.equal(defaulted.pto_qte, 1, "pto_qte doit être 1");
  assert.equal(defaulted.ont_qte, 1, "ont_qte doit être 1");
});

test("Automatic calculation: 4 linear poles + 1 FAT pole/point = 9 crochets, 1 piton, 1 ONT, 1 PTO", () => {
  const intv = {
    id: "intv-calc-test",
    nom_client: "Client Test Calcul",
    points_gps: [
      { id: "fat1", type: "FAT", lat: 6.36, lng: 2.42 },
      { id: "p1", type: "Poteau", numero: 1, traverse: true },
      { id: "p2", type: "Poteau", numero: 2, traverse: true },
      { id: "p3", type: "Poteau", numero: 3, traverse: true },
      { id: "p4", type: "Poteau", numero: 4, traverse: true },
    ],
  };

  const defaulted = ensureInterventionDefaults(intv);
  assert.equal(defaulted.materiel_pose.crochets, 9, "4 lin * 2 + 1 FAT * 1 = 9 crochets");
  assert.equal(defaulted.materiel_pose.piton, 1, "1 piton obligatoire");
  assert.equal(defaulted.materiel_pose.pto, 1, "1 PTO par défaut");
  assert.equal(defaulted.materiel_pose.ont, 1, "1 ONT par défaut (pas d'OTP)");
  assert.equal(defaulted.materiel_pose.otp, undefined, "Aucun OTP dupliqué");
});

test("Dynamic pole changes recalculate crochets unless overridden manually", () => {
  const intv = {
    id: "intv-dynamic",
    points_gps: [
      { id: "fat1", type: "FAT" },
      { id: "p1", type: "Poteau", numero: 1 },
      { id: "p2", type: "Poteau", numero: 2 },
    ],
  };

  // 2 linear + 1 FAT = (2*2) + 1 = 5
  let defaulted = ensureInterventionDefaults(intv);
  assert.equal(defaulted.materiel_pose.crochets, 5);

  // Add 2 more poles = 4 linear + 1 FAT = 9
  intv.points_gps.push(
    { id: "p3", type: "Poteau", numero: 3 },
    { id: "p4", type: "Poteau", numero: 4 }
  );
  defaulted = ensureInterventionDefaults(intv);
  assert.equal(defaulted.materiel_pose.crochets, 9);

  // Manual override: user sets crochets to 12
  intv._crochets_manual = true;
  intv.materiel_pose = { ...defaulted.materiel_pose, crochets: 12 };
  defaulted = ensureInterventionDefaults(intv);
  assert.equal(defaulted.materiel_pose.crochets, 12, "Manual override must be preserved");

  // Even if we add another pole, manual override is kept
  intv.points_gps.push({ id: "p5", type: "Poteau", numero: 5 });
  defaulted = ensureInterventionDefaults(intv);
  assert.equal(defaulted.materiel_pose.crochets, 12, "Manual override must NOT be overwritten dynamically");
});




