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
      const binStr = (typeof atob !== "undefined"
        ? atob(b64.slice(0, 131072))
        : (typeof Buffer !== "undefined" ? Buffer.from(b64.slice(0, 131072), "base64").toString("binary") : ""));
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
 * Compresse et redimensionne une image data URL (Base64) côté client.
 * Garantit qu'aucune image ne dépasse maxDimension (1280px) ou une taille excessive.
 * @param {string} dataUrl
 * @param {number} [maxDimension=1280]
 * @param {number} [quality=0.78]
 * @returns {Promise<string>}
 */
function dataUrlToBlobLocal(dataUrl) {
  const [head, b64] = String(dataUrl).split(",");
  const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Charge une image décodable par canvas. Deux stratégies :
 * 1) createImageBitmap (décodage hors thread principal, plus fiable sur grosses captures d'écran) ;
 * 2) élément Image + decode() explicite (garantit que le décodage est terminé avant dessin).
 */
async function loadDrawable(dataUrl, preferBitmap) {
  if (preferBitmap && typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(dataUrlToBlobLocal(dataUrl));
      return {
        src: bmp,
        width: bmp.width,
        height: bmp.height,
        close: () => { try { bmp.close && bmp.close(); } catch {} },
      };
    } catch {
      // repli sur Image
    }
  }
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });
  if (typeof img.decode === "function") {
    try { await img.decode(); } catch {}
  }
  return { src: img, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height, close: () => {} };
}

/**
 * Détecte un canvas vide (entièrement transparent ou noir) : signe d'un dessin raté,
 * qui donnerait un JPEG totalement noir une fois exporté.
 */
function canvasLooksBlank(canvas) {
  try {
    const size = 24;
    const probe = document.createElement("canvas");
    probe.width = size;
    probe.height = size;
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    pctx.drawImage(canvas, 0, 0, size, size);
    const px = pctx.getImageData(0, 0, size, size).data;
    let maxLum = 0;
    for (let i = 0; i < px.length; i += 4) {
      const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
      if (lum > maxLum) maxLum = lum;
    }
    // Si la luminance max est inférieure à 4 sur l'ensemble de la sonde, l'image est un rectangle totalement noir
    return maxLum < 4;
  } catch {
    return false;
  }
}

/**
 * Redimensionne une image data URL en JPEG de façon fiable.
 * Tente plusieurs stratégies (bitmap, Image, taille réduite) et vérifie que le résultat
 * n'est pas noir/vide. Retourne null si toutes échouent (l'appelant garde l'original).
 * @param {string} dataUrl
 * @param {number} maxDimension
 * @param {number} quality
 * @param {(ctx: CanvasRenderingContext2D, width: number, height: number) => void} [overlay] dessiné après la photo
 * @returns {Promise<string|null>}
 */
async function renderJpegSafely(dataUrl, maxDimension, quality, overlay) {
  if (typeof Image === "undefined" || typeof document === "undefined") return null;
  const attempts = [
    { bitmap: true, max: maxDimension },
    { bitmap: false, max: maxDimension },
    { bitmap: true, max: Math.min(1024, maxDimension) },
    { bitmap: false, max: Math.min(800, maxDimension) },
  ];
  for (const attempt of attempts) {
    let drawable = null;
    try {
      drawable = await loadDrawable(dataUrl, attempt.bitmap);
      let width = drawable.width;
      let height = drawable.height;
      if (!width || !height) continue;
      if (width > attempt.max || height > attempt.max) {
        if (width > height) {
          height = Math.round((height * attempt.max) / width);
          width = attempt.max;
        } else {
          width = Math.round((width * attempt.max) / height);
          height = attempt.max;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      // Fond blanc obligatoire en premier : sans lui, la transparence (PNG screenshots) devient noire en JPEG
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(drawable.src, 0, 0, width, height);
      if (canvasLooksBlank(canvas)) continue;
      if (overlay) overlay(ctx, width, height);
      return canvas.toDataURL("image/jpeg", quality);
    } catch {
      // essai suivant
    } finally {
      if (drawable) drawable.close();
    }
  }
  return null;
}

export async function compressDataUrl(dataUrl, maxDimension = 1280, quality = 0.78) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image")) {
    return dataUrl;
  }
  if (typeof Image === "undefined" || typeof document === "undefined") {
    return dataUrl;
  }
  if (dataUrl.length < 250000) {
    return dataUrl;
  }
  const rendered = await renderJpegSafely(dataUrl, maxDimension, quality);
  return rendered || dataUrl;
}

/**
 * Lit un fichier photo (Blob/File) en data URL et le compresse automatiquement
 * pour éviter les lenteurs et la surcharge mémoire sur mobile.
 * @param {File} file
 * @param {number} [maxDimension=1280]
 * @param {number} [quality=0.78]
 * @returns {Promise<string>}
 */
