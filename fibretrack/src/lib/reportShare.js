/**
 * Envoi du rapport WhatsApp avec les photos CelPros.
 *
 * Principe : le navigateur mobile (Web Share API niveau 2) ouvre le menu de
 * partage Android/iOS -> l'utilisateur choisit WhatsApp puis le contact/groupe,
 * et reçoit le texte + toutes les photos en une seule fois.
 */

export function dataUrlToBlob(dataUrl) {
  const [header, b64] = String(dataUrl).split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function safeFileName(label, index, mime = "image/jpeg") {
  const base =
    String(label || "photo")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "photo";
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return `${String(index + 1).padStart(2, "0")}_${base}.${ext}`;
}

async function urlToBlob(url) {
  if (url.startsWith("data:")) return dataUrlToBlob(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

/**
 * Transforme la liste de photos (collectCelprosPhotos) en objets File.
 * Retourne { files, failed } : les photos illisibles sont listées, jamais ignorées en silence.
 */
export async function buildShareFiles(photoEntries) {
  const files = [];
  const failed = [];
  for (let i = 0; i < photoEntries.length; i++) {
    const entry = photoEntries[i];
    try {
      const blob = await urlToBlob(entry.url);
      const type = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
      files.push(new File([blob], safeFileName(entry.label, i, type), { type }));
    } catch (err) {
      failed.push({ label: entry.label, error: err.message });
    }
  }
  return { files, failed };
}

export function canShareFiles(files) {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    typeof navigator.share === "function" &&
    files.length > 0 &&
    navigator.canShare({ files })
  );
}

/**
 * Ouvre le menu de partage avec rapport + photos.
 * Retourne "shared" | "cancelled" | "unsupported".
 */
export async function shareReportWithPhotos({ text, files, title }) {
  if (!canShareFiles(files)) return "unsupported";
  try {
    await navigator.share({ title, text, files });
    return "shared";
  } catch (err) {
    if (err && err.name === "AbortError") return "cancelled";
    throw err;
  }
}

/** Repli sans photos : ouvre WhatsApp avec le texte complet (choix du contact dans WhatsApp). */
export function openWhatsAppText(text) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}
