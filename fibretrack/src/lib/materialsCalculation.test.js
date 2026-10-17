import test from "node:test";
import assert from "node:assert/strict";
import { calculateMaterials } from "./materialsCalculation.js";

test("calculateMaterials - Exemple concret de l'utilisateur (4 linéaires + 1 FAT = 9 crochets, 1 piton, 1 OTP, 1 PTO)", () => {
  const intervention = {
    fat_ref: "FAT191",
    points_gps: [
      { id: "fat1", type: "FAT", lat: 6.37, lng: 2.43 },
      { id: "p1", type: "Poteau", numero: 1, sous_type: "Traversé", lat: 6.371, lng: 2.431 },
      { id: "p2", type: "Poteau", numero: 2, sous_type: "Traversé", lat: 6.372, lng: 2.432 },
      { id: "p3", type: "Poteau", numero: 3, sous_type: "Traversé", lat: 6.373, lng: 2.433 },
      { id: "p4", type: "Poteau", numero: 4, sous_type: "Traversé", lat: 6.374, lng: 2.434 },
    ],
  };

  const result = calculateMaterials(intervention);
  assert.equal(result.nbLinearPoles, 4, "Doit détecter 4 poteaux linéaires");
  assert.equal(result.nbFatPoles, 1, "Doit détecter 1 poteau FAT");
  assert.equal(result.crochets, 9, "Calcul des crochets : 4*2 + 1*1 = 9 crochets");
  assert.equal(result.piton, 1, "Piton obligatoire = 1");
  assert.equal(result.otp, 1, "OTP par défaut = 1");
  assert.equal(result.pto, 1, "PTO par défaut = 1");
});

test("calculateMaterials - 5 poteaux où le premier est explicitement Poteau FAT", () => {
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
  assert.equal(result.crochets, 9);
});

test("calculateMaterials - Calcul dynamique sur ajout et suppression de poteau", () => {
  const base = {
    fat_ref: "SEM-PL02 FAT01",
    nb_poteaux_traverses: 2,
  };

  // 2 linéaires + 1 FAT = (2*2) + 1 = 5
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
      { id: "fat1", type: "FAT" },
      { id: "p1", type: "Poteau", numero: 1 },
      { id: "p2", type: "Poteau", numero: 2 },
      { id: "p3", type: "Poteau", numero: 3 },
      { id: "p4", type: "Poteau", numero: 4 },
    ],
    materiel_pose: {
      piton: 2, // Modifié manuellement à 2
      pto: 2,   // Modifié manuellement à 2
      otp: 2,   // Modifié manuellement à 2
    },
  };

  const result = calculateMaterials(intervention);
  assert.equal(result.crochets, 9);
  assert.equal(result.piton, 2, "La modification manuelle du piton doit être respectée");
  assert.equal(result.pto, 2, "La modification manuelle du PTO doit être respectée");
  assert.equal(result.otp, 2, "La modification manuelle de l'OTP doit être respectée");
});

test("calculateMaterials - Intervention vide (0 poteaux)", () => {
  const empty = {};
  const result = calculateMaterials(empty);
  assert.equal(result.crochets, 0);
  assert.equal(result.piton, 1);
  assert.equal(result.pto, 1);
  assert.equal(result.otp, 1);
});