export function readFileAsDataUrl(file, maxDimension = 1280, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = reader.result;
      try {
        const compressed = await compressDataUrl(raw, maxDimension, quality);
        resolve(compressed);
      } catch {
        resolve(raw);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


const reverseGeocodeCache = new Map();
let nominatimBlockedUntil = 0;
let lastNominatimCallAt = 0;

function getGeocodeCacheKey(lat, lng) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
}

async function fetchBigDataCloudReverse(lat, lng) {
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=fr`,
      {
        headers: { Accept: "application/json" },
        ...(controller ? { signal: controller.signal } : {}),
      }
    );
    if (timer) clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const locality = data.locality || data.city || "";
    const city = data.city || data.principalSubdivision || "";
    const zone = locality && city && locality.toLowerCase() !== city.toLowerCase()
      ? `${locality}, ${city}`
      : (locality || city || "");
    const display = [data.locality, data.city, data.principalSubdivision, data.countryName]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(", ");
    return {
      display_name: display || zone,
      address: {
        suburb: data.locality || "",
        city: data.city || data.principalSubdivision || "",
      },
      zone,
    };
  } catch {
    return null;
  }
}

async function fetchReverseGeocodePayload(lat, lng) {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return null;
  }
  const key = getGeocodeCacheKey(lat, lng);
  if (reverseGeocodeCache.has(key)) {
    return reverseGeocodeCache.get(key);
  }

  const now = Date.now();
  if (now >= nominatimBlockedUntil && now - lastNominatimCallAt >= 1100) {
    lastNominatimCallAt = now;
    try {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`,
        {
          headers: { Accept: "application/json" },
          ...(controller ? { signal: controller.signal } : {}),
        }
      );
      if (timer) clearTimeout(timer);
      if (res.status === 403 || res.status === 429) {
        nominatimBlockedUntil = Date.now() + 10 * 60 * 1000;
      } else if (res.ok) {
        const json = await res.json();
        reverseGeocodeCache.set(key, json);
        return json;
      }
    } catch {
      // Fallback below
    }
  }

  const fallback = await fetchBigDataCloudReverse(lat, lng);
  if (fallback) {
    reverseGeocodeCache.set(key, fallback);
    return fallback;
  }
  return null;
}

/**
 * Géocodage inversé (lat/lng → adresse lisible), façon "GPS Map Camera".
 * Utilise un cache mémoire + Nominatim avec repli automatique BigDataCloud pour éviter les erreurs HTTP 403.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string>}
 */
export async function reverseGeocode(lat, lng) {
  try {
    const json = await fetchReverseGeocodePayload(lat, lng);
    return json?.display_name ?? "";
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
 * Convertit instantanément des coordonnées GPS en Quartier, Ville sans HTTP 403.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string>}
 */
export async function reverseGeocodeZone(lat, lng) {
  try {
    const json = await fetchReverseGeocodePayload(lat, lng);
    if (!json) return "";
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
export async function embedGpsOnPhoto(photoDataUrl, info, maxDimension = 1280) {
  const overlay = (ctx, width, height) => {
    if (info?.noBanner) return;
    const dateStr = new Date(info.horodatage || Date.now()).toLocaleString();
    const hasGps = typeof info.lat === "number" && typeof info.lng === "number";
    const lines = [
      `${info.type}`,
      info.lieu ? `Lieu: ${info.lieu}` : null,
      hasGps ? `Lat: ${Number(info.lat).toFixed(6)}  Lng: ${Number(info.lng).toFixed(6)}` : null,
      hasGps ? `Précision: ±${Number(info.precision_m || 10).toFixed(1)} m - ${dateStr}` : `Horodatage: ${dateStr}`,
      !hasGps && info.warning ? `⚠️ ${info.warning}` : null,
    ].filter(Boolean);

    const fontSize = Math.max(14, Math.round(width * 0.024));
    const lineGap = fontSize * 1.35;
    const pad = fontSize * 0.6;
    const bandHeight = pad * 2 + lineGap * lines.length;

    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, height - bandHeight, width, bandHeight);

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textBaseline = "top";

    let y = height - bandHeight + pad;
    for (const line of lines) {
      ctx.fillText(line, pad, y);
      y += lineGap;
    }
  };

  const rendered = await renderJpegSafely(photoDataUrl, maxDimension, 0.78, overlay);
  if (rendered) return rendered;
  // Aucun rendu fiable possible : conserver la photo d'origine plutôt qu'une image noire
  console.warn("embedGpsOnPhoto: rendu canvas vide, photo d'origine conservée sans bandeau");
  return photoDataUrl;
}

