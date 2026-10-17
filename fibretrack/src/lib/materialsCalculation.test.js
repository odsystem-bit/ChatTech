import test from "node:test";
import assert from "node:assert/strict";
import { calculateMaterials } from "./materialsCalculation.js";

test("calculateMaterials - Exemple concret de l'utilisateur (1 linéaire + 1 FAT + 1 piton = 4 crochets)", () => {
  const intervention = {
    fat_ref: "FAT191",
    points_gps: [
      { id: "p1", type: "Poteau", numero: 1, sous_type: "Poteau FAT", lat: 6.371, lng: 2.431 },
      { id: "p2", type: "Poteau", numero: 2, sous_type: "Traversé", lat: 6.372, lng: 2.432 },
    ],
  };

  const result = calculateMaterials(intervention);
  assert.equal(result.nbLinearPoles, 1, "Doit détecter 1 poteau linéaire");
  assert.equal(result.nbFatPoles, 1, "Doit détecter 1 poteau FAT");
  assert.equal(result.piton, 1, "Piton par défaut = 1");
  assert.equal(result.crochets, 4, "Calcul des crochets : 1 lin * 2 + 1 FAT * 1 + 1 piton * 1 = 4 crochets");
  assert.equal(result.otp, 1, "OTP/ONT par défaut = 1");
  assert.equal(result.pto, 1, "PTO par défaut = 1");
});

test("calculateMaterials - 4 poteaux linéaires + 1 poteau FAT + 1 piton = 10 crochets", () => {
  const intervention = {
    points_gps: [
      { id: "p1", type: "Poteau", numero: 1, sous_type: "Poteau FAT" },
      { id: "p2", type: "Poteau", numero: 2, sous_type: "Traversé" },
      { id: "p3", type: "Poteau", numero: 3, sous_type: "Traversé" },
      { id: "p4", type: "Poteau", numero: 4, sous_type: "Traversé" },
      { id: "p5", type: "Poteau", numero: 5, sous_type: "Traversé" },
    ],
  };

  const result = calculateMaterials(intervention);
  assert.equal(result.nbLinearPoles, 4);
  assert.equal(result.nbFatPoles, 1);
  assert.equal(result.crochets, 10, "4 lin * 2 + 1 FAT * 1 + 1 piton * 1 = 10 crochets");
});

test("calculateMaterials - Calcul dynamique sur ajout et suppression de poteau", () => {
  const base = {
    nb_poteaux_traverses: 2,
  };

  // 2 linéaires + 1 piton = (2*2) + 1 = 5
  assert.equal(calculateMaterials(base).crochets, 5);

  // Ajout d'un 3e poteau linéaire : (3*2) + 1 = 7
  base.nb_poteaux_traverses = 3;
  assert.equal(calculateMaterials(base).crochets, 7);

  // Suppression pour revenir à 1 seul linéaire : (1*2) + 1 = 3
  base.nb_poteaux_traverses = 1;
  assert.equal(calculateMaterials(base).crochets, 3);
});

test("calculateMaterials - Respecte les modifications manuelles de l'utilisateur", () => {
  const intervention = {
    points_gps: [
      { id: "p1", type: "Poteau", numero: 1, sous_type: "Poteau FAT" },
      { id: "p2", type: "Poteau", numero: 2 },
    ],
    materiel_pose: {
      piton: 2, // Modifié manuellement à 2
      pto: 2,   // Modifié manuellement à 2
      otp: 2,   // Modifié manuellement à 2
    },
  };

  const result = calculateMaterials(intervention);
  // 1 lin * 2 + 1 FAT * 1 + 2 pitons * 1 = 2 + 1 + 2 = 5 crochets
  assert.equal(result.crochets, 5);
  assert.equal(result.piton, 2, "La modification manuelle du piton doit être respectée");
  assert.equal(result.pto, 2, "La modification manuelle du PTO doit être respectée");
  assert.equal(result.otp, 2, "La modification manuelle de l'OTP doit être respectée");
});

test("calculateMaterials - Intervention vide (0 poteaux) : pas de crochet tant que non insérés", () => {
  const empty = {
    fat_ref: "FAT-01", // La présence de la boîte FAT seule ne doit PAS inventer de crochet
  };
  const result = calculateMaterials(empty);
  assert.equal(result.crochets, 0, "0 poteau inséré = 0 crochet");
  assert.equal(result.piton, 1, "Piton par défaut = 1");
  assert.equal(result.pto, 1, "PTO par défaut = 1");
  assert.equal(result.otp, 1, "ONT par défaut = 1");
});
