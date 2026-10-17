import test from "node:test";
import assert from "node:assert/strict";
import {
  formatFileSize,
  formatDuration,
  drawGpsBannerOnCanvas,
  burnGpsBannerOnVideo,
} from "./videoCompression.js";

test("videoCompression - formatFileSize formatte correctement les octets", () => {
  assert.equal(formatFileSize(0), "0 Ko");
  assert.equal(formatFileSize(512), "1 Ko");
  assert.equal(formatFileSize(1024 * 500), "500 Ko");
  assert.equal(formatFileSize(1024 * 1024 * 3.5), "3.50 Mo");
  assert.equal(formatFileSize(1024 * 1024 * 25.4), "25.4 Mo");
});

test("videoCompression - formatDuration formatte les secondes en mm:ss", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(9), "0:09");
  assert.equal(formatDuration(45), "0:45");
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(135), "2:15");
});

test("videoCompression - drawGpsBannerOnCanvas gère les contextes et informations nulles gracieusement", () => {
  // Ne plante pas sur arguments nuls
  assert.doesNotThrow(() => drawGpsBannerOnCanvas(null, 640, 360, null));
  assert.doesNotThrow(() => drawGpsBannerOnCanvas({}, 0, 0, {}));
});

test("videoCompression - drawGpsBannerOnCanvas trace le bandeau avec nom du client, GPS et horodatage", () => {
  const renderedTexts = [];
  const mockCtx = {
    save: () => {},
    restore: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
    fillText: (text) => renderedTexts.push(text),
    font: "",
    fillStyle: "",
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    textBaseline: "",
  };

  const info = {
    client: "Monsieur DOSSOU",
    type: "Vidéo Terrain #1",
    lieu: "Cotonou, Littoral",
    lat: 6.368421,
    lng: 2.421578,
    precision_m: 4.5,
    horodatage: "2026-10-17T08:00:00.000Z",
    technicien: "Jean",
  };

  drawGpsBannerOnCanvas(mockCtx, 1280, 720, info);

  // Vérifier que tous les éléments requis sont bien présents dans les textes dessinés
  assert.ok(renderedTexts.some((t) => t.includes("Monsieur DOSSOU")), "Le nom du client doit figurer sur le bandeau");
  assert.ok(renderedTexts.some((t) => t.includes("Vidéo Terrain #1")), "Le type de vidéo doit figurer sur le bandeau");
  assert.ok(renderedTexts.some((t) => t.includes("Cotonou")), "Le lieu doit figurer sur le bandeau");
  assert.ok(renderedTexts.some((t) => t.includes("6.368421") && t.includes("2.421578")), "Les coordonnées GPS exactes doivent être gravées");
  assert.ok(renderedTexts.some((t) => t.includes("Jean")), "Le nom du technicien doit figurer sur le bandeau");
});

test("videoCompression - burnGpsBannerOnVideo retourne un objet sécurisé sans DOM", async () => {
  const result = await burnGpsBannerOnVideo("https://example.com/video.mp4", {
    client: "Test Client",
  });

  assert.ok(result);
  assert.equal(typeof result, "object");
  assert.equal(result.extension, "mp4");
  assert.equal(result.stamped, false); // Environnement Node sans DOM
});
