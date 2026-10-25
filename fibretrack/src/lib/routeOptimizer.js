import { haversineDistanceMeters } from "./geo.js";

/**
 * Analyse et extrait des coordonnées latitude / longitude depuis diverses entrées :
 * - Texte direct : "6.371234, 2.394852" ou "6.371234; 2.394852" ou "6.371234 2.394852"
 * - Lien Google Maps : "https://maps.google.com/?q=6.371234,2.394852" ou "https://www.google.com/maps/@6.371234,2.394852,17z"
 * - Lien court ou format geo : "geo:6.371234,2.394852"
 * - Format DMS : 6°22'16.4"N 2°23'41.5"E
 * @param {string|number|object} input
 * @returns {{lat: number, lng: number}|null}
 */
export function parseCoordinateInput(input) {
  if (!input) return null;

  // Déjà un objet { lat, lng }
  if (typeof input === "object") {
    const lat = Number(input.lat ?? input.latitude);
    const lng = Number(input.lng ?? input.longitude ?? input.lon);
    if (!isNaN(lat) && !isNaN(lng) && isValidCoordinate(lat, lng)) {
      return { lat, lng };
    }
  }

  const str = String(input).trim();
  if (!str) return null;

  // 1. Détection dans une URL Google Maps (?q=lat,lng ou @lat,lng ou /place/lat,lng)
  const urlMatch = str.match(/(?:q=|@|\/place\/)(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i);
  if (urlMatch) {
    const lat = parseFloat(urlMatch[1]);
    const lng = parseFloat(urlMatch[2]);
    if (isValidCoordinate(lat, lng)) {
      return { lat, lng };
    }
  }

  // 2. Détection de deux flottants séparés par virgule, point-virgule ou espaces
  const decimalMatch = str.match(/(-?\d{1,2}(?:\.\d+)?)[,\s;]+(-?\d{1,3}(?:\.\d+)?)/);
  if (decimalMatch) {
    const lat = parseFloat(decimalMatch[1]);
    const lng = parseFloat(decimalMatch[2]);
    if (isValidCoordinate(lat, lng)) {
      return { lat, lng };
    }
  }

  // 3. Format Degrés Minutes Secondes (DMS) ex : 6°22'16.4"N 2°23'41.5"E
  const dmsRegex = /(\d+)[°\s]+(\d+)['\s]+([\d.]+)?["\s]*([NSEWnsew])/g;
  const matches = [...str.matchAll(dmsRegex)];
  if (matches.length >= 2) {
    const parseDmsPart = (m) => {
      const deg = parseFloat(m[1]) || 0;
      const min = parseFloat(m[2]) || 0;
      const sec = parseFloat(m[3]) || 0;
      const dir = (m[4] || "").toUpperCase();
      let val = deg + min / 60 + sec / 3600;
      if (dir === "S" || dir === "W") val = -val;
      return val;
    };
    const lat = parseDmsPart(matches[0]);
    const lng = parseDmsPart(matches[1]);
    if (isValidCoordinate(lat, lng)) {
      return { lat, lng };
    }
  }

  return null;
}

/**
 * Valide les plages acceptables pour une coordonnée GPS terrestre
 */
export function isValidCoordinate(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    (lat !== 0 || lng !== 0) // Rejette 0,0 (golfe de Guinée / coordonnée non initialisée)
  );
}

/**
 * Extrait les coordonnées du client depuis un dossier d'intervention FibreTrack.
 * Priorise dans l'ordre :
 * 1. Coordonnées directes (latitude, longitude)
 * 2. Point GPS de type Abonné / Client / ONT dans points_gps
 * 3. Point GPS de type Poteau ou FAT
 * 4. Métadonnées GPS des photos terrain (photo_pto, scan_pto, facade_client)
 * @param {object} dossier
 * @returns {{lat: number, lng: number, source: string}|null}
 */
export function extractClientCoordinates(dossier) {
  if (!dossier || typeof dossier !== "object") return null;

  // 1. Champs directs latitude & longitude
  if (dossier.latitude != null && dossier.longitude != null) {
    const lat = Number(dossier.latitude);
    const lng = Number(dossier.longitude);
    if (isValidCoordinate(lat, lng)) {
      return { lat, lng, source: "direct" };
    }
  }

  // 2. Tableau points_gps
  if (Array.isArray(dossier.points_gps) && dossier.points_gps.length > 0) {
    // Priorité à l'abonné / ONT / client
    const abonnePt = dossier.points_gps.find(
      (p) => p && /abonné|abonne|client|ont/i.test(p.type || p.label || "")
    );
    if (abonnePt && abonnePt.lat != null && abonnePt.lng != null) {
      const lat = Number(abonnePt.lat);
      const lng = Number(abonnePt.lng);
      if (isValidCoordinate(lat, lng)) {
        return { lat, lng, source: "points_gps_abonne" };
      }
    }

    // Sinon, n'importe quel point GPS valide renseigné sur le dossier
    const anyValidPt = dossier.points_gps.find((p) => {
      if (!p) return false;
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      return isValidCoordinate(lat, lng);
    });
    if (anyValidPt) {
      return {
        lat: Number(anyValidPt.lat),
        lng: Number(anyValidPt.lng),
        source: `points_gps_${anyValidPt.type || "pole"}`,
      };
    }
  }

  // 3. Coordonnées FAT
  if (dossier.latitude_fat != null && dossier.longitude_fat != null) {
    const lat = Number(dossier.latitude_fat);
    const lng = Number(dossier.longitude_fat);
    if (isValidCoordinate(lat, lng)) {
      return { lat, lng, source: "fat_coords" };
    }
  }

  // 4. Métadonnées GPS des photos enregistrées
  if (dossier.photos && typeof dossier.photos === "object") {
    const prioritySlots = ["photo_pto", "scan_pto", "facade_client", "fat", "poteau_raccordement"];
    for (const slot of prioritySlots) {
      const p = dossier.photos[slot];
      if (p && p.gps && p.gps.lat != null && p.gps.lng != null) {
        const lat = Number(p.gps.lat);
        const lng = Number(p.gps.lng);
        if (isValidCoordinate(lat, lng)) {
          return { lat, lng, source: `photo_${slot}` };
        }
      }
    }
  }

  // 5. Photos WhatsApp / terrain
  if (Array.isArray(dossier.whatsapp_photos)) {
    for (const wp of dossier.whatsapp_photos) {
      if (wp && wp.gps && wp.gps.lat != null && wp.gps.lng != null) {
        const lat = Number(wp.gps.lat);
        const lng = Number(wp.gps.lng);
        if (isValidCoordinate(lat, lng)) {
          return { lat, lng, source: "photo_whatsapp" };
        }
      }
    }
  }

  return null;
}

/**
 * Formate une distance en mètres de façon lisible :
 * < 1000m -> "450 m"
 * >= 1000m -> "2.4 km"
 * @param {number} meters
 * @returns {string}
 */
export function formatDistance(meters) {
  if (meters == null || isNaN(meters)) return "--";
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Estime et formate un temps de trajet basé sur une vitesse urbaine moyenne (~25 km/h en ville avec circulation).
 * @param {number} meters
 * @param {number} [speedKmh=25]
 * @returns {string}
 */
export function formatEstimatedDuration(meters, speedKmh = 25) {
  if (meters == null || isNaN(meters) || meters <= 0) return "0 min";
  const speedMetersPerMinute = (speedKmh * 1000) / 60;
  const minutes = Math.max(1, Math.round(meters / speedMetersPerMinute));

  if (minutes < 60) {
    return `${minutes} min`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m > 0 ? ` ${m}min` : ""}`;
}

/**
 * Calcule la distance totale d'une séquence ordonnée de points.
 * @param {{lat: number, lng: number}} origin
 * @param {Array<{lat: number, lng: number}>} stops
 * @returns {number} distance cumulée en mètres
 */
export function calculateRouteDistance(origin, stops = []) {
  if (!stops || stops.length === 0) return 0;
  let total = 0;
  let current = origin;

  for (const stop of stops) {
    if (current && stop) {
      total += haversineDistanceMeters(current.lat, current.lng, stop.lat, stop.lng);
    }
    current = stop;
  }
  return total;
}

/**
 * Détecte les clients situés dans le même secteur géographique ou à très faible distance les uns des autres.
 * Seuil par défaut : 1500 mètres (1.5 km), idéal pour regrouper les interventions lors de la tournée.
 * @param {Array<{id: string, nom_client: string, lat: number, lng: number, adresse_zone?: string}>} items
 * @param {number} [thresholdMeters=1500]
 * @returns {Array<{clusterId: string, clientIds: string[], clientNames: string[], zone: string, minDistanceMeters: number, maxDistanceMeters: number, description: string}>}
 */
export function detectClientClusters(items = [], thresholdMeters = 1500) {
  const validItems = items.filter((item) => item && isValidCoordinate(item.lat, item.lng));
  if (validItems.length < 2) return [];

  const clusters = [];
  const visited = new Set();

  for (let i = 0; i < validItems.length; i++) {
    const itemA = validItems[i];
    if (visited.has(itemA.id)) continue;

    const clusterGroup = [itemA];
    let minPairDist = Infinity;
    let maxPairDist = 0;

    for (let j = i + 1; j < validItems.length; j++) {
      const itemB = validItems[j];
      const dist = haversineDistanceMeters(itemA.lat, itemA.lng, itemB.lat, itemB.lng);
      if (dist <= thresholdMeters) {
        clusterGroup.push(itemB);
        visited.add(itemB.id);
        if (dist < minPairDist) minPairDist = dist;
        if (dist > maxPairDist) maxPairDist = dist;
      }
    }

    if (clusterGroup.length > 1) {
      visited.add(itemA.id);
      const names = clusterGroup.map((c) => c.nom_client || "Client");
      const zoneNames = clusterGroup
        .map((c) => (c.adresse_zone || "").split(",")[0].trim())
        .filter(Boolean);
      const mainZone = zoneNames[0] || "Même secteur";

      clusters.push({
        clusterId: `cluster-${clusters.length + 1}`,
        clientIds: clusterGroup.map((c) => c.id),
        clientNames: names,
        zone: mainZone,
        minDistanceMeters: Math.round(minPairDist === Infinity ? 0 : minPairDist),
        maxDistanceMeters: Math.round(maxPairDist),
        description: `${clusterGroup.length} clients regroupés (${names.join(" & ")}) à ${formatDistance(minPairDist)} d'intervalle`,
      });
    }
  }

  return clusters;
}

