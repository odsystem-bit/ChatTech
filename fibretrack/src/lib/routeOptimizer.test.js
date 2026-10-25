import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCoordinateInput,
  isValidCoordinate,
  extractClientCoordinates,
  formatDistance,
  formatEstimatedDuration,
  calculateRouteDistance,
  detectClientClusters,
  solveOptimalTour,
  buildNavigationUrl,
  buildNativeGeoUri,
} from "./routeOptimizer.js";

test("isValidCoordinate - validation rigoureuse des coordonnées terrestres", () => {
  assert.equal(isValidCoordinate(6.3712, 2.3948), true);
  assert.equal(isValidCoordinate(-12.5, 45.2), true);
  assert.equal(isValidCoordinate(0, 0), false, "0,0 doit être rejeté (point non initialisé)");
  assert.equal(isValidCoordinate(95, 2.39), false, "Latitude > 90 rejetée");
  assert.equal(isValidCoordinate(6.37, 195), false, "Longitude > 180 rejetée");
  assert.equal(isValidCoordinate("non_nombre", 2.39), false);
  assert.equal(isValidCoordinate(null, null), false);
});

test("parseCoordinateInput - extrait correctement depuis plusieurs formats", () => {
  // 1. Deux nombres décimaux avec virgule
  const r1 = parseCoordinateInput("6.371234, 2.394852");
  assert.ok(r1);
  assert.equal(Math.round(r1.lat * 10000), 63712);
  assert.equal(Math.round(r1.lng * 10000), 23949);

  // 2. Point-virgule ou espaces
  const r2 = parseCoordinateInput("6.3654; 2.4123");
  assert.ok(r2);
  assert.equal(Math.round(r2.lat * 10000), 63654);

  // 3. URL Google Maps avec paramètre ?q=
  const r3 = parseCoordinateInput("https://maps.google.com/?q=6.375472,2.369229");
  assert.ok(r3);
  assert.equal(Math.round(r3.lat * 1000), 6375);
  assert.equal(Math.round(r3.lng * 1000), 2369);

  // 4. URL Google Maps avec @lat,lng
  const r4 = parseCoordinateInput("https://www.google.com/maps/@6.370500,2.391200,17z");
  assert.ok(r4);
  assert.equal(Math.round(r4.lat * 1000), 6371);

  // 5. Coordonnées DMS
  const r5 = parseCoordinateInput('6°22\'16.4"N 2°23\'41.5"E');
  assert.ok(r5);
  assert.ok(r5.lat > 6.37 && r5.lat < 6.38);
  assert.ok(r5.lng > 2.39 && r5.lng < 2.40);

  // 6. Objet déjà structuré
  const r6 = parseCoordinateInput({ lat: 6.36, lng: 2.38 });
  assert.deepEqual(r6, { lat: 6.36, lng: 2.38 });

  // 7. Entrée invalide
  assert.equal(parseCoordinateInput("rue sans chiffres"), null);
  assert.equal(parseCoordinateInput(""), null);
  assert.equal(parseCoordinateInput(null), null);
});

test("extractClientCoordinates - priorités d'extraction depuis un dossier", () => {
  // 1. Priorité aux coordonnées directes
  const d1 = {
    id: "1",
    nom_client: "Client A",
    latitude: 6.3701,
    longitude: 2.3902,
  };
  const c1 = extractClientCoordinates(d1);
  assert.equal(c1.source, "direct");
  assert.equal(c1.lat, 6.3701);

  // 2. Priorité au point 'Abonné' dans points_gps
  const d2 = {
    id: "2",
    nom_client: "Client B",
    points_gps: [
      { type: "Poteau", lat: 6.375, lng: 2.395 },
      { type: "Abonné", lat: 6.376, lng: 2.396 },
    ],
  };
  const c2 = extractClientCoordinates(d2);
  assert.equal(c2.source, "points_gps_abonne");
  assert.equal(c2.lat, 6.376);

  // 3. Fallback sur FAT ou photo
  const d3 = {
    id: "3",
    nom_client: "Client C",
    latitude_fat: 6.381,
    longitude_fat: 2.401,
  };
  const c3 = extractClientCoordinates(d3);
  assert.equal(c3.source, "fat_coords");
  assert.equal(c3.lat, 6.381);

  // 4. Fallback sur métadonnées de photo
  const d4 = {
    id: "4",
    nom_client: "Client D",
    photos: {
      photo_pto: { gps: { lat: 6.385, lng: 2.405 } },
    },
  };
  const c4 = extractClientCoordinates(d4);
  assert.equal(c4.source, "photo_photo_pto");
  assert.equal(c4.lat, 6.385);

  // 5. Dossier sans aucune coordonnée
  const d5 = { id: "5", nom_client: "Client E" };
  assert.equal(extractClientCoordinates(d5), null);
});

