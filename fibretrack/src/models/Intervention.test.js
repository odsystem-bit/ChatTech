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
