import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPhotoFilename,
  downloadPhotoFile,
  getStructuredPhotoName,
  downloadVideoFile,
  downloadTextReportFile,
} from "./photoDownload.js";

test("photoDownload - getStructuredPhotoName distinguishes numbered Poteau from Autre Poteau", () => {
  const pole1 = {
    slot: "poteau_1",
    numero: 1,
    label: "Poteau #1 (SBEE)",
    url: "https://fibretrack.mantota.com/api/uploads/photos/intv/poteau_1.jpg",
  };
  const autre1 = {
    slot: "autre_poteau",
    name: "autre_poteau_1.jpg",
    label: "Autre poteau (1)",
    url: "https://fibretrack.mantota.com/api/uploads/photos/intv/autre_poteau_a.jpg",
  };
  const autre2 = {
    slot: "autre_poteau",
    name: "autre_poteau_5.jpg",
    label: "Autre poteau (5)",
    url: "https://fibretrack.mantota.com/api/uploads/photos/intv/autre_poteau_b.jpg",
  };

  assert.equal(getStructuredPhotoName(pole1, 0), "10_Poteau_1.jpg");
  assert.equal(getStructuredPhotoName(autre1, 1), "11_Autre_Poteau_1.jpg");
  assert.equal(getStructuredPhotoName(autre2, 2), "11_Autre_Poteau_5.jpg");
});

test("photoDownload - buildPhotoFilename generates normalized safe filenames", () => {
  const photo1 = {
    title: "Boîtier FAT (PBO Raccordé)",
    horodatage: "2026-10-14T10:30:00.000Z",
    url: "data:image/jpeg;base64,12345",
  };
  const filename1 = buildPhotoFilename(photo1);
  assert.equal(filename1, "boitier_fat_pbo_raccorde_2026-10-14.jpg");

  const photoPng = {
    title: "Photo Contrat Client / Signature",
    horodatage: "2026-10-14T12:00:00.000Z",
    url: "data:image/png;base64,abcdef",
  };
  const filenamePng = buildPhotoFilename(photoPng);
  assert.equal(filenamePng, "photo_contrat_client_signature_2026-10-14.png");

  const photoPoteau = {
    name: "Poteau #3 (SBEE)",
    horodatage: "2026-10-14T14:15:00.000Z",
    url: "https://fibretrack.mantota.com/api/uploads/pole_3.jpg",
  };
  const filenamePoteau = buildPhotoFilename(photoPoteau);
  assert.equal(filenamePoteau, "poteau_3_sbee_2026-10-14.jpg");

  const emptyPhoto = {};
  const filenameEmpty = buildPhotoFilename(emptyPhoto);
  assert.ok(filenameEmpty.startsWith("photo_terrain_"));
  assert.ok(filenameEmpty.endsWith(".jpg"));
});

test("photoDownload - downloadPhotoFile triggers link click for data URL", async () => {
  let createdElement = null;
  let clicked = false;
  let appended = false;
  let removed = false;

  globalThis.document = {
    createElement(tag) {
      if (tag === "a") {
        createdElement = {
          href: "",
          download: "",
          click() {
            clicked = true;
          },
        };
        return createdElement;
      }
      return {};
    },
    body: {
      appendChild(el) {
        if (el === createdElement) appended = true;
      },
      removeChild(el) {
        if (el === createdElement) removed = true;
      },
    },
  };

  const photo = {
    title: "Photo Test",
    url: "data:image/jpeg;base64,99999",
    horodatage: "2026-10-14T12:00:00.000Z",
  };

  const result = await downloadPhotoFile(photo);
  assert.equal(result, "photo_test_2026-10-14.jpg");
  assert.equal(createdElement.download, "photo_test_2026-10-14.jpg");
  assert.equal(createdElement.href, "data:image/jpeg;base64,99999");
  assert.ok(clicked, "Link should have been clicked");
  assert.ok(appended, "Link should have been added to body");
  assert.ok(removed, "Link should have been removed from body");
});

test("photoDownload - downloadPhotoFile throws on empty URL", async () => {
  await assert.rejects(
    async () => {
      await downloadPhotoFile({});
    },
    { message: "URL de photo invalide ou manquante" }
  );
});

test("photoDownload - downloadVideoFile triggers video file download (.mp4)", async () => {
  let createdElement = null;
  let clicked = false;

  globalThis.document = {
    createElement(tag) {
      if (tag === "a") {
        createdElement = {
          href: "",
          download: "",
          click() {
            clicked = true;
          },
        };
        return createdElement;
      }
      return {};
    },
    body: {
      appendChild() {},
      removeChild() {},
    },
  };

  globalThis.URL = {
    createObjectURL() {
      return "blob:fake-video-url";
    },
    revokeObjectURL() {},
  };

  const video = {
    url: "data:video/mp4;base64,AAAA",
    label: "Entree_cable",
  };

  const filename = await downloadVideoFile(video, "Clinique Mahouna", 0);
  assert.equal(filename, "CLINIQUE_MAHOUNA_01_Entree_cable.mp4");
  assert.equal(createdElement.download, "CLINIQUE_MAHOUNA_01_Entree_cable.mp4");
  assert.ok(clicked);
});

test("photoDownload - downloadTextReportFile creates Blob and downloads .txt", () => {
  let createdElement = null;
  let clicked = false;

  globalThis.document = {
    createElement(tag) {
      if (tag === "a") {
        createdElement = {
          href: "",
          download: "",
          click() {
            clicked = true;
          },
        };
        return createdElement;
      }
      return {};
    },
    body: {
      appendChild() {},
      removeChild() {},
    },
  };
  globalThis.URL = {
    createObjectURL() {
      return "blob:fake-report-url";
    },
    revokeObjectURL() {},
  };

  const reportText = "RAPPORT GLOBAL D'INTERVENTION\nClient : Mahouna";
  const filename = downloadTextReportFile(reportText, "Rapport_Global_Mahouna.txt");
  assert.equal(filename, "Rapport_Global_Mahouna.txt");
  assert.equal(createdElement.download, "Rapport_Global_Mahouna.txt");
  assert.equal(createdElement.href, "blob:fake-report-url");
  assert.ok(clicked);
});
