/**
 * Utilitaires pour le téléchargement et l'archivage des photos (terrain, CelPros, poteaux, WhatsApp).
 * Permet de télécharger toutes les photos regroupées dans un dossier au nom du client.
 */

import JSZip from "jszip";
import { getApiCode } from "../models/Account.js";

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

  // Autres poteaux (doit être testé AVANT les poteaux numérotés)
  if (
    slot === "autre_poteau" ||
    slot.startsWith("autre_poteau") ||
    String(photo?.type || "").toLowerCase() === "autre_poteau" ||
    label.includes("autre poteau") ||
    label.startsWith("autre_poteau")
  ) {
    const m = label.match(/(\d+)/) || slot.match(/(\d+)/);
    const num = photo?.numero || (m ? Number(m[1]) : index + 1);
    return `11_Autre_Poteau_${num}.${ext}`;
  }

  // Poteaux numérotés
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

  // 2. Blob URL ou URL HTTP/HTTPS (avec repli automatique vers photo_get en cas de HTTP 403)
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    return { arrayBuffer };
  } catch (err) {
    const relMatch = url.match(/\/?(uploads\/(?:photos|interventions)\/[^?#]+)/i);
    if (relMatch) {
      try {
        const code = getApiCode() || "admin";
        const proxyUrl = `https://fibretrack.mantota.com/api/index.php?action=photo_get&path=${encodeURIComponent(relMatch[1])}&user_code=${encodeURIComponent(code)}`;
        const proxyResp = await fetch(proxyUrl);
        if (proxyResp.ok) {
          const arrayBuffer = await proxyResp.arrayBuffer();
          return { arrayBuffer };
        }
      } catch {}
    }
    console.warn("[photoDownload] Impossible de récupérer l'image :", url, err);
    return null;
  }
}

/**
 * Récupère le binaire d'une vidéo pour inclusion dans le dossier ZIP client ou téléchargement direct
 */
export async function fetchVideoData(video) {
  if (!video) return null;
  if (video.stampedBlob instanceof Blob) {
    try {
      const arrayBuffer = await video.stampedBlob.arrayBuffer();
      return { arrayBuffer, ext: video.stampedExt || "mp4" };
    } catch {}
  }
  if (video.file instanceof Blob || video.file instanceof File) {
    try {
      const arrayBuffer = await video.file.arrayBuffer();
      const ext = video.file.name ? video.file.name.split(".").pop() : "mp4";
      return { arrayBuffer, ext };
    } catch {}
  }
  const url = video.url || video.src;
  if (!url || typeof url !== "string") return null;

  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    if (comma !== -1) {
      return { base64: url.slice(comma + 1), ext: url.includes("webm") ? "webm" : "mp4" };
    }
  }

  const ext = url.includes(".webm") ? "webm" : (url.includes(".mov") ? "mov" : "mp4");
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();
    return { arrayBuffer, ext };
  } catch (err) {
    const relMatch = url.match(/\/?(uploads\/(?:photos|interventions)\/[^?#]+)/i);
    if (relMatch) {
      try {
        const code = getApiCode() || "admin";
        const proxyUrl = `https://fibretrack.mantota.com/api/index.php?action=media_get&path=${encodeURIComponent(relMatch[1])}&user_code=${encodeURIComponent(code)}`;
        const proxyResp = await fetch(proxyUrl);
        if (proxyResp.ok) {
          const arrayBuffer = await proxyResp.arrayBuffer();
          return { arrayBuffer, ext };
        }
      } catch {}
    }
    console.warn("[photoDownload] Impossible de récupérer la vidéo :", url, err);
    return null;
  }
}

/**
 * Télécharge un fichier vidéo individuellement sur l'appareil (binaire réel .mp4/.webm, pas un simple lien)
 */
export async function downloadVideoFile(video, clientName = "", index = 0) {
  if (!video) throw new Error("Vidéo invalide ou manquante");
  const clientPrefix = sanitizeClientFolderName(clientName);
  const vNum = String(index + 1).padStart(2, "0");
  const cleanLabel = String(video.label || video.name || `Video_Terrain_${vNum}`)
    .replace(/\.(mp4|webm|mov|mkv)$/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");

  const vidData = await fetchVideoData(video);
  if (vidData && (vidData.arrayBuffer || vidData.base64)) {
    const ext = vidData.ext || "mp4";
    const filename = `${clientPrefix}_${vNum}_${cleanLabel}.${ext}`;
    let blob;
    if (vidData.arrayBuffer) {
      blob = new Blob([vidData.arrayBuffer], { type: ext === "webm" ? "video/webm" : "video/mp4" });
    } else {
      const binStr = atob(vidData.base64);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      blob = new Blob([bytes.buffer], { type: ext === "webm" ? "video/webm" : "video/mp4" });
    }
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    return filename;
  }

  // Repli serveur avec Content-Disposition: attachment
  const url = video.url || video.src || "";
  const relMatch = url.match(/\/?(uploads\/(?:photos|interventions)\/[^?#]+)/i);
  if (relMatch) {
    const ext = url.includes(".webm") ? "webm" : "mp4";
    const filename = `${clientPrefix}_${vNum}_${cleanLabel}.${ext}`;
    const code = getApiCode() || "admin";
    const dlUrl = `https://fibretrack.mantota.com/api/index.php?action=media_get&path=${encodeURIComponent(relMatch[1])}&download=1&filename=${encodeURIComponent(filename)}&user_code=${encodeURIComponent(code)}`;
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return filename;
  }

  throw new Error("Impossible de télécharger cette vidéo.");
}

/**
 * Télécharge un rapport texte (.txt) individuellement
 */
export function downloadTextReportFile(reportText, filename = "Rapport.txt") {
  if (!reportText || typeof reportText !== "string") {
    throw new Error("Contenu du rapport vide.");
  }
  const safeName = filename.endsWith(".txt") ? filename : `${filename}.txt`;
  const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
  return safeName;
}

/**
 * Télécharge TOUS les documents, rapports, photos et vidéos d'une intervention dans une archive ZIP organisée
 * portant le nom exact du client (ex: Dossier_AKUAVI_ARLETTE.zip)
 */
export async function downloadAllPhotosAsZip(photos = [], clientName = "", options = {}) {
  const {
    onProgress,
    reportText,
    reports = null, // { globalReport, conformiteReport, rapportDuJour }
    interventionId,
    videos = [],
    includePdfReports = true,
  } = options;

  const safePhotos = Array.isArray(photos) ? photos : [];
  const safeVideos = Array.isArray(videos) ? videos : [];
  const hasReports = Boolean(
    (reportText && String(reportText).trim()) ||
    (reports && (reports.globalReport || reports.conformiteReport || reports.rapportDuJour))
  );

  if (safePhotos.length === 0 && safeVideos.length === 0 && !hasReports) {
    throw new Error("Aucune photo à télécharger.");
  }

  const clientFolder = sanitizeClientFolderName(clientName);
  const zip = new JSZip();
  const folder = zip.folder(clientFolder);

  const totalCount = safePhotos.length + safeVideos.length + (hasReports ? 1 : 0);
  if (onProgress) onProgress(0, Math.max(1, totalCount), `Préparation du dossier ${clientFolder}…`);

  let addedCount = 0;
  let photosAddedCount = 0;
  let videosAddedCount = 0;
  let reportsAddedCount = 0;
  const usedFilenames = new Set();

  for (let i = 0; i < safePhotos.length; i++) {
    const p = safePhotos[i];
    if (onProgress) {
      onProgress(i + 1, Math.max(1, totalCount), `Traitement de la photo ${i + 1}/${safePhotos.length}…`);
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
        photosAddedCount++;
      } else if (data.arrayBuffer) {
        folder.file(relName, data.arrayBuffer);
        addedCount++;
        photosAddedCount++;
      }
    }
  }

  // Si des vidéos de terrain sont présentes, les inclure dans un sous-dossier Videos_Terrain/
  if (safeVideos.length > 0) {
    const videoFolder = folder.folder("Videos_Terrain");
    for (let j = 0; j < safeVideos.length; j++) {
      const vid = safeVideos[j];
      const videoNum = String(j + 1).padStart(2, "0");
      const cleanLabel = (vid.label || vid.name || `Video_${videoNum}`)
        .replace(/\.(mp4|webm|mov|mkv)$/i, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_");

      if (onProgress) {
        onProgress(safePhotos.length + j + 1, Math.max(1, totalCount), `Ajout de la vidéo terrain ${j + 1}/${safeVideos.length}…`);
      }

      if (vid.stampedBlob) {
        const ext = vid.stampedExt || "mp4";
        videoFolder.file(`${videoNum}_${cleanLabel}_GPS.${ext}`, vid.stampedBlob);
        addedCount++;
        videosAddedCount++;
      } else {
        const vidData = await fetchVideoData(vid);
        if (vidData) {
          if (vidData.base64) {
            videoFolder.file(`${videoNum}_${cleanLabel}.${vidData.ext || "mp4"}`, vidData.base64, { base64: true });
            addedCount++;
            videosAddedCount++;
          } else if (vidData.arrayBuffer) {
            videoFolder.file(`${videoNum}_${cleanLabel}.${vidData.ext || "mp4"}`, vidData.arrayBuffer);
            addedCount++;
            videosAddedCount++;
          }
        }
      }
    }
  }

  // Inclusion structurée des rapports dans un sous-dossier Rapports/ et à la racine
  const reportsFolder = folder.folder("Rapports");
  if (reports && typeof reports === "object") {
    if (reports.globalReport && String(reports.globalReport).trim()) {
      reportsFolder.file(`01_Rapport_Global_${clientFolder}.txt`, String(reports.globalReport).trim());
      folder.file("Rapport_Intervention.txt", String(reports.globalReport).trim());
      addedCount++;
      reportsAddedCount++;
    }
    if (reports.conformiteReport && String(reports.conformiteReport).trim()) {
      reportsFolder.file(`02_Rapport_Conformite_${clientFolder}.txt`, String(reports.conformiteReport).trim());
      addedCount++;
      reportsAddedCount++;
    }
    if (reports.rapportDuJour && String(reports.rapportDuJour).trim()) {
      reportsFolder.file(`03_Rapport_du_Jour_${clientFolder}.txt`, String(reports.rapportDuJour).trim());
      addedCount++;
      reportsAddedCount++;
    }
  } else if (reportText && typeof reportText === "string" && reportText.trim()) {
    folder.file("Rapport_Intervention.txt", reportText.trim());
    reportsFolder.file(`01_Rapport_Intervention_${clientFolder}.txt`, reportText.trim());
    addedCount++;
    reportsAddedCount++;
  }

  // Inclusion automatique des documents PDF officiels si disponibles et en ligne
  if (includePdfReports && interventionId && typeof fetch === "function") {
    try {
      const code = getApiCode() || "";
      const codeSuffix = code ? `&code=${encodeURIComponent(code)}` : "";
      const pdfTargets = [
        { action: "pdf_rapport", name: `04_Rapport_Synthese_${clientFolder}.pdf` },
        { action: "pdf_fiches", name: `05_Fiches_Officielles_SBIN_Satisfaction_${clientFolder}.pdf` },
      ];
      await Promise.all(
        pdfTargets.map(async (t) => {
          try {
            const pdfUrl = `https://fibretrack.mantota.com/api/pdf.php?action=${t.action}&id=${encodeURIComponent(interventionId)}${codeSuffix}`;
            const resp = await fetch(pdfUrl);
            if (resp.ok) {
              const ct = resp.headers.get("content-type") || "";
              if (ct.includes("pdf") || ct.includes("octet-stream")) {
                const buf = await resp.arrayBuffer();
                if (buf && buf.byteLength > 200) {
                  reportsFolder.file(t.name, buf);
                  addedCount++;
                  reportsAddedCount++;
                }
              }
            }
          } catch {}
        })
      );
    } catch {}
  }

  if (addedCount === 0) {
    // Si toutes les images ont échoué au fetch local (ex: CORS), repli sur le serveur
    if (interventionId) {
      if (onProgress) onProgress(totalCount, totalCount, "Téléchargement depuis le serveur…");
      const authCode = getApiCode();
      const codeSuffix = authCode ? `&code=${encodeURIComponent(authCode)}` : "";
      const serverZipUrl = `https://fibretrack.mantota.com/api/index.php?action=download_photos_zip&id=${encodeURIComponent(interventionId)}${codeSuffix}`;
      window.location.href = serverZipUrl;
      return { success: true, count: safePhotos.length, filename: `Photos_${clientFolder}.zip`, viaServer: true };
    }
    throw new Error("Impossible d'extraire les données des médias sélectionnés.");
  }

  if (onProgress) {
    onProgress(totalCount, totalCount, "Génération de l'archive ZIP…");
  }

  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const zipFilename = `Photos_${clientFolder}.zip`;

  if (typeof document !== "undefined") {
    // Déclenchement automatique du téléchargement
    const blobUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = zipFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }

  if (onProgress) {
    onProgress(
      totalCount,
      totalCount,
      `✓ Archive complète (${photosAddedCount} photo(s), ${videosAddedCount} vidéo(s), ${reportsAddedCount} rapport(s)) téléchargée !`
    );
  }

  return {
    success: true,
    count: addedCount,
    photosCount: photosAddedCount,
    videosCount: videosAddedCount,
    reportsCount: reportsAddedCount,
    folderName: clientFolder,
    filename: zipFilename,
    sizeBytes: zipBlob.size,
  };
}

/**
 * Télécharge TOUTES les photos et vidéos de la journée regroupées par sous-dossier client
 * dans une seule archive ZIP globale (ex: Tournee_20_10_2026.zip)
 */
export async function downloadDayPhotosAsZip(dayInterventions = [], dateLabel = "", options = {}) {
  const { onProgress, rapportDuJourText } = options;
  if (!Array.isArray(dayInterventions) || dayInterventions.length === 0) {
    throw new Error("Aucune intervention disponible pour cette journée.");
  }

  const cleanDate = (dateLabel || new Date().toISOString().slice(0, 10)).replace(/[^0-9a-zA-Z_-]/g, "_");
  const zipFilename = `Tournee_${cleanDate}.zip`;
  const zip = new JSZip();

  // Fichier texte du rapport global de conformité de la journée à la racine du ZIP
  if (rapportDuJourText && typeof rapportDuJourText === "string" && rapportDuJourText.trim()) {
    zip.file("Rapport_Global_Conformite_du_Jour.txt", rapportDuJourText.trim());
  }

  let totalPhotosAdded = 0;
  for (let idx = 0; idx < dayInterventions.length; idx++) {
    const intv = dayInterventions[idx];
    const clientName = intv.nom_client || intv.nom_dossier || `Client_${idx + 1}`;
    const folderName = `${String(idx + 1).padStart(2, "0")}_${sanitizeClientFolderName(clientName)}`;
    const clientFolder = zip.folder(folderName);

    if (onProgress) {
      onProgress(idx + 1, dayInterventions.length, `Préparation du dossier ${clientName} (${idx + 1}/${dayInterventions.length})…`);
    }

    // Récupérer les photos de l'intervention
    const photos = [];
    const seen = new Set();
    const wp = Array.isArray(intv.whatsapp_photos) ? intv.whatsapp_photos : [];
    const pts = Array.isArray(intv.points_gps) ? intv.points_gps : [];

    for (const p of wp) {
      const u = p?.url || p?.photo;
      if (u && !seen.has(u)) {
        seen.add(u);
        photos.push(p);
      }
    }
    for (const p of pts) {
      const u = p?.photo;
      if (u && !seen.has(u)) {
        seen.add(u);
        photos.push(p);
      }
    }

    const usedFilenames = new Set();
    for (let pIdx = 0; pIdx < photos.length; pIdx++) {
      const p = photos[pIdx];
      let relName = getStructuredPhotoName(p, pIdx);
      if (usedFilenames.has(relName)) {
        const parts = relName.split(".");
        const ext = parts.pop();
        relName = `${parts.join(".")}_${pIdx + 1}.${ext}`;
      }
      usedFilenames.add(relName);

      const data = await fetchPhotoData(p);
      if (data) {
        if (data.base64) {
          clientFolder.file(relName, data.base64, { base64: true });
          totalPhotosAdded++;
        } else if (data.arrayBuffer) {
          clientFolder.file(relName, data.arrayBuffer);
          totalPhotosAdded++;
        }
      }
    }

    // Vidéos terrain si présentes
    const videos = Array.isArray(intv.videos_terrain) ? intv.videos_terrain : [];
    if (videos.length > 0) {
      const vidFolder = clientFolder.folder("Videos_Terrain");
      for (let vIdx = 0; vIdx < videos.length; vIdx++) {
        const vid = videos[vIdx];
        const vNum = String(vIdx + 1).padStart(2, "0");
        const cleanLabel = (vid.label || vid.name || `Video_${vNum}`).replace(/[^a-zA-Z0-9_-]/g, "_");
        const vidData = await fetchVideoData(vid);
        if (vidData) {
          if (vidData.base64) {
            vidFolder.file(`${vNum}_${cleanLabel}.${vidData.ext || "mp4"}`, vidData.base64, { base64: true });
            totalPhotosAdded++;
          } else if (vidData.arrayBuffer) {
            vidFolder.file(`${vNum}_${cleanLabel}.${vidData.ext || "mp4"}`, vidData.arrayBuffer);
            totalPhotosAdded++;
          }
        }
      }
    }
  }

  if (onProgress) onProgress(dayInterventions.length, dayInterventions.length, "Génération de l'archive de la journée…");

  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  if (typeof document !== "undefined") {
    const blobUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = zipFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }

  return {
    success: true,
    totalPhotos: totalPhotosAdded,
    totalInterventions: dayInterventions.length,
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
