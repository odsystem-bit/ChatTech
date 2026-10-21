import { getApiAuthHeaders, getApiCode } from "../models/Account";

// Médias serveur partagés par intervention (photos + vidéos).
// Mêmes endpoints que l'APK : media_list, media_upload, media_delete.

const API_URL = import.meta.env.VITE_API_URL || "https://fibretrack.mantota.com/api/index.php";

function buildMediaApiUrl(params = {}) {
  const code = getApiCode();
  const query = new URLSearchParams({
    ...params,
    ...(code ? { user_code: code } : {}),
  });
  return `${API_URL}?${query.toString()}`;
}

/**
 * Liste les médias d'une intervention.
 * @param {string} interventionId
 * @returns {Promise<Array>} [{ id, intervention_id, type, file_path, url, latitude, longitude, precision_m, captured_at, added_by, created_at }]
 */
export async function listInterventionMedia(interventionId) {
  const res = await fetch(
    buildMediaApiUrl({ action: "media_list", intervention_id: interventionId }),
    { headers: getApiAuthHeaders() }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur API");
  return data;
}

/**
 * Upload une photo ou une vidéo sur le serveur avec suivi de progression réel.
 * @param {Object} params
 * @param {string} params.interventionId
 * @param {"photo"|"video"|"fiche"} params.type
 * @param {File|Blob} params.file
 * @param {number} [params.latitude]
 * @param {number} [params.longitude]
 * @param {number} [params.precisionM]
 * @param {string} [params.capturedAt] ISO string
 * @param {string} [params.thumbnailBase64] dataURL
 * @param {number} [params.duration] en secondes
 * @param {string} [params.label]
 * @param {string} [params.slot]
 * @param {string} [params.photoType]
 * @param {boolean} [params.isImported]
 * @param {string} [params.source]
 * @param {function} [params.onProgress] ({ pct: number, loaded: number, total: number }) => void
 * @returns {Promise<{id: string, path: string, url: string, thumbnail_url: string, size: number, duration: number, label: string}>}
 */
export async function uploadInterventionMedia({
  interventionId,
  type,
  file,
  latitude,
  longitude,
  precisionM,
  capturedAt,
  thumbnailBase64,
  duration,
  label,
  isImported,
  source,
  slot,
  photoType,
  onProgress,
}) {
  const buildForm = () => {
    const form = new FormData();
    form.append("intervention_id", interventionId);
    form.append("type", type);
    if (latitude != null) form.append("latitude", String(latitude));
    if (longitude != null) form.append("longitude", String(longitude));
    if (precisionM != null) form.append("precision_m", String(precisionM));
    if (capturedAt) form.append("captured_at", capturedAt);
    if (thumbnailBase64) form.append("thumbnail_base64", thumbnailBase64);
    if (duration != null) form.append("duration", String(duration));
    if (label) form.append("label", label);
    if (slot) form.append("slot", slot);
    if (photoType) form.append("photo_type", photoType);
    if (isImported !== undefined) form.append("is_imported", isImported ? "1" : "0");
    if (source) form.append("source", source);
    const filename = file?.name || (type === "video" ? "media.mp4" : "media.jpg");
    form.append("file", file, filename);
    return form;
  };

  const uploadOnce = () =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = buildMediaApiUrl({ action: "media_upload" });
      xhr.open("POST", url, true);

      const headers = getApiAuthHeaders();
      for (const [key, val] of Object.entries(headers)) {
        if (val) xhr.setRequestHeader(key, String(val));
      }

      if (xhr.upload && typeof onProgress === "function") {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) {
            const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
            onProgress({ pct, loaded: e.loaded, total: e.total });
          }
        };
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
            if (typeof onProgress === "function") {
              const fSize = file?.size || 0;
              onProgress({ pct: 100, loaded: fSize, total: fSize });
            }
            resolve(data);
          } else {
            reject(new Error(data.error || `Erreur upload média (HTTP ${xhr.status})`));
          }
        } catch {
          reject(new Error(`Réponse serveur invalide (HTTP ${xhr.status})`));
        }
      };

      xhr.onerror = () => {
        reject(new Error("Erreur de connexion réseau lors de l'envoi du média"));
      };

      xhr.ontimeout = () => {
        reject(new Error("Délai d'attente réseau dépassé (timeout 10 min)"));
      };

      // Timeout généreux de 10 minutes pour vidéo HD sur 3G/4G
      xhr.timeout = 600000;
      xhr.send(buildForm());
    });

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await uploadOnce();
    } catch (err) {
      lastErr = err;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
    }
  }
  throw lastErr || new Error("Erreur upload média");
}

/**
 * Supprime un média (propriétaire ou admin uniquement côté serveur).
 * @param {string} mediaId
 */
export async function deleteInterventionMedia(mediaId) {
  const res = await fetch(buildMediaApiUrl({ action: "media_delete" }), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getApiAuthHeaders() },
    body: JSON.stringify({ id: mediaId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Suppression refusée");
  return data;
}
