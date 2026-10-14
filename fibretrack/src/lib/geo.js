/**
 * Extrait les coordonnées GPS contenues dans les métadonnées EXIF d'une photo JPEG.
 * Analyse les marqueurs TIFF/EXIF en mémoire pure sans dépendance externe.
 * @param {DataView} view
 * @returns {{lat: number, lng: number, altitude?: number|null, precision_m: number, source: string}|null}
 */
export function parseExifFromDataView(view) {
  if (!view || view.byteLength < 4) return null;
  // Marqueur SOI 0xFFD8
  if (view.getUint16(0, false) !== 0xFFD8) return null;

  let offset = 2;
  const length = view.byteLength;

  while (offset + 4 < length) {
    const marker = view.getUint16(offset, false);
    offset += 2;

    if (marker === 0xFFE1) {
      // Marqueur APP1 (Exif)
      const app1Length = view.getUint16(offset, false);
      offset += 2;

      // Vérifier entête "Exif\0\0"
      if (offset + 6 > length) return null;
      const isExif =
        view.getUint8(offset) === 0x45 && // E
        view.getUint8(offset + 1) === 0x78 && // x
        view.getUint8(offset + 2) === 0x69 && // i
        view.getUint8(offset + 3) === 0x66 && // f
        view.getUint8(offset + 4) === 0x00 &&
        view.getUint8(offset + 5) === 0x00;

      if (!isExif) return null;

      const tiffOffset = offset + 6;
      if (tiffOffset + 8 > length) return null;

      // Ordre des octets : "II" (0x4949) Little Endian ou "MM" (0x4D4D) Big Endian
      const byteOrder = view.getUint16(tiffOffset, false);
      const isLittleEndian = byteOrder === 0x4949;
      if (!isLittleEndian && byteOrder !== 0x4D4D) return null;

      // Contrôle 0x002A
      if (view.getUint16(tiffOffset + 2, isLittleEndian) !== 0x002A) return null;

      // Premier IFD
      const firstIfdOffset = view.getUint32(tiffOffset + 4, isLittleEndian);
      if (firstIfdOffset < 8) return null;

      const ifd0Offset = tiffOffset + firstIfdOffset;
      if (ifd0Offset + 2 > length) return null;

      const numEntries = view.getUint16(ifd0Offset, isLittleEndian);
      let gpsIfdOffset = null;

      for (let i = 0; i < numEntries; i++) {
        const entryOffset = ifd0Offset + 2 + i * 12;
        if (entryOffset + 12 > length) break;
        const tag = view.getUint16(entryOffset, isLittleEndian);
        if (tag === 0x8825) { // GPSInfo tag
          const gpsSubOffset = view.getUint32(entryOffset + 8, isLittleEndian);
          gpsIfdOffset = tiffOffset + gpsSubOffset;
          break;
        }
      }

      if (!gpsIfdOffset || gpsIfdOffset + 2 > length) return null;

      const gpsEntries = view.getUint16(gpsIfdOffset, isLittleEndian);
      let latRef = null;
      let lat = null;
      let lngRef = null;
      let lng = null;
      let alt = null;

      const getRational = (entryValOffset) => {
        if (entryValOffset + 8 > length) return null;
        const num = view.getUint32(entryValOffset, isLittleEndian);
        const den = view.getUint32(entryValOffset + 4, isLittleEndian);
        return den === 0 ? 0 : num / den;
      };

      for (let j = 0; j < gpsEntries; j++) {
        const entryOffset = gpsIfdOffset + 2 + j * 12;
        if (entryOffset + 12 > length) break;
        const tag = view.getUint16(entryOffset, isLittleEndian);

        if (tag === 0x0001) { // GPSLatitudeRef
          latRef = String.fromCharCode(view.getUint8(entryOffset + 8));
        } else if (tag === 0x0002) { // GPSLatitude (3 rationals : deg, min, sec)
          const dataOffset = tiffOffset + view.getUint32(entryOffset + 8, isLittleEndian);
          const d = getRational(dataOffset);
          const m = getRational(dataOffset + 8);
          const s = getRational(dataOffset + 16);
          if (d !== null && m !== null && s !== null) {
            lat = d + m / 60 + s / 3600;
          }
        } else if (tag === 0x0003) { // GPSLongitudeRef
          lngRef = String.fromCharCode(view.getUint8(entryOffset + 8));
        } else if (tag === 0x0004) { // GPSLongitude (3 rationals : deg, min, sec)
          const dataOffset = tiffOffset + view.getUint32(entryOffset + 8, isLittleEndian);
          const d = getRational(dataOffset);
          const m = getRational(dataOffset + 8);
          const s = getRational(dataOffset + 16);
          if (d !== null && m !== null && s !== null) {
            lng = d + m / 60 + s / 3600;
          }
        } else if (tag === 0x0006) { // GPSAltitude
          const dataOffset = tiffOffset + view.getUint32(entryOffset + 8, isLittleEndian);
          alt = getRational(dataOffset);
        }
      }

      if (lat !== null && lng !== null) {
        if (latRef === "S") lat = -lat;
        if (lngRef === "W") lng = -lng;
        return {
          lat,
          lng,
          altitude: alt,
          precision_m: 5,
          source: "exif",
        };
      }

      return null;
    } else if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFFD8 && marker !== 0xFFD9) {
      const segLength = view.getUint16(offset, false);
      offset += segLength;
    } else {
      break;
    }
  }

  return null;
}

