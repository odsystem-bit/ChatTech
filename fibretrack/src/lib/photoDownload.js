/**
 * Utilitaires pour le téléchargement et l'archivage des photos (terrain, CelPros, poteaux, WhatsApp).
 * Permet de télécharger toutes les photos regroupées dans un dossier au nom du client.
 */

import JSZip from "jszip";

/**
 * Nettoie et formate le nom du client pour créer un nom de dossier de premier choix
 */
export function sanitizeClientFolderName(clientName) {
  const slug = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase();

  return slug(clientName) || "DOSSIER_CLIENT";
}

/**
 * Normalise un titre de photo pour en faire un nom de fichier propre
 */
export function buildPhotoFilename(photo, clientName = "") {
  const slug = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();

  const rawName = String(photo?.name || "").replace(/\.(jpe?g|png|webp)$/i, "");
  const cleanTitle = slug(photo?.title || photo?.label || rawName) || "photo_terrain";
  const clientPrefix = slug(clientName).slice(0, 30);

  const dateStr = (photo?.horodatage ? new Date(photo.horodatage) : new Date())
    .toISOString()
    .slice(0, 10);

  let ext = "jpg";
  const url = String(photo?.url || photo?.photo || photo?.src || "");
  if (url.startsWith("data:image/png") || url.includes(".png")) ext = "png";
  else if (url.startsWith("data:image/webp") || url.includes(".webp")) ext = "webp";

  return `${clientPrefix ? `${clientPrefix}_` : ""}${cleanTitle}_${dateStr}.${ext}`;
}

/**
 * Attribue un nom ordonné et explicite à chaque photo pour le dossier client
 */
export function getStructuredPhotoName(photo, index = 0) {
  const slot = String(photo?.slot || photo?.key || "").toLowerCase();
  const label = String(photo?.label || photo?.name || photo?.title || "").toLowerCase();

  let ext = "jpg";
  const url = String(photo?.url || photo?.photo || photo?.src || "");
  if (url.startsWith("data:image/png") || url.includes(".png")) ext = "png";
  else if (url.startsWith("data:image/webp") || url.includes(".webp")) ext = "webp";

  // Correspondance précise avec les étapes CelPros
  if (slot === "fat" || label.includes("boitier fat") || (label.includes("fat") && !label.includes("mesure") && !label.includes("fibre"))) {
    return `01_Boitier_FAT.${ext}`;
  }
  if (slot === "mesure_fat" || label.includes("mesure fat") || label.includes("puissance fat") || label.includes("mesure optique fat")) {
    return `02_Mesure_optique_FAT.${ext}`;
  }
  if (slot === "mesure_pto" || label.includes("mesure pto") || label.includes("puissance pto") || label.includes("mesure optique pto")) {
    return `03_Mesure_optique_PTO.${ext}`;
  }
  if (slot === "cable_externe" || label.includes("cable externe") || label.includes("câble externe")) {
    return `04_Image_cable_externe.${ext}`;
  }
  if (slot === "cable_interne" || label.includes("cable interne") || label.includes("câble interne") || label.includes("entree cable")) {
    return `05_Image_cable_interne.${ext}`;
  }
  if (slot === "ont_sn" || label.includes("numero de serie") || label.includes("serie ont") || label.includes("sn ont")) {
    return `06_Photo_numero_serie_ONT.${ext}`;
  }
  if (slot === "debit_wifi" || label.includes("debit wifi") || label.includes("speedtest wifi")) {
    return `07_Test_debit_Wifi.${ext}`;
  }
  if (slot === "debit_cable" || label.includes("debit cable") || label.includes("rj45")) {
    return `08_Test_debit_cable.${ext}`;
  }
  if (slot === "contrat" || label.includes("contrat")) {
    return `09_Photo_contrat_client.${ext}`;
  }

  // Poteaux
  if (slot.includes("poteau") || label.includes("poteau")) {
    const num = photo?.numero || index + 1;
    return `10_Poteau_${num}.${ext}`;
  }

  // Photos additionnelles
  if (photo?.isAdditionnelle || photo?.additionnelle || slot.includes("additionnelle") || label.includes("additionnelle")) {
    const idxStr = String(index + 1).padStart(2, "0");
    return `Photos_Additionnelles/Additionnelle_${idxStr}.${ext}`;
  }

  // Repli propre
  const safeName = String(photo?.name || photo?.label || `photo_${index + 1}`)
    .replace(/\.(jpe?g|png|webp)$/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");
  const padIdx = String(index + 1).padStart(2, "0");
  return `${padIdx}_${safeName}.${ext}`;
}

/**
 * Récupère le binaire (Uint8Array / ArrayBuffer / Base64) d'une photo pour JSZip
 */
async function fetchPhotoData(photo) {
  const url = photo?.url || photo?.photo || photo?.src;
  if (!url || typeof url !== "string") return null;

  // 1. Data URL Base64
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    if (comma !== -1) {
      return { base64: url.slice(comma + 1) };
    }
  }

  // 2. Blob URL ou URL HTTP/HTTPS
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    return { arrayBuffer };
  } catch (err) {
    console.warn("[photoDownload] Impossible de récupérer l'image :", url, err);
    return null;
  }
}

