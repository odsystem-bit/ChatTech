import test from "node:test";
import assert from "node:assert/strict";
import {
  extractPortNumber,
  computeAvailablePorts,
  TOTAL_FAT_PORTS,
  ALL_FAT_PORTS,
} from "./ports.js";

test("TOTAL_FAT_PORTS est de 8 ports", () => {
  assert.equal(TOTAL_FAT_PORTS, 8);
  assert.equal(ALL_FAT_PORTS.length, 8);
  assert.equal(ALL_FAT_PORTS[0], "Port 1");
  assert.equal(ALL_FAT_PORTS[7], "Port 8");
});

test("extractPortNumber extrait fidèlement les numéros de port", () => {
  assert.equal(extractPortNumber(3), 3);
  assert.equal(extractPortNumber("3"), 3);
  assert.equal(extractPortNumber("Port 3"), 3);
  assert.equal(extractPortNumber("port 5"), 5);
  assert.equal(extractPortNumber("PORT 7"), 7);
  assert.equal(extractPortNumber("Port 8"), 8);
  assert.equal(extractPortNumber("Port 1"), 1);
  assert.equal(extractPortNumber(""), null);
  assert.equal(extractPortNumber(null), null);
  assert.equal(extractPortNumber(undefined), null);
  assert.equal(extractPortNumber("invalide"), null);
});

test("Règle cahier des charges : Port 3 -> ports 4, 5, 6, 7 et 8", () => {
  const res = computeAvailablePorts(3);
  assert.deepEqual(res.portsList, ["Port 4", "Port 5", "Port 6", "Port 7", "Port 8"]);
  assert.equal(res.ports_disponibles, "Port 4, Port 5, Port 6, Port 7, Port 8");
  assert.equal(res.port_disponible, 5);
});

test("Règle cahier des charges : Port 5 -> ports 6, 7 et 8", () => {
  const res = computeAvailablePorts("Port 5");
  assert.deepEqual(res.portsList, ["Port 6", "Port 7", "Port 8"]);
  assert.equal(res.ports_disponibles, "Port 6, Port 7, Port 8");
  assert.equal(res.port_disponible, 3);
});

test("Règle cahier des charges : Port 7 -> port 8", () => {
  const res = computeAvailablePorts("7");
  assert.deepEqual(res.portsList, ["Port 8"]);
  assert.equal(res.ports_disponibles, "Port 8");
  assert.equal(res.port_disponible, 1);
});

test("Règle cahier des charges : Port 8 -> aucun port disponible", () => {
  const res = computeAvailablePorts(8);
  assert.deepEqual(res.portsList, []);
  assert.equal(res.ports_disponibles, "");
  assert.equal(res.port_disponible, 0);
});

test("Cas extrême : Port 1 -> ports 2, 3, 4, 5, 6, 7, 8 (7 ports)", () => {
  const res = computeAvailablePorts(1);
  assert.equal(res.port_disponible, 7);
  assert.equal(res.portsList[0], "Port 2");
  assert.equal(res.portsList[6], "Port 8");
});

test("Cas vide ou non renseigné : aucun port sélectionné automatiquement", () => {
  const res = computeAvailablePorts("");
  assert.deepEqual(res.portsList, []);
  assert.equal(res.port_disponible, 0);
  assert.equal(res.ports_disponibles, "");
});
