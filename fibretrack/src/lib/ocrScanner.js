import { createWorker } from "tesseract.js";
import { extractOntDataFromText, extractFatAndMsanFromText } from "./barcodeParser.js";

let workerPromise = null;

/**
 * Initialise le worker Tesseract de manière unique (singleton)
 * Priorité aux fichiers locaux pour fonctionnement 100% hors-ligne.
 * En cas d'incompatibilité matérielle SIMD sur certains téléphones,
 * bascule automatiquement sur le core standard local non-SIMD.
 */
export async function getOcrWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      // 1. Essai Core SIMD local ultra-rapide
      try {
        const worker = await createWorker("eng", 1, {
          workerPath: "/tesseract/worker.min.js",
          corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
          langPath: "/tesseract",
          cachePath: "/tesseract",
          logger: () => {},
        });
        await worker.setParameters({
          tessedit_char_whitelist:
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:-/(). _",
          tessedit_pageseg_mode: "6", // Bloc de texte uniforme
        });
        return worker;
      } catch (simdErr) {
        console.warn("Tesseract SIMD non disponible, essai core local standard:", simdErr?.message || simdErr);
      }

      // 2. Repli Core local standard (sans SIMD, 100% hors-ligne)
      try {
        const worker = await createWorker("eng", 1, {
          workerPath: "/tesseract/worker.min.js",
          corePath: "/tesseract/tesseract-core.wasm.js",
          langPath: "/tesseract",
          cachePath: "/tesseract",
          logger: () => {},
        });
        await worker.setParameters({
          tessedit_char_whitelist:
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:-/(). _",
          tessedit_pageseg_mode: "6",
        });
        return worker;
      } catch (localErr) {
        console.warn("Échec Tesseract local, repli CDN:", localErr?.message || localErr);
      }

      // 3. Repli CDN si les fichiers locaux ne peuvent être servis
      const worker = await createWorker("eng", 1, {
        logger: () => {},
      });
      await worker.setParameters({
        tessedit_char_whitelist:
          "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:-/(). _",
        tessedit_pageseg_mode: "6",
      });
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * Prétraite une région vidéo pour maximiser la lisibilité du texte (noir sur blanc)
 * par étirement d'histogramme dynamique (contrast stretching) sans destruction
 * des traits fins indispensables aux parenthèses et tirets de l'ONT.
 * @param {HTMLVideoElement} video
 * @param {{ sx: number, sy: number, sw: number, sh: number }} crop
 * @returns {HTMLCanvasElement}
 */
export function preprocessCanvasForOcr(video, crop) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = Math.max(1, Math.floor(crop.sw));
  canvas.height = Math.max(1, Math.floor(crop.sh));

  ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);

  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    const len = d.length;

    // Calcul de la distribution de luminosité pour étirement de contraste
    let minLum = 255;
    let maxLum = 0;
    const step = 4 * 4; // Échantillonnage rapide
    for (let i = 0; i < len; i += step) {
      const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    const range = maxLum - minLum;
    if (range > 20) {
      const scale = 255 / range;
      for (let i = 0; i < len; i += 4) {
        const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
        // Étirement de contraste linéaire centré
        const stretched = Math.max(0, Math.min(255, (lum - minLum) * scale));
        d[i] = stretched;
        d[i + 1] = stretched;
        d[i + 2] = stretched;
      }
      ctx.putImageData(imgData, 0, 0);
    }
  } catch {
    // Conserver l'image originale en cas de restriction de contexte
  }

  return canvas;
}

/**
 * Analyse une image ou flux vidéo avec OCR Tesseract pour extraire MAC & SN
 * @param {HTMLVideoElement} video
 * @param {{ sx: number, sy: number, sw: number, sh: number }} cropRect
 * @returns {Promise<{ mac: string|null, sn: string|null, rawText: string, confidence: number }>}
 */
export async function recognizeOntFromVideo(video, cropRect) {
  try {
    const worker = await getOcrWorker();
    const canvas = preprocessCanvasForOcr(video, cropRect);
    const result = await worker.recognize(canvas);
    const text = result?.data?.text || "";
    const extracted = extractOntDataFromText(text);
    return {
      mac: extracted.mac,
      sn: extracted.sn,
      rawText: text,
      confidence: result?.data?.confidence || 0,
    };
  } catch (err) {
    console.warn("Erreur reconnaissance OCR:", err);
    return { mac: null, sn: null, rawText: "", error: err?.message, confidence: 0 };
  }
}

/**
 * Prétraite une image (data URL, blob, etc.) pour étirer le contraste et maximiser
 * la lisibilité des chiffres et lettres gravés ou écrits sur les boîtiers FAT en extérieur.
 * @param {string} imageSrc
 * @returns {Promise<HTMLCanvasElement|string>}
 */
