/**
 * Utilitaires pour le téléchargement des photos (terrain, CelPros, poteaux, WhatsApp).
 */

/**
 * Normalise un titre de photo pour en faire un nom de fichier propre
 */
export function buildPhotoFilename(photo) {
  const cleanTitle =
    (photo?.title || photo?.name || photo?.label || "photo_terrain")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "photo_terrain";

  const dateStr = (photo?.horodatage ? new Date(photo.horodatage) : new Date())
    .toISOString()
    .slice(0, 10);

  let ext = "jpg";
  const url = String(photo?.url || photo?.photo || photo?.src || "");
  if (url.startsWith("data:image/png") || url.includes(".png")) ext = "png";
  else if (url.startsWith("data:image/webp") || url.includes(".webp")) ext = "webp";

  return `${cleanTitle}_${dateStr}.${ext}`;
}

/**
 * Télécharge une photo sous forme de fichier sur l'appareil de l'utilisateur
 */
export async function downloadPhotoFile(photo) {
  const url = photo?.url || photo?.photo || photo?.src;
  if (!url || typeof url !== "string") {
    throw new Error("URL de photo invalide ou manquante");
  }

  const filename = buildPhotoFilename(photo);

  // Cas 1 : Data URL ou Blob URL
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return filename;
  }

  // Cas 2 : URL distante HTTP/HTTPS ou chemin relatif
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
    return filename;
  } catch (err) {
    console.warn("Échec du fetch direct pour téléchargement, repli lien standard:", err);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return filename;
  }
}
