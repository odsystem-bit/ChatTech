import { getApiAuthHeaders } from "../models/Account";

// Médias serveur partagés par intervention (photos + vidéos).
// Mêmes endpoints que l'APK : media_list, media_upload, media_delete.

const API_URL = import.meta.env.VITE_API_URL || "https://fibretrack.mantota.com/api/index.php";

/**
 * Liste les médias d'une intervention.
 * @param {string} interventionId
 * @returns {Promise<Array>} [{ id, intervention_id, type, file_path, url, latitude, longitude, precision_m, captured_at, added_by, created_at }]
 */
export async function listInterventionMedia(interventionId) {
  const res = await fetch(
    `${API_URL}?action=media_list&intervention_id=${encodeURIComponent(interventionId)}`,
    { headers: getApiAuthHeaders() }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur API");
  return data;
}

/**
 * Upload une photo ou une vidéo sur le serveur.
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
 * @returns {Promise<{id: string, path: string, url: string, thumbnail_url: string, size: number, duration: number, label: string}>}
 */
export async function uploadInterventionMedia({ interventionId, type, file, latitude, longitude, precisionM, capturedAt, thumbnailBase64, duration, label, isImported, source }) {
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
  if (isImported !== undefined) form.append("is_imported", isImported ? "1" : "0");
  if (source) form.append("source", source);
  const filename = file.name || (type === "video" ? "media.mp4" : "media.jpg");
  form.append("file", file, filename);

  const res = await fetch(`${API_URL}?action=media_upload`, {
    method: "POST",
    headers: getApiAuthHeaders(),
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur upload média");
  return data;
}

/**
 * Supprime un média (propriétaire ou admin uniquement côté serveur).
 * @param {string} mediaId
 */
export async function deleteInterventionMedia(mediaId) {
  const res = await fetch(`${API_URL}?action=media_delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getApiAuthHeaders() },
    body: JSON.stringify({ id: mediaId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Suppression refusée");
  return data;
}