/**
 * Calcule toutes les permutations possibles d'un tableau (pour N <= 8, extrêmement rapide).
 */
function getPermutations(arr) {
  if (arr.length <= 1) return [arr];
  const perms = [];
  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const subPerms = getPermutations(remaining);
    for (const sub of subPerms) {
      perms.push([current, ...sub]);
    }
  }
  return perms;
}

/**
 * Résout la tournée optimale pour visiter l'ensemble des clients du jour :
 * 1. Trouve le client recommandé pour démarrer (le plus proche de la position actuelle du technicien).
 * 2. Détermine l'ordre séquentiel optimal (TSP exact ou Nearest-Neighbor) minimisant la distance totale.
 * 3. Détecte les regroupements par secteur.
 * 4. Décompose chaque étape (jambes de route) avec distance et temps estimé.
 *
 * @param {{lat: number, lng: number}|null} technicianPosition
 * @param {Array<object>} dossiers liste des dossiers de la journée
 * @returns {{
 *   hasOrigin: boolean,
 *   recommendedFirst: object|null,
 *   orderedDossiers: Array<object>,
 *   unlocatedDossiers: Array<object>,
 *   totalDistanceMeters: number,
 *   formattedTotalDistance: string,
 *   totalDurationMinutes: number,
 *   formattedTotalDuration: string,
 *   legs: Array<object>,
 *   clusters: Array<object>
 * }}
 */
