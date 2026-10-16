import test from "node:test";
import assert from "node:assert/strict";
import { findPhotoForSlot, collectCelprosPhotos } from "./slotPhotos.js";
import { buildShareFiles, safeFileName, dataUrlToBlob } from "./reportShare.js";

const SLOTS = [
  { key: "fat", label: "Boîtier FAT" },
  { key: "cable_interne", label: "Entrée câble interne" },
  { key: "autre_poteau", label: "Autre poteau" },
  { key: "mesure_fat", label: "Mesure puissance au FAT" },
  { key: "ont_sn", label: "Photo numéro de série" },
];
const IMG = (n) => `data:image/jpeg;base64,${Buffer.from(`img-${n}`).toString("base64")}`;

test("findPhotoForSlot: strict - jamais de photo d'une autre catégorie", () => {
  const photos = [
    { id: "1", slot: "mesure_fat", url: IMG(1) },
    { id: "2", slot: "cable_interne", url: IMG(2) },
  ];
  assert.equal(findPhotoForSlot(photos, [], "fat"), null);
  assert.equal(findPhotoForSlot(photos, [], "cable_interne").id, "2");
  assert.equal(findPhotoForSlot(photos, [], "mesure_fat").id, "1");
});

test("findPhotoForSlot: les photos additionnelles ne sont jamais une catégorie CelPros", () => {
  const photos = [{ id: "9", slot: "fat", exclude_celpros: true, url: IMG(9) }];
  assert.equal(findPhotoForSlot(photos, [], "fat"), null);
});

test("collectCelprosPhotos: ordre CelPros, poteaux inclus, additionnelles exclues, pas de doublon", () => {
  const data = {
    whatsapp_photos: [
      { id: "a", slot: "mesure_fat", url: IMG("mesure") },
      { id: "b", slot: "fat", url: IMG("fat") },
      { id: "c", slot: "autre_poteau", url: IMG("autre") },
      { id: "d", slot: "additionnelle", additionnelle: true, url: IMG("extra") },
      { id: "e", slot: "poteau_2", type: "poteau", url: IMG("p2") },
    ],
    points_gps: [
      { type: "Poteau", numero: 2, photo: IMG("p2") },
      { type: "Poteau", numero: 1, photo: IMG("p1") },
    ],
  };
  const list = collectCelprosPhotos(data, SLOTS);
  assert.deepEqual(
    list.map((x) => x.key),
    ["fat", "autre_poteau", "mesure_fat", "poteau_1", "poteau_2"]
  );
  assert.ok(!list.some((x) => x.url === IMG("extra")));
});

test("collectCelprosPhotos: aucune photo => liste vide (pas d'invention)", () => {
  assert.deepEqual(collectCelprosPhotos({ whatsapp_photos: [], points_gps: [] }, SLOTS), []);
  assert.deepEqual(collectCelprosPhotos(null, SLOTS), []);
});

test("buildShareFiles: fichiers nommés par catégorie, photo illisible signalée", async () => {
  const entries = [
    { key: "fat", label: "Boîtier FAT", url: IMG("fat") },
    { key: "x", label: "Cassée", url: "data:image/jpeg;base64,%%%" },
  ];
  const { files, failed } = await buildShareFiles(entries);
  assert.equal(files.length, 1);
  assert.equal(files[0].name, "01_Boitier_FAT.jpg");
  assert.equal(files[0].type, "image/jpeg");
  assert.equal(failed.length, 1);
  assert.equal(failed[0].label, "Cassée");
});

test("safeFileName / dataUrlToBlob", async () => {
  assert.equal(safeFileName("Photo numéro de série", 11), "12_Photo_numero_de_serie.jpg");
  const blob = dataUrlToBlob(IMG("hello"));
  assert.equal(await blob.text(), "img-hello");
});
