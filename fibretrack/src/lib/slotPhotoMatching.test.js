import test from "node:test";
import assert from "node:assert/strict";

/**
 * Logique pure de sélection stricte de photo par slot CelPros.
 * Garantit l'absence totale de permutation de photos entre catégories.
 */
function getPhotoForSlotStrict(slotKey, whatsappPhotos = [], pointsGps = []) {
  if (!slotKey) return null;

  // 1. Recherche par slot ou type direct dans whatsapp_photos (en excluant strictement les photos additionnelles)
  const direct = whatsappPhotos.find(
    (p) =>
      p &&
      !p.additionnelle &&
      !p.is_additionnelle &&
      !p.exclude_celpros &&
      p.slot !== "additionnelle" &&
      p.type !== "additionnelle" &&
      (p.slot === slotKey || p.type === slotKey)
  );
  if (direct) return direct;

  // 2. Recherche STRICTE pour photos historiques ou points GPS
  if (slotKey === "fat") {
    const fatPt = (pointsGps || []).find((p) => p && String(p.type).trim().toUpperCase() === "FAT" && p.photo);
    if (fatPt) {
      return {
        id: `gps_fat_${fatPt.numero || 1}`,
        slot: "fat",
        type: "fat",
        label: "Boîtier FAT",
        url: fatPt.photo,
        from_gps: true,
      };
    }
    const legacyFat = whatsappPhotos.find(
      (p) =>
        p &&
        !p.additionnelle &&
        !p.is_additionnelle &&
        !p.exclude_celpros &&
        p.name &&
        /^(fat|boitier\s*fat)(\s*\d+)?$/i.test(p.name.trim())
    );
    if (legacyFat) return legacyFat;
  }

  if (slotKey === "ont_sn") {
    const abonnePt = (pointsGps || []).find(
      (p) => p && (String(p.type).trim().toUpperCase() === "ABONNÉ" || String(p.type).trim().toUpperCase() === "ONT") && p.photo
    );
    if (abonnePt) {
      return {
        id: `gps_abonne_${abonnePt.numero || 1}`,
        slot: "ont_sn",
        type: "ont_sn",
        label: "Étiquette Box ONT (MAC & SN)",
        url: abonnePt.photo,
        from_gps: true,
      };
    }
    const legacyOnt = whatsappPhotos.find(
      (p) =>
        p &&
        !p.additionnelle &&
        !p.is_additionnelle &&
        !p.exclude_celpros &&
        p.name &&
        /^(abonn[eé]|ont|box)(\s*\d+)?$/i.test(p.name.trim())
    );
    if (legacyOnt) return legacyOnt;
  }

  if (slotKey === "scan_fat") {
    const legacyScan = whatsappPhotos.find(
      (p) =>
        p &&
        !p.additionnelle &&
        !p.is_additionnelle &&
        !p.exclude_celpros &&
        p.name &&
        /^(image\s*scan\s*fat|scan\s*fat|code[- ]barres?\s*fat)(\s*\d+)?$/i.test(p.name.trim())
    );
    if (legacyScan) return legacyScan;
  }

  return null;
}

test("CelPros slot isolation: 'fat' never matches 'mesure_fat' or 'fibre_fat'", () => {
  const photos = [
    {
      id: "photo_mesure_1",
      slot: "mesure_fat",
      type: "mesure_fat",
      label: "Mesure puissance au FAT",
      name: "mesure_fat.jpg",
      description: "Mesure puissance au FAT - Client ASSANI",
      url: "https://example.com/mesure_fat.jpg",
    },
    {
      id: "photo_fibre_1",
      slot: "fibre_fat",
      type: "fibre_fat",
      label: "Fibre au FAT",
      name: "fibre_fat.jpg",
      description: "Fibre au FAT - Client ASSANI",
      url: "https://example.com/fibre_fat.jpg",
    },
  ];

  // Le slot "fat" doit être strictement vide car aucune photo n'a été prise pour le boîtier FAT
  const fatMatch = getPhotoForSlotStrict("fat", photos, []);
  assert.equal(fatMatch, null, "Le slot 'fat' ne doit JAMAIS afficher la photo de mesure_fat ou fibre_fat !");

  // En revanche, le slot 'mesure_fat' retrouve exactement sa photo
  const mesureMatch = getPhotoForSlotStrict("mesure_fat", photos, []);
  assert.ok(mesureMatch);
  assert.equal(mesureMatch.id, "photo_mesure_1");
  assert.equal(mesureMatch.slot, "mesure_fat");
});

test("CelPros slot isolation: 'mesure_fat' never matches 'mesure_pto'", () => {
  const photos = [
    {
      id: "photo_pto_1",
      slot: "mesure_pto",
      type: "mesure_pto",
      label: "Mesure puissance au PTO",
      name: "mesure_pto.jpg",
      description: "Mesure puissance au PTO - Client ASSANI",
      url: "https://example.com/mesure_pto.jpg",
    },
  ];

  const fatMeasureMatch = getPhotoForSlotStrict("mesure_fat", photos, []);
  assert.equal(fatMeasureMatch, null, "'mesure_fat' ne doit pas afficher une photo prise au PTO !");

  const ptoMatch = getPhotoForSlotStrict("mesure_pto", photos, []);
  assert.ok(ptoMatch);
  assert.equal(ptoMatch.id, "photo_pto_1");
});

test("CelPros slot isolation: additional photos (exclude_celpros) are excluded from all CelPros slots", () => {
  const photos = [
    {
      id: "photo_add_1",
      slot: "additionnelle",
      type: "additionnelle",
      label: "Photo additionnelle",
      name: "fat_cable_supp.jpg",
      description: "Photo additionnelle boitier fat",
      additionnelle: true,
      exclude_celpros: true,
      url: "https://example.com/add.jpg",
    },
  ];

  assert.equal(getPhotoForSlotStrict("fat", photos, []), null);
  assert.equal(getPhotoForSlotStrict("cable_interne", photos, []), null);
});

test("CelPros slot isolation: direct slot match takes precedence and respects exact slotKey", () => {
  const photos = [
    { id: "1", slot: "fat", type: "fat", label: "Boîtier FAT", url: "https://example.com/fat.jpg" },
    { id: "2", slot: "scan_fat", type: "scan_fat", label: "image scan fat", url: "https://example.com/scan.jpg" },
    { id: "3", slot: "mesure_fat", type: "mesure_fat", label: "Mesure FAT", url: "https://example.com/m_fat.jpg" },
    { id: "4", slot: "mesure_pto", type: "mesure_pto", label: "Mesure PTO", url: "https://example.com/m_pto.jpg" },
  ];

  assert.equal(getPhotoForSlotStrict("fat", photos, [])?.id, "1");
  assert.equal(getPhotoForSlotStrict("scan_fat", photos, [])?.id, "2");
  assert.equal(getPhotoForSlotStrict("mesure_fat", photos, [])?.id, "3");
  assert.equal(getPhotoForSlotStrict("mesure_pto", photos, [])?.id, "4");
  assert.equal(getPhotoForSlotStrict("cable_interne", photos, []), null);
});
