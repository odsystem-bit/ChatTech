import { createWorker } from "tesseract.js";
import { extractOntDataFromText } from "./barcodeParser";

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