export function extractExifGpsFromBuffer(buf) {
  if (!buf) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return parseExifFromDataView(view);
}

/**
 * Extrait les coordonnées GPS EXIF depuis un Blob, File ou dataURL.
 * @param {Blob|File|string} input
 * @returns {Promise<{lat:number, lng:number, precision_m:number, source:string}|null>}
 */
export async function extractExifGps(input) {
  try {
    if (!input) return null;
    if (typeof input === "string") {
      const commaIdx = input.indexOf(",");
      const b64 = commaIdx >= 0 ? input.slice(commaIdx + 1) : input;
      const binStr = (typeof atob !== "undefined" ? atob(b64.slice(0, 131072)) : Buffer.from(b64.slice(0, 131072), "base64").toString("binary"));
      const len = binStr.length;
      const u8 = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        u8[i] = binStr.charCodeAt(i);
      }
      return extractExifGpsFromBuffer(u8);
    }
    if (input instanceof ArrayBuffer) {
      return extractExifGpsFromBuffer(new Uint8Array(input));
    }
    if (ArrayBuffer.isView(input)) {
      return extractExifGpsFromBuffer(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
    }
    if (typeof input.arrayBuffer === "function") {
      // Blob ou File
      const slice = typeof input.slice === "function" ? input.slice(0, 131072) : input;
      const ab = await slice.arrayBuffer();
      return extractExifGpsFromBuffer(new Uint8Array(ab));
    }
    return null;
  } catch (err) {
    console.warn("extractExifGps error:", err);
    return null;
  }
}

/**
 * Récupère la position actuelle avec la meilleure précision disponible.
 * Utilise getCurrentPosition avec enableHighAccuracy et un timeout généreux.
 * @returns {Promise<GeolocationPosition>}
 */