export function solveOptimalTour(technicianPosition, dossiers = []) {
  if (!Array.isArray(dossiers) || dossiers.length === 0) {
    return {
      hasOrigin: false,
      recommendedFirst: null,
      orderedDossiers: [],
      unlocatedDossiers: [],
      totalDistanceMeters: 0,
      formattedTotalDistance: "0 km",
      totalDurationMinutes: 0,
      formattedTotalDuration: "0 min",
      legs: [],
      clusters: [],
    };
  }

  // 1. Associer chaque dossier à ses coordonnées GPS réelles
  const located = [];
  const unlocated = [];

  dossiers.forEach((dossier) => {
    const coords = extractClientCoordinates(dossier);
    if (coords && isValidCoordinate(coords.lat, coords.lng)) {
      located.push({
        ...dossier,
        _coords: coords,
        lat: coords.lat,
        lng: coords.lng,
      });
    } else {
      unlocated.push(dossier);
    }
  });

  const hasOrigin = technicianPosition && isValidCoordinate(technicianPosition.lat, technicianPosition.lng);

  // Si aucun dossier n'est localisé
  if (located.length === 0) {
    return {
      hasOrigin,
      recommendedFirst: null,
      orderedDossiers: [],
      unlocatedDossiers: unlocated,
      totalDistanceMeters: 0,
      formattedTotalDistance: "0 km",
      totalDurationMinutes: 0,
      formattedTotalDuration: "0 min",
      legs: [],
      clusters: [],
    };
  }

  // Point de départ de référence
  const startPoint = hasOrigin
    ? technicianPosition
    : { lat: located[0].lat, lng: located[0].lng };

  // 2. Détecter le client le plus proche pour démarrer
  let recommendedFirst = located[0];
  let minStartDist = haversineDistanceMeters(startPoint.lat, startPoint.lng, located[0].lat, located[0].lng);

  for (let i = 1; i < located.length; i++) {
    const d = haversineDistanceMeters(startPoint.lat, startPoint.lng, located[i].lat, located[i].lng);
    if (d < minStartDist) {
      minStartDist = d;
      recommendedFirst = located[i];
    }
  }

  // 3. Résolution de l'ordre séquentiel optimal
  let bestSequence = [...located];
  let minTotalDistance = Infinity;

  if (located.length <= 8) {
    // Résolution exacte par exploration des permutations (rapide et infaillible pour 4 à 8 dossiers)
    const permutations = getPermutations(located);
    for (const perm of permutations) {
      const dist = calculateRouteDistance(startPoint, perm);
      if (dist < minTotalDistance) {
        minTotalDistance = dist;
        bestSequence = perm;
      }
    }
  } else {
    // Algorithme du Plus Proche Voisin (Nearest-Neighbor) pour plus de 8 points
    const unvisited = [...located];
    bestSequence = [];
    let current = startPoint;

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let nearestDist = haversineDistanceMeters(current.lat, current.lng, unvisited[0].lat, unvisited[0].lng);

      for (let i = 1; i < unvisited.length; i++) {
        const d = haversineDistanceMeters(current.lat, current.lng, unvisited[i].lat, unvisited[i].lng);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = i;
        }
      }

      const nextStop = unvisited.splice(nearestIdx, 1)[0];
      bestSequence.push(nextStop);
      current = nextStop;
    }

    minTotalDistance = calculateRouteDistance(startPoint, bestSequence);
  }

  // 4. Construction des étapes détaillées (legs)
  const legs = [];
  let prevPoint = hasOrigin ? { ...startPoint, nom: "Ma position actuelle" } : null;

  bestSequence.forEach((stop, index) => {
    let legDist = 0;
    if (prevPoint) {
      legDist = haversineDistanceMeters(prevPoint.lat, prevPoint.lng, stop.lat, stop.lng);
    }
    legs.push({
      stepNumber: index + 1,
      fromName: prevPoint ? prevPoint.nom || prevPoint.nom_client || "Étape précédente" : "Départ",
      toDossier: stop,
      toName: stop.nom_client || `Client #${index + 1}`,
      distanceMeters: Math.round(legDist),
      formattedDistance: formatDistance(legDist),
      durationMinutes: Math.round((legDist / (25000 / 60))),
      formattedDuration: formatEstimatedDuration(legDist),
      isFirst: index === 0,
    });
    prevPoint = stop;
  });

  // 5. Détection des clusters géographiques (clients à proximité immédiate)
  const clusters = detectClientClusters(located, 1500);

  // 6. Estimation de la durée globale
  const totalMinutes = Math.max(1, Math.round(minTotalDistance / (25000 / 60)));

  return {
    hasOrigin,
    recommendedFirst: bestSequence[0] || recommendedFirst,
    orderedDossiers: bestSequence,
    unlocatedDossiers: unlocated,
    totalDistanceMeters: Math.round(minTotalDistance),
    formattedTotalDistance: formatDistance(minTotalDistance),
    totalDurationMinutes: totalMinutes,
    formattedTotalDuration: formatEstimatedDuration(minTotalDistance),
    legs,
    clusters,
  };
}