/**
 * Télécharge TOUTES les photos sélectionnées dans une archive ZIP organisée
 * portant le nom exact du client (ex: Photos_DOSSIER_AKUAVI_ARLETTE.zip)
 */
export async function downloadAllPhotosAsZip(photos, clientName = "", options = {}) {
  const { onProgress, reportText, interventionId } = options;
  if (!Array.isArray(photos) || photos.length === 0) {
    throw new Error("Aucune photo à télécharger.");
  }

  const clientFolder = sanitizeClientFolderName(clientName);
  const zip = new JSZip();
  const folder = zip.folder(clientFolder);

  if (onProgress) onProgress(0, photos.length, `Préparation du dossier ${clientFolder}…`);

  let addedCount = 0;
  const usedFilenames = new Set();

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (onProgress) {
      onProgress(i + 1, photos.length, `Traitement de la photo ${i + 1}/${photos.length}…`);
    }

    let relName = getStructuredPhotoName(p, i);
    // Éviter tout conflit de nom identique
    if (usedFilenames.has(relName)) {
      const parts = relName.split(".");
      const ext = parts.pop();
      relName = `${parts.join(".")}_${i + 1}.${ext}`;
    }
    usedFilenames.add(relName);

    const data = await fetchPhotoData(p);
    if (data) {
      if (data.base64) {
        folder.file(relName, data.base64, { base64: true });
        addedCount++;
      } else if (data.arrayBuffer) {
        folder.file(relName, data.arrayBuffer);
        addedCount++;
      }
    }
  }

  // Si un texte de rapport est fourni, l'inclure directement dans le dossier client
  if (reportText && typeof reportText === "string" && reportText.trim()) {
    folder.file("Rapport_Intervention.txt", reportText.trim());
  }

  if (addedCount === 0) {
    // Si toutes les images ont échoué au fetch local (ex: CORS), repli sur le serveur
    if (interventionId) {
      if (onProgress) onProgress(photos.length, photos.length, "Téléchargement depuis le serveur…");
      const serverZipUrl = `https://fibretrack.mantota.com/api/index.php?action=download_photos_zip&id=${encodeURIComponent(interventionId)}`;
      window.location.href = serverZipUrl;
      return { success: true, count: photos.length, filename: `Photos_${clientFolder}.zip`, viaServer: true };
    }
    throw new Error("Impossible d'extraire les données des photos sélectionnées.");
  }

  if (onProgress) {
    onProgress(photos.length, photos.length, "Génération de l'archive ZIP…");
  }

  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const zipFilename = `Photos_${clientFolder}.zip`;

  // Déclenchement automatique du téléchargement
  const blobUrl = URL.createObjectURL(zipBlob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = zipFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);

  if (onProgress) {
    onProgress(photos.length, photos.length, `✓ Dossier complet (${addedCount} photos) téléchargé !`);
  }

  return {
    success: true,
    count: addedCount,
    folderName: clientFolder,
    filename: zipFilename,
    sizeBytes: zipBlob.size,
  };
}