export async function preprocessImageSourceForOcr(imageSrc, options = {}) {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return imageSrc;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const maxDim = 1600;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;

        // Si la photo contient potentiellement le bandeau GPS incrusté en bas (type GPS Map Camera),
        // on rogne les 22% du bas pour que l'OCR ne voie QUE le boîtier FAT physique !
        const cropBottom = options?.cropBottomBanner === true;
        const sourceH = cropBottom ? Math.max(10, Math.round(h * 0.78)) : h;

        let targetW = w;
        let targetH = sourceH;
        if (targetW > maxDim || targetH > maxDim) {
          if (targetW > targetH) {
            targetH = Math.round((targetH * maxDim) / targetW);
            targetW = maxDim;
          } else {
            targetW = Math.round((targetW * maxDim) / targetH);
            targetH = maxDim;
          }
        }
        canvas.width = Math.max(1, targetW);
        canvas.height = Math.max(1, targetH);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, sourceH, 0, 0, targetW, targetH);

        if (options?.skipContrastStretch === true) {
          resolve(canvas);
          return;
        }

        const imgData = ctx.getImageData(0, 0, targetW, targetH);
        const d = imgData.data;
        const len = d.length;
        let minLum = 255;
        let maxLum = 0;
        const step = 4 * 4;
        for (let i = 0; i < len; i += step) {
          const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
          if (lum < minLum) minLum = lum;
          if (lum > maxLum) maxLum = lum;
        }

        const range = maxLum - minLum;
        if (range > 20) {
          const scale = 255 / range;
          for (let i = 0; i < len; i += 4) {
            const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
            const stretched = Math.max(0, Math.min(255, (lum - minLum) * scale));
            d[i] = stretched;
            d[i + 1] = stretched;
            d[i + 2] = stretched;
          }
          ctx.putImageData(imgData, 0, 0);
        }
        resolve(canvas);
      } catch {
        resolve(imageSrc);
      }
    };
    img.onerror = () => resolve(imageSrc);
    img.src = imageSrc;
  });
}

/**
 * Analyse une photo de boîtier FAT (data URL ou image) pour en extraire fidèlement
 * la Référence FAT et le MSAN.
 * @param {string} imageSrc
 * @returns {Promise<{ fat_ref: string|null, msan: string|null, rawText: string, confidence: number }>}
 */
export async function recognizeFatAndMsanFromImage(imageSrc) {
  if (!imageSrc) {
    return { fat_ref: null, msan: null, rawText: "", confidence: 0 };
  }
  try {
    const worker = await getOcrWorker();
    const preprocessed = await preprocessImageSourceForOcr(imageSrc, { cropBottomBanner: true });
    const result = await worker.recognize(preprocessed);
    const text = result?.data?.text || "";
    const extracted = extractFatAndMsanFromText(text);
    return {
      fat_ref: extracted.fat_ref,
      msan: extracted.msan,
      rawText: text,
      confidence: result?.data?.confidence || 0,
    };
  } catch (err) {
    console.warn("Erreur reconnaissance OCR FAT & MSAN:", err);
    return { fat_ref: null, msan: null, rawText: "", error: err?.message, confidence: 0 };
  }
}

/**
 * Extrait les valeurs de test de débit (Download, Upload, Ping) à partir d'un texte OCR
 * Compatible nPerf (Moyenne XX.XX Mb/s), Speedtest, Fast.com
 * @param {string} text
 * @returns {{ download: string|null, upload: string|null, ping: string|null }}
 */
