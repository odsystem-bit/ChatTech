import test from "node:test";
import assert from "node:assert/strict";
import { generateGlobalReport, generateConformiteReport, fmt2 } from "./whatsapp.js";

test("Rapport Global - génère la structure exacte avec puces en gras (*...*)", () => {
  const mockIntervention = {
    nom_technicien: "Rodolpho",
    date: "2026-10-15",
    nom_client: "EOULO OGOUDARE  NICOLE",
    etat: "PON",
    msan: "SEM-PL02",
    fat_ref: "FAT191",
    port: 2,
    ports_disponibles: "Port 3, Port 4, Port 5, Port 6, Port 7, Port 8",
    type_cable: "CPC",
    depart_m: 0,
    arrivee_m: 200,
    lineaire_m: 200,
    puissance_fat_dbm: -19.93,
    puissance_pto_dbm: -19.47,
    mac: "9025F247EC49-59(17)",
    sn: "4857544329E4FBB8",
    nb_poteaux_armes: 1,
    nb_poteaux_traverses: 5,
    nb_poteaux_implantes: 0,
    telephone_ligne: "0121293029",
    mobile: "0197337800",
    materiel_pose: {
      ont: 1,
      pto: 1,
      jarretiere: 1,
      pince: 0,
      crochets: 10,
      susp: 0,
      piton: 1,
      cheville: 1,
      connecteur: 0,
      closer: 0,
      cable_1fo: 0,
      traverse_13t: 0,
      traverse_15t: 1,
      cpc_200: 1,
    },
    points_gps: [
      { type: "Poteau", numero: 1, proprietaire: "SBEE", traverse: true, lat: 6.3796868, lng: 2.5996342 },
      { type: "Poteau", numero: 2, proprietaire: "SBEE", traverse: true, lat: 6.3793048, lng: 2.599595 },
      { type: "Poteau", numero: 3, proprietaire: "Petit Jean", traverse: true, lat: 6.3787602, lng: 2.5998584 },
      { type: "Poteau", numero: 4, proprietaire: "Petit Jean", traverse: true, lat: 6.3785583, lng: 2.599395 },
      { type: "Poteau", numero: 1, arme: true, lat: 6.3820145, lng: 2.5994916 },
      { type: "Abonné", lat: 6.3794279, lng: 2.5992384 },
      { type: "FAT", lat: 6.37951, lng: 2.59950 },
    ],
  };

  const report = generateGlobalReport(mockIntervention, { realises: 0, recus: 0 });

  assert.ok(report.includes("*Chef d'Équipe : Rodolpho*"));
  assert.ok(report.includes("*00 Réalisés / 00 Reçus*"));
  assert.ok(report.includes("*RACCORDEMENT*"));
  assert.ok(report.includes("*2026-10-15*"));
  assert.ok(report.includes("*Client: EOULO OGOUDARE  NICOLE*"));
  assert.ok(report.includes("*Etat:PON*"));
  assert.ok(report.includes("*Msan: SEM-PL02  FAT191*"));
  assert.ok(report.includes("*Port:2*"));
  assert.ok(report.includes("*Ports disponibles: Port 3, Port 4, Port 5, Port 6, Port 7, Port 8*"));
  assert.ok(report.includes("*Type de câble : CPC*"));
  assert.ok(report.includes("*Départ :0.0m*"));
  assert.ok(report.includes("*Arrivée :200.0m*"));
  assert.ok(report.includes("*Linéaire:200.0m*"));
  assert.ok(report.includes("*Puissance FAT: -19.93 dBm*"));
  assert.ok(report.includes("*Puissance PTO: -19.47 dBm*"));
  assert.ok(report.includes("*MAC: 9025F247EC49-59(17)*"));
  assert.ok(report.includes("*SN : 4857544329E4FBB8*"));
  assert.ok(report.includes("*Nombre de poteaux armés : 01*"));
  assert.ok(report.includes("*Nombre de poteaux traversés : 05*"));
  assert.ok(report.includes("*Nombre de poteaux implantés: 00*"));
  assert.ok(report.includes("*ONT: 01*"));
  assert.ok(report.includes("*PTO: 01*"));
  assert.ok(report.includes("*Jarretière: 01*"));
  assert.ok(report.includes("*Pince:00*"));
  assert.ok(report.includes("*Crochets:10*"));
  assert.ok(report.includes("*Susp: 00*"));
  assert.ok(report.includes("*Piton: 01*"));
  assert.ok(report.includes("*Cheville: 01*"));
  assert.ok(report.includes("*Connecteur: 00*"));
  assert.ok(report.includes("*Closer: 00*"));
  assert.ok(report.includes("*Ligne: 0121293029*"));
  assert.ok(report.includes("*Mobile:0197337800*"));
  assert.ok(report.includes("*Traverse 13T: 00*"));
  assert.ok(report.includes("*Traverse 15T: 01*"));
  assert.ok(report.includes("*CPC 200: 01*"));
  assert.ok(report.includes("*CPC 100: 00*"));
  assert.ok(report.includes("*GPS Poteaux traversés*"));
  assert.ok(report.includes("*GPS poteaux SBEE*"));
  assert.ok(report.includes("*GPS PT1: 6.3796868,2.5996342*"));
  assert.ok(report.includes("*GPS poteaux Petit Jean*"));
  assert.ok(report.includes("*GPS PT3: 6.3787602,2.5998584*"));
  assert.ok(report.includes("*Poteaux armés : 01*"));
  assert.ok(report.includes("*GPS PT1: 6.3820145,2.5994916*"));
  assert.ok(report.includes("*GPS abonné: 6.3794279,2.5992384*"));
  assert.ok(report.includes("*GPS FAT: 6.37951,2.5995*"));
});

