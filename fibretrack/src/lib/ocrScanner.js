import { createWorker } from "tesseract.js";
import { extractOntDataFromText } from "./barcodeParser";

let workerPromise = null;

/**
 * Initialise le worker Tesseract de manière unique (singleton)
 * Priorité aux fichiers locaux pour fonctionnement 100% hors-ligne.
 */
export async function getOcrWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
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
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:-/(). ",
          tessedit_pageseg_mode: "6", // Bloc de texte uniforme
        });
        return worker;
      } catch (err) {
        console.warn("Échec chargement Tesseract local, repli CDN:", err);
        const worker = await createWorker("eng", 1, {
          logger: () => {},
        });
        await worker.setParameters({
          tessedit_char_whitelist:
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:-/(). ",
          tessedit_pageseg_mode: "6",
        });
        return worker;
      }
    })();
  }
  return workerPromise;
}

/**
 * Prétraite une région vidéo pour maximiser le contraste du texte (noir sur blanc).
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
    let sum = 0;
    const len = d.length;
    for (let i = 0; i < len; i += 4) {
      sum += (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    }
    const avg = sum / (len / 4);
    const threshold = Math.max(70, Math.min(190, avg * 0.92));

    for (let i = 0; i < len; i += 4) {
      const gray = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      const val = gray > threshold ? 255 : 0;
      d[i] = val;
      d[i + 1] = val;
      d[i + 2] = val;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Garder le dessin brut en cas d'erreur
  }

  return canvas;
}

/**
 * Analyse une image ou flux vidéo avec OCR Tesseract pour extraire MAC & SN
 * @param {HTMLVideoElement} video
 * @param {{ sx: number, sy: number, sw: number, sh: number }} cropRect
 * @returns {Promise<{ mac: string|null, sn: string|null, rawText: string }>}
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
    return { mac: null, sn: null, rawText: "", error: err?.message };
  }
}