test("formatDistance & formatEstimatedDuration - lisibilité terrain", () => {
  assert.equal(formatDistance(450), "450 m");
  assert.equal(formatDistance(950), "950 m");
  assert.equal(formatDistance(1200), "1.2 km");
  assert.equal(formatDistance(12800), "12.8 km");
  assert.equal(formatDistance(null), "--");

  assert.equal(formatEstimatedDuration(450), "1 min");
  assert.equal(formatEstimatedDuration(2500), "6 min");
  assert.equal(formatEstimatedDuration(12500), "30 min");
});

test("detectClientClusters - identifie les regroupements dans le même secteur", () => {
  // Clients A et B sont dans le même quartier (à ~400m)
  // Client C est isolé à 8 km
  const clients = [
    { id: "1", nom_client: "Moussa (Agla)", lat: 6.375, lng: 2.369, adresse_zone: "Agla, Cotonou" },
    { id: "2", nom_client: "Koffi (Agla)", lat: 6.378, lng: 2.371, adresse_zone: "Agla, Cotonou" },
    { id: "3", nom_client: "Ayaba (Akpakpa)", lat: 6.360, lng: 2.450, adresse_zone: "Akpakpa, Cotonou" },
  ];

  const clusters = detectClientClusters(clients, 1500);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].clientNames.length, 2);
  assert.ok(clusters[0].clientNames.includes("Moussa (Agla)"));
  assert.ok(clusters[0].clientNames.includes("Koffi (Agla)"));
  assert.ok(clusters[0].minDistanceMeters < 600);
  assert.ok(clusters[0].description.includes("regroupés"));
});

test("solveOptimalTour - résout la tournée et recommande par quel client démarrer", () => {
  // Position technicien (base à Cotonou Cadjehoun)
  const techPos = { lat: 6.3600, lng: 2.3800 };

  // 4 clients du jour :
  // - Client 1 (Cadjehoun, à ~700m du technicien)
  // - Client 2 (Cadjehoun, à ~1.1km du technicien, mais à 400m de Client 1)
  // - Client 3 (Akpakpa, à ~8km)
  // - Client 4 (Akpakpa, à ~8.4km, mais à 450m de Client 3)
  const dossiers = [
    { id: "d3", nom_client: "Client 3 (Akpakpa 1)", latitude: 6.3650, longitude: 2.4500, adresse_zone: "Akpakpa" },
    { id: "d1", nom_client: "Client 1 (Cadjehoun 1)", latitude: 6.3640, longitude: 2.3840, adresse_zone: "Cadjehoun" },
    { id: "d4", nom_client: "Client 4 (Akpakpa 2)", latitude: 6.3670, longitude: 2.4540, adresse_zone: "Akpakpa" },
    { id: "d2", nom_client: "Client 2 (Cadjehoun 2)", latitude: 6.3660, longitude: 2.3870, adresse_zone: "Cadjehoun" },
  ];

  const result = solveOptimalTour(techPos, dossiers);

  assert.equal(result.hasOrigin, true);
  // Le client recommandé pour démarrer doit être le Client 1 (le plus proche de la base)
  assert.equal(result.recommendedFirst.id, "d1");
  assert.equal(result.orderedDossiers[0].id, "d1");
  assert.equal(result.orderedDossiers[1].id, "d2");

  // Vérifier que la séquence ordonnée regroupe bien Cadjehoun puis Akpakpa
  const orderedIds = result.orderedDossiers.map((d) => d.id);
  assert.deepEqual(orderedIds, ["d1", "d2", "d3", "d4"]);

  // Vérifier la décomposition des jambes (legs)
  assert.equal(result.legs.length, 4);
  assert.equal(result.legs[0].toDossier.id, "d1");
  assert.equal(result.legs[0].isFirst, true);

  // Clusters détectés : Cadjehoun et Akpakpa
  assert.ok(result.clusters.length >= 2, "Doit détecter les clusters Cadjehoun et Akpakpa");

  // Distance et durée
  assert.ok(result.totalDistanceMeters > 0);
  assert.ok(typeof result.formattedTotalDistance === "string");
  assert.ok(typeof result.formattedTotalDuration === "string");
});

test("solveOptimalTour - gère les dossiers non localisés sans crash", () => {
  const techPos = { lat: 6.36, lng: 2.38 };
  const dossiers = [
    { id: "d1", nom_client: "Localisé", latitude: 6.37, longitude: 2.39 },
    { id: "d2", nom_client: "Sans GPS", latitude: null, longitude: null },
  ];

  const result = solveOptimalTour(techPos, dossiers);
  assert.equal(result.orderedDossiers.length, 1);
  assert.equal(result.unlocatedDossiers.length, 1);
  assert.equal(result.unlocatedDossiers[0].id, "d2");
});

test("buildNavigationUrl & buildNativeGeoUri - génération des liens de navigation", () => {
  const url = buildNavigationUrl(6.3712, 2.3948, "Moussa Agla");
  assert.ok(url.includes("google.com/maps/dir"));
  assert.ok(url.includes("destination=6.3712,2.3948"));
  assert.ok(url.includes("Moussa"));

  const geoUri = buildNativeGeoUri(6.3712, 2.3948, "Moussa");
  assert.ok(geoUri.startsWith("geo:6.3712,2.3948"));
});
