// Utilitaires géo : capture GPS haute précision et calcul de distance (Haversine).

/**
 * Récupère la position actuelle avec la meilleure précision disponible.
 * Utilise getCurrentPosition avec enableHighAccuracy et un timeout généreux.
 * @returns {Promise<GeolocationPosition>}
 */
export function getCurrentPositionHighAccuracy() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Géolocalisation non disponible sur cet appareil."));
      return;
    }

    let resolved = false;

    // First attempt: high accuracy
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (resolved) return;
        resolved = true;
        resolve(pos);
      },
      (err) => {
        if (resolved) return;
        // If high accuracy fails, try with lower accuracy
        navigator.geolocation.getCurrentPosition(
          (pos2) => {
            if (resolved) return;
            resolved = true;
            resolve(pos2);
          },
          (err2) => {
            if (resolved) return;
            resolved = true;
            reject(err2);
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 5000 }
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

/**
 * Distance en mètres entre deux coordonnées GPS (formule de Haversine).
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} distance en mètres
 */
export function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // rayon terrestre en mètres
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Recherche un point existant à moins de `seuilMetres` d'une position donnée.
 * @param {{lat:number, lng:number}} position
 * @param {Array<{lat:number, lng:number}>} points
 * @param {number} seuilMetres
 * @returns {object|null} le point le plus proche en dessous du seuil, ou null
 */
export function findNearbyPoint(position, points, seuilMetres = 20) {
  let closest = null;
  let closestDist = Infinity;

  for (const point of points) {
    const dist = haversineDistanceMeters(
      position.lat,
      position.lng,
      point.lat,
      point.lng
    );
    if (dist < seuilMetres && dist < closestDist) {
      closest = point;
      closestDist = dist;
    }
  }

  return closest;
}

/** Seuil de précision GPS (mètres) au-delà duquel on avertit l'utilisateur. */
export const PRECISION_WARNING_THRESHOLD_M = 10;

/**
 * Lit un fichier photo (Blob/File) en data URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Géocodage inversé (lat/lng → adresse lisible), façon "GPS Map Camera".
 * Utilise l'API publique Nominatim (OpenStreetMap). Best-effort : renvoie
 * une chaîne vide en cas d'échec (offline, quota, etc.) sans bloquer la saisie.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string>}
 */
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return "";
    const json = await res.json();
    return json.display_name ?? "";
  } catch {
    return "";
  }
}

/**
 * Incruste un bandeau (type, lieu, coordonnées, précision, date) en bas d'une
 * photo, façon "GPS Map Camera"
 * @param {string} photoDataUrl data URL de la photo source
 * @param {{type:string, lieu?:string, lat:number, lng:number, precision_m:number, horodatage:string}} info
 * @returns {Promise<string>} data URL de la photo incrustée (JPEG)
 */
export function embedGpsOnPhoto(photoDataUrl, info) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const dateStr = new Date(info.horodatage).toLocaleString();
      const lines = [
        `${info.type}`,
        info.lieu ? `Lieu: ${info.lieu}` : null,
        `Lat: ${info.lat.toFixed(6)}  Lng: ${info.lng.toFixed(6)}`,
        `Précision: ±${info.precision_m.toFixed(1)} m - ${dateStr}`,
      ].filter(Boolean);

      const fontSize = Math.max(14, Math.round(img.width * 0.022));
      const lineGap = fontSize * 1.3;
      const pad = fontSize * 0.6;
      const bandHeight = pad * 2 + lineGap * lines.length;

      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, img.height - bandHeight, img.width, bandHeight);

      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textBaseline = "top";

      let y = img.height - bandHeight + pad;
      for (const line of lines) {
        ctx.fillText(line, pad, y);
        y += lineGap;
      }

      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = reject;
    img.src = photoDataUrl;
  });
}