/**
 * Construit un lien direct de navigation GPS (Google Maps ou Waze)
 * @param {number} lat
 * @param {number} lng
 * @param {string} [label]
 * @returns {string} URL universelle
 */
export function buildNavigationUrl(lat, lng, label = "") {
  if (!isValidCoordinate(lat, lng)) return "";
  const encodedLabel = encodeURIComponent(label || "Client");
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodedLabel}`;
}

/**
 * Construit un lien intent "geo:" natif pour smartphone Android
 * @param {number} lat
 * @param {number} lng
 * @param {string} [label]
 * @returns {string}
 */
export function buildNativeGeoUri(lat, lng, label = "") {
  if (!isValidCoordinate(lat, lng)) return "";
  return `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label || "Client")})`;
}

/**
 * Recherche une adresse / rue / quartier via le moteur OpenStreetMap Nominatim.
 * Préfère par défaut le Bénin (countrycodes: 'bj') et retourne des résultats formattés.
 * @param {string} query
 * @param {string} [countryCode='bj']
 * @returns {Promise<Array<{display_name: string, lat: number, lng: number, zone: string, type: string}>>}
 */
export async function searchAddressNominatim(query, countryCode = "bj") {
  if (!query || typeof query !== "string" || !query.trim()) return [];
  const cleanQuery = query.trim();

  // Si l'utilisateur a collé des coordonnées GPS directes, les résoudre immédiatement
  const parsedCoords = parseCoordinateInput(cleanQuery);
  if (parsedCoords) {
    return [
      {
        display_name: `Position GPS : ${parsedCoords.lat.toFixed(5)}, ${parsedCoords.lng.toFixed(5)}`,
        lat: parsedCoords.lat,
        lng: parsedCoords.lng,
        zone: "Coordonnées manuelles",
        type: "gps_coords",
      },
    ];
  }

  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("q", cleanQuery);
    if (countryCode) url.searchParams.set("countrycodes", countryCode);
    url.searchParams.set("limit", "6");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "FibreTrack-TourneeOptimizer/1.0",
      },
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (timer) clearTimeout(timer);
    if (!res.ok) return [];

    const list = await res.json();
    if (!Array.isArray(list)) return [];

    return list.map((item) => {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      const addr = item.address || {};
      const quartier = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || "";
      const ville = addr.city || addr.town || addr.village || addr.municipality || "";
      const zone = quartier && ville ? `${quartier}, ${ville}` : quartier || ville || item.display_name.split(",")[0];

      return {
        display_name: item.display_name,
        lat,
        lng,
        zone,
        type: item.type || "place",
      };
    });
  } catch (err) {
    console.warn("searchAddressNominatim error:", err?.message);
    return [];
  }
}