/**
 * Pour les navigateurs Desktop (Chrome, Edge), permet d'enregistrer directement
 * les fichiers dans un vrai sous-dossier au nom du client via la File System Access API
 */
export async function savePhotosToLocalDirectory(photos, clientName = "", options = {}) {
  const { onProgress, reportText } = options;
  if (typeof window.showDirectoryPicker !== "function") {
    throw new Error("Votre navigateur ne permet pas la sélection directe de dossier. Utilisez le téléchargement ZIP.");
  }

  if (!Array.isArray(photos) || photos.length === 0) {
    throw new Error("Aucune photo à enregistrer.");
  }

  const clientFolder = sanitizeClientFolderName(clientName);
  if (onProgress) onProgress(0, photos.length, "Sélectionnez le dossier de destination (Téléchargements)…");

  const parentHandle = await window.showDirectoryPicker({
    mode: "readwrite",
    startIn: "downloads",
  });

  // Création du sous-dossier au nom du client
  const targetDir = await parentHandle.getDirectoryHandle(clientFolder, { create: true });

  let savedCount = 0;
  const usedFilenames = new Set();

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (onProgress) {
      onProgress(i + 1, photos.length, `Écriture de la photo ${i + 1}/${photos.length}…`);
    }

    let relName = getStructuredPhotoName(p, i);
    // Gestion sous-dossier additionnelles si besoin
    let currentDirHandle = targetDir;
    if (relName.includes("/")) {
      const [subDirName, fileName] = relName.split("/");
      currentDirHandle = await targetDir.getDirectoryHandle(subDirName, { create: true });
      relName = fileName;
    }

    if (usedFilenames.has(relName)) {
      const parts = relName.split(".");
      const ext = parts.pop();
      relName = `${parts.join(".")}_${i + 1}.${ext}`;
    }
    usedFilenames.add(relName);

    const data = await fetchPhotoData(p);
    if (data) {
      let buffer = null;
      if (data.arrayBuffer) {
        buffer = data.arrayBuffer;
      } else if (data.base64) {
        const binStr = atob(data.base64);
        const bytes = new Uint8Array(binStr.length);
        for (let j = 0; j < binStr.length; j++) bytes[j] = binStr.charCodeAt(j);
        buffer = bytes.buffer;
      }

      if (buffer) {
        const fileHandle = await currentDirHandle.getFileHandle(relName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(buffer);
        await writable.close();
        savedCount++;
      }
    }
  }

  // Écriture du rapport texte dans le dossier si présent
  if (reportText && typeof reportText === "string" && reportText.trim()) {
    const reportHandle = await targetDir.getFileHandle("Rapport_Intervention.txt", { create: true });
    const writable = await reportHandle.createWritable();
    await writable.write(reportText.trim());
    await writable.close();
  }

  if (onProgress) {
    onProgress(photos.length, photos.length, `✓ Dossier '${clientFolder}' créé avec succès !`);
  }

  return {
    success: true,
    count: savedCount,
    folderName: clientFolder,
  };
}

/**
 * Télécharge une photo unique (rétro-compatibilité)
 */
export async function downloadPhotoFile(photo, clientName = "") {
  const url = photo?.url || photo?.photo || photo?.src;
  if (!url || typeof url !== "string") {
    throw new Error("URL de photo invalide ou manquante");
  }

  const filename = buildPhotoFilename(photo, clientName);

  if (url.startsWith("data:") || url.startsWith("blob:")) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return filename;
  }

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