export function getCurrentPositionHighAccuracy() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Géolocalisation non disponible sur cet appareil."));
      return;
    }

    let resolved = false;

    // Premier essai : haute précision avec timeout de 10s
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (resolved) return;
        resolved = true;
        resolve(pos);
      },
      (err) => {
        if (resolved) return;
        // Si la haute précision échoue, tenter en précision standard
        navigator.geolocation.getCurrentPosition(
          (pos2) => {
            if (resolved) return;
            resolved = true;
            resolve(pos2);
          },
          (err2) => {
            if (resolved) return;
            resolved = true;
            reject(err2 || err);
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 10000 }
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

/**
 * Résout la meilleure position possible pour une photo terrain :
 * 1. Priorité absolue : EXIF photo (coordonnées réelles natives où la photo a été prise par le smartphone, 0ms).
 * 2. Secondaire : Geolocation API haute précision du navigateur avec timeout progressif.
 * 3. Fallback gracieux : coordonnées de secours (ex: intervention / poteau précédent) ou null.
 * Ne lève JAMAIS d'exception fatale pour ne jamais perdre une photo prise par le technicien.
 * @param {File|Blob|string|null} photoSource
 * @param {{lat?:number, lng?:number, precision_m?:number}|null} fallbackCoords
 * @returns {Promise<{lat:number|null, lng:number|null, precision_m:number|null, source:string, warning?:string}>}
 */
export async function acquireBestPosition(photoSource, fallbackCoords = null) {
  // 1. Tenter l'extraction EXIF native directe
  if (photoSource) {
    try {
      const exif = await extractExifGps(photoSource);
      if (exif && typeof exif.lat === "number" && typeof exif.lng === "number" && (exif.lat !== 0 || exif.lng !== 0)) {
        return {
          lat: exif.lat,
          lng: exif.lng,
          precision_m: exif.precision_m || 5,
          source: "exif",
        };
      }
    } catch (exifErr) {
      console.warn("Exif extraction fallback to live GPS:", exifErr);
    }
  }

  // 2. Tenter la géolocalisation haute précision
  try {
    const pos = await getCurrentPositionHighAccuracy();
    if (pos?.coords) {
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        precision_m: pos.coords.accuracy || 10,
        source: "gps_live",
      };
    }
  } catch (gpsErr) {
    console.warn("High accuracy GPS failed:", gpsErr?.message);
  }

  // 3. Tenter une position récente en cache du navigateur (maximumAge 60s)
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      const cachedPos = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          () => resolve(null),
          { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 }
        );
      });
      if (cachedPos?.coords) {
        return {
          lat: cachedPos.coords.latitude,
          lng: cachedPos.coords.longitude,
          precision_m: cachedPos.coords.accuracy || 25,
          source: "gps_cached",
        };
      }
    } catch {}
  }

  // 4. Fallback sur les coordonnées de secours passées en paramètre
  if (fallbackCoords && typeof fallbackCoords.lat === "number" && typeof fallbackCoords.lng === "number" && (fallbackCoords.lat !== 0 || fallbackCoords.lng !== 0)) {
    return {
      lat: fallbackCoords.lat,
      lng: fallbackCoords.lng,
      precision_m: fallbackCoords.precision_m || 20,
      source: "fallback_coords",
      warning: "Coordonnées de secours utilisées (signal GPS smartphone momentanément indisponible)",
    };
  }

  // 5. Zéro crash : retourner null sans bloquer l'enregistrement de la photo
  return {
    lat: null,
    lng: null,
    precision_m: null,
    source: "none",
    warning: "Signal GPS indisponible lors de la prise de vue",
  };
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
 * Extrait une zone lisible et concise (Quartier, Ville) depuis la réponse Nominatim.
 * Exemples : "Haie Vive, Cotonou", "Fidjrossè, Cotonou", "Agla, Cotonou", "Akpakpa, Cotonou".
 * @param {object} json
 * @returns {string}
 */
export function formatAddressZone(json) {
  if (!json || typeof json !== "object") return "";
  const addr = json.address || {};

  const quartier =
    addr.suburb ||
    addr.neighbourhood ||
    addr.quarter ||
    addr.residential ||
    addr.subdivision ||
    addr.city_district ||
    addr.road ||
    "";

  const ville =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    addr.state ||
    "";

  if (quartier && ville) {
    if (quartier.toLowerCase() === ville.toLowerCase()) return ville;
    return `${quartier}, ${ville}`;
  }
  if (quartier) return quartier;
  if (ville) return ville;
  if (json.display_name) {
    const parts = json.display_name.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.slice(0, 2).join(", ");
  }
  return "";
}

/**
 * Géocodage inversé ciblé pour le champ "Adresse / Zone".
 * Convertit instantanément des coordonnées GPS en Quartier, Ville.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string>}
 */
export async function reverseGeocodeZone(lat, lng) {
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: { Accept: "application/json" },
        ...(controller ? { signal: controller.signal } : {}),
      }
    );
    if (timer) clearTimeout(timer);
    if (!res.ok) return "";
    const json = await res.json();
    return formatAddressZone(json);
  } catch (err) {
    console.warn("reverseGeocodeZone error:", err);
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

      const dateStr = new Date(info.horodatage || Date.now()).toLocaleString();
      const hasGps = typeof info.lat === "number" && typeof info.lng === "number";
      const lines = [
        `${info.type}`,
        info.lieu ? `Lieu: ${info.lieu}` : null,
        hasGps ? `Lat: ${Number(info.lat).toFixed(6)}  Lng: ${Number(info.lng).toFixed(6)}` : null,
        hasGps ? `Précision: ±${Number(info.precision_m || 10).toFixed(1)} m - ${dateStr}` : `Horodatage: ${dateStr}`,
        !hasGps && info.warning ? `⚠️ ${info.warning}` : null,
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
