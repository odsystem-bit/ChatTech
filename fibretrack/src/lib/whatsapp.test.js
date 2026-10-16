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

test("Rapports dynamiques - s'adaptent à 100% à une autre région, autre équipe, autre client et autre matériel", () => {
  const autreIntervention = {
    nom_technicien: "Aubin K.",
    date: "2026-10-18",
    nom_client: "KOUASSI BERNADETTE",
    etat: "PON",
    msan: "PKU-NORD",
    fat_ref: "FAT055",
    port: 4,
    ports_disponibles: "Port 5, Port 6, Port 7, Port 8",
    type_cable: "CPC",
    depart_m: 0,
    arrivee_m: 150,
    lineaire_m: 150,
    puissance_fat_dbm: -18.25,
    puissance_pto_dbm: -18.90,
    mac: "548998ABCDEF",
    sn: "HWTC99887766",
    telephone_ligne: "0121334455",
    mobile: "0195667788",
    materiel_pose: {
      ont: 1,
      pto: 1,
      jarretiere: 1,
      pince: 2,
      crochets: 8,
      piton: 2,
      cheville: 2,
      traverse_13t: 1,
      cpc_150: 1,
    },
    points_gps: [
      { type: "FAT", lat: 9.3512, lng: 2.6288 },
      { type: "Abonné", lat: 9.3540, lng: 2.6295 },
      { type: "Poteau", numero: 1, proprietaire: "SBEE", traverse: true, lat: 9.3518, lng: 2.6289 },
      { type: "Poteau", numero: 2, proprietaire: "Petit Jean", traverse: true, lat: 9.3524, lng: 2.6291 },
      { type: "Poteau", numero: 3, proprietaire: "Petit Jean", traverse: true, lat: 9.3531, lng: 2.6293 },
      { type: "Poteau", numero: 1, implante: true, lat: 9.3537, lng: 2.6294 },
    ],
  };

  // 1. Test Rapport Global
  const global = generateGlobalReport(autreIntervention, { realises: 3, recus: 5 });
  assert.ok(global.includes("*Chef d'Équipe : Aubin K.*"));
  assert.ok(global.includes("*03 Réalisés / 05 Reçus*"));
  assert.ok(global.includes("*2026-10-18*"));
  assert.ok(global.includes("*Client: KOUASSI BERNADETTE*"));
  assert.ok(global.includes("*Msan: PKU-NORD  FAT055*"));
  assert.ok(global.includes("*Port:4*"));
  assert.ok(global.includes("*Linéaire:150.0m*"));
  assert.ok(global.includes("*Puissance FAT: -18.25 dBm*"));
  assert.ok(global.includes("*Puissance PTO: -18.90 dBm*"));
  assert.ok(global.includes("*MAC: 548998ABCDEF*"));
  assert.ok(global.includes("*SN : HWTC99887766*"));
  assert.ok(global.includes("*CPC 150: 01*"));
  assert.ok(global.includes("*CPC 200: 00*"));
  assert.ok(global.includes("*Pince:02*"));
  assert.ok(global.includes("*Crochets:08*"));
  assert.ok(global.includes("*Poteaux implanté : 01*"));
  assert.ok(global.includes("*GPS poteaux implantés*"));
  assert.ok(global.includes("*GPS PT1: 9.3537,2.6294*"));
  assert.ok(global.includes("*GPS abonné: 9.354,2.6295*"));
  assert.ok(global.includes("*GPS FAT: 9.3512,2.6288*"));

  // 2. Test Rapport de Conformité
  const conformite = generateConformiteReport(autreIntervention);
  assert.ok(conformite.includes("Équipe : Aubin K."));
  assert.ok(conformite.includes("18/10/2026"));
  assert.ok(conformite.includes("Client : KOUASSI BERNADETTE"));
  assert.ok(conformite.includes("Ligne : 0121334455"));
  assert.ok(conformite.includes("MSAN : PKU-NORD  FAT055"));
  assert.ok(conformite.includes("Linéaire : 150 m"));
  assert.ok(conformite.includes("GPS FAT : 9.3512, 2.6288"));
  assert.ok(conformite.includes("GPS abonné : 9.354, 2.6295"));
  assert.ok(conformite.includes("Poteaux traversés : 03"));
  assert.ok(conformite.includes("Poteau SBEE : 01") || conformite.includes("Poteaux SBEE : 01"));
  assert.ok(conformite.includes("Poteaux Petit Jean : 02"));
  assert.ok(conformite.includes("Poteaux implantés : 01"));
  assert.ok(!conformite.includes("Rodolpho"));
  assert.ok(!conformite.includes("Cotonou"));
  assert(!conformite.includes("ODOUNLAMI"));
});

test("Rapport - extrait automatiquement le GPS FAT et Abonné depuis les photos CelPros si points_gps est absent", () => {
  const interventionAvecPhotosSeules = {
    nom_technicien: "Marius T.",
    date: "2026-10-16",
    nom_client: "HOUNGBO FELIX",
    msan: "SEM-PL03",
    fat_ref: "FAT202",
    lineaire_m: 100,
    points_gps: [], // aucun point GPS saisi dans l'onglet Poteaux & GPS
    whatsapp_photos: [
      { slot: "fat", lat: 6.36541, lng: 2.41289 },
      { slot: "ont_sn", lat: 6.36620, lng: 2.41355 },
    ],
  };

  const globalRep = generateGlobalReport(interventionAvecPhotosSeules);
  assert.ok(globalRep.includes("*GPS FAT: 6.36541,2.41289*"));
  assert.ok(globalRep.includes("*GPS abonné: 6.3662,2.41355*"));

  const confRep = generateConformiteReport(interventionAvecPhotosSeules);
  assert.ok(confRep.includes("GPS FAT : 6.36541, 2.41289"));
  assert.ok(confRep.includes("GPS abonné : 6.3662, 2.41355"));
});