test("Rapport de Conformité - génère la structure exacte épurée", () => {
  const mockIntervention = {
    nom_technicien: "RODOLPHO",
    date: "2026-10-15",
    nom_client: "ODOUNLAMI CHORIC DAVID OLATOUNDJI ICHEGOUN",
    telephone_ligne: "0121293766",
    msan: "SEM-PL02",
    fat_ref: "FAT140",
    lineaire_m: 350,
    nb_poteaux_traverses: 6,
    nb_poteaux_implantes: 0,
    nb_poteaux_armes: 2,
    points_gps: [
      { type: "FAT", lat: 6.3854482, lng: 2.6129592 },
      { type: "Abonné", lat: 6.3862167, lng: 2.6116733 },
      { type: "Poteau", numero: 1, proprietaire: "SBEE", lat: 6.38580, lng: 2.61296 },
      { type: "Poteau", numero: 2, proprietaire: "SBEE", lat: 6.38603, lng: 2.61289 },
      { type: "Poteau", numero: 3, proprietaire: "SBEE", lat: 6.38643, lng: 2.61285 },
      { type: "Poteau", numero: 1, arme: true, lat: 6.38693, lng: 2.61263 },
      { type: "Poteau", numero: 2, arme: true, lat: 6.38634, lng: 2.61233 },
      { type: "Poteau", numero: 4, proprietaire: "Petit Jean", lat: 6.38614, lng: 2.61170 },
    ],
  };

  const report = generateConformiteReport(mockIntervention);

  assert.ok(report.includes("Équipe : RODOLPHO"));
  assert.ok(report.includes("15/10/2026"));
  assert.ok(report.includes("RACCORDEMENT — CONFORMITÉ"));
  assert.ok(report.includes("Client : ODOUNLAMI CHORIC DAVID OLATOUNDJI ICHEGOUN"));
  assert.ok(report.includes("Ligne : 0121293766"));
  assert.ok(report.includes("MSAN : SEM-PL02  FAT140"));
  assert.ok(report.includes("Linéaire : 350 m"));
  assert.ok(report.includes("GPS FAT : 6.3854482, 2.6129592"));
  assert.ok(report.includes("GPS abonné : 6.3862167, 2.6116733"));
  assert.ok(report.includes("Poteaux traversés : 06"));
  assert.ok(report.includes("Poteaux SBEE : 03") || report.includes("Poteaux SBEE"));
  assert.ok(report.includes("Poteau Petit Jean : 01"));
  assert.ok(report.includes("Poteaux implantés : 00"));
  assert.ok(report.includes("Poteaux armés : 02"));
  assert.ok(report.includes("GPS poteaux SBEE :"));
  assert.ok(report.includes("- PT1 : 6.3858, 2.61296"));
  assert.ok(report.includes("GPS poteaux armés :"));
  assert.ok(report.includes("- Poteau (Armé) 1 : 6.38693, 2.61263"));
  assert.ok(report.includes("GPS poteau Petit Jean : 6.38614, 2.6117"));
});