export function extractSpeedtestFromText(text) {
  if (!text || typeof text !== "string") {
    return { download: null, upload: null, ping: null };
  }

  let download = null;
  let upload = null;
  let ping = null;

  // 1. Détection prioritaire nPerf : Lignes "Moyenne <valeur> <unité>"
  const moyenneMatches = [...text.matchAll(/(?:Moyenne|Moy\.?|Avg\.?|Average)\s*[:]?\s*([0-9]+[.,][0-9]+|[0-9]+)\s*(Mb\/s|Mbps|kb\/s|ms)?/gi)];

  if (moyenneMatches.length >= 1) {
    for (let i = 0; i < moyenneMatches.length; i++) {
      const m = moyenneMatches[i];
      const val = m[1].replace(",", ".");
      const unit = (m[2] || "").toLowerCase();

      if (unit === "ms") {
        if (!ping) ping = val;
      } else if (unit.includes("mb") || unit.includes("kb") || !unit) {
        if (!download) {
          download = val;
        } else if (!upload) {
          upload = val;
        } else if (!ping && i === 2 && parseFloat(val) < 500) {
          ping = val;
        }
      }
    }
  }

  // 2. Détection par mots-clés contextuels (Download / Réception / Descendant)
  if (!download) {
    const dlMatch = text.match(/(?:r[eé]ception|download|descendant|descendante)[\s\S]{0,40}?([0-9]+[.,][0-9]+|[0-9]+)\s*(?:Mb\/s|Mbps|kb\/s)?/i);
    if (dlMatch) download = dlMatch[1].replace(",", ".");
  }

  // 3. Détection par mots-clés contextuels (Upload / Envoi / Montant)
  if (!upload) {
    const ulMatch = text.match(/(?:envoi|upload|montant|montante)[\s\S]{0,40}?([0-9]+[.,][0-9]+|[0-9]+)\s*(?:Mb\/s|Mbps|kb\/s)?/i);
    if (ulMatch) upload = ulMatch[1].replace(",", ".");
  }

  // 4. Détection par mots-clés contextuels (Ping / Latence)
  if (!ping) {
    const pingMatch = text.match(/(?:ping|latence)[\s\S]{0,40}?([0-9]+[.,][0-9]+|[0-9]+)\s*(?:ms)?/i);
    if (pingMatch) ping = pingMatch[1].replace(",", ".");
  }

  // 5. Repli nPerf valeurs instantanées ou séquentielles : chiffres suivis de Mb/s ou ms
  if (!download || !upload || !ping) {
    const allMbMatches = [...text.matchAll(/([0-9]+[.,][0-9]+|[0-9]+)\s*(?:Mb\/s|Mbps)/gi)].map((m) => m[1].replace(",", "."));
    const allMsMatches = [...text.matchAll(/([0-9]+[.,][0-9]+|[0-9]+)\s*(?:ms)/gi)].map((m) => m[1].replace(",", "."));
    if (!download && allMbMatches.length >= 1) download = allMbMatches[0];
    if (!upload && allMbMatches.length >= 2) upload = allMbMatches[1];
    if (!ping && allMsMatches.length >= 1) ping = allMsMatches[0];
  }

  return { download, upload, ping };
}

/**
 * Analyse une capture d'écran de test de débit (nPerf / Speedtest)
 * @param {string} imageSrc
 * @returns {Promise<{ download: string|null, upload: string|null, ping: string|null, rawText: string, confidence: number }>}
 */
export async function recognizeSpeedtestFromImage(imageSrc) {
  if (!imageSrc) {
    return { download: null, upload: null, ping: null, rawText: "", confidence: 0 };
  }
  try {
    const worker = await getOcrWorker();
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: "3",
        tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:-/()., _~®[]",
      });
    } catch {}

    const preprocessed = await preprocessImageSourceForOcr(imageSrc, { cropBottomBanner: false, skipContrastStretch: true });
    const result = await worker.recognize(preprocessed);
    const text = result?.data?.text || "";
    const extracted = extractSpeedtestFromText(text);
    return {
      download: extracted.download,
      upload: extracted.upload,
      ping: extracted.ping,
      rawText: text,
      confidence: result?.data?.confidence || 0,
    };
  } catch (err) {
    console.warn("Erreur reconnaissance OCR Speedtest:", err);
    return { download: null, upload: null, ping: null, rawText: "", error: err?.message, confidence: 0 };
  }
}

/**
 * Extrait une mesure de puissance optique (dBm) d'un photomètre
 * @param {string} text
 * @returns {string|null} Valeur en dBm avec signe négatif (ex: "-18.52")
 */
export function extractPowerMeterFromText(text) {
  if (!text || typeof text !== "string") return null;
  const match = text.match(/(?:[-–—]\s*)?([1-3]?[0-9][.,][0-9]{1,2})\s*(?:dBm|dbm)?/i);
  if (match) {
    const num = parseFloat(match[1].replace(",", "."));
    if (!isNaN(num) && num > 5 && num < 40) {
      return `-${num.toFixed(2)}`;
    }
  }
  return null;
}

/**
 * Analyse une photo de photomètre optique (FAT / PTO)
 * @param {string} imageSrc
 * @returns {Promise<{ power: string|null, rawText: string, confidence: number }>}
 */
export async function recognizePowerMeterFromImage(imageSrc) {
  if (!imageSrc) return { power: null, rawText: "", confidence: 0 };
  try {
    const worker = await getOcrWorker();
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: "3",
        tessedit_char_whitelist: "0123456789.-–—,dBm ",
      });
    } catch {}

    const preprocessed = await preprocessImageSourceForOcr(imageSrc, { cropBottomBanner: false });
    const result = await worker.recognize(preprocessed);
    const text = result?.data?.text || "";
    const power = extractPowerMeterFromText(text);
    return { power, rawText: text, confidence: result?.data?.confidence || 0 };
  } catch (err) {
    console.warn("Erreur reconnaissance OCR Photomètre:", err);
    return { power: null, rawText: "", error: err?.message, confidence: 0 };
  }
}

