/**
 * Module de compression et traitement vidéo côté client pour FibreTrack.
 * Permet de compresser les vidéos de terrain (de 50-100 Mo à ~2-4 Mo, soit -95%)
 * directement dans le navigateur/mobile sans saturer la mémoire ni le serveur.
 */

/**
 * Formate un nombre d'octets en chaîne lisible (Ko, Mo, Go).
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "0 Ko";
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} Ko`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} Mo`;
}

/**
 * Formate une durée en secondes en format mm:ss.
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/**
 * Incruste un bandeau de géolocalisation et horodatage façon "GPS Map Camera"
 * sur le canvas (identique au bandeau des photos d'intervention).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width Largeur du canvas
 * @param {number} height Hauteur du canvas
 * @param {Object} info
 * @param {string} info.type Ex: "Vidéo Terrain #1 - Nom Client"
 * @param {string} [info.lieu] Ex: "Cotonou, Littoral, Bénin"
 * @param {number} [info.lat]
 * @param {number} [info.lng]
 * @param {number} [info.precision_m]
 * @param {string|number} [info.horodatage]
 * @param {string} [info.warning]
 */
export function drawGpsBannerOnCanvas(ctx, width, height, info) {
  if (!info) return;

  const dateStr = new Date(info.horodatage || Date.now()).toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const hasGps = typeof info.lat === "number" && typeof info.lng === "number" && !isNaN(info.lat) && !isNaN(info.lng);

  const lines = [
    info.type || "Vidéo Terrain",
    info.lieu ? `Lieu: ${info.lieu}` : null,
    hasGps ? `Lat: ${Number(info.lat).toFixed(6)}  Lng: ${Number(info.lng).toFixed(6)}` : null,
    hasGps
      ? `Précision: ±${Number(info.precision_m || 10).toFixed(1)} m - ${dateStr}`
      : `Horodatage: ${dateStr}`,
    !hasGps && info.warning ? `⚠️ ${info.warning}` : null,
  ].filter(Boolean);

  const minDim = Math.min(width, height);
  const fontSize = Math.max(13, Math.round(minDim * 0.034));
  const lineGap = fontSize * 1.35;
  const pad = fontSize * 0.65;
  const bandHeight = pad * 2 + lineGap * lines.length;

  ctx.save();
  // Fond noir semi-transparent (façon GPS Map Camera)
  ctx.fillStyle = "rgba(0, 0, 0, 0.70)";
  ctx.fillRect(0, height - bandHeight, width, bandHeight);

  // Bordure supérieure subtile
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  ctx.fillRect(0, height - bandHeight, width, 1.5);

  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = "top";

  let y = height - bandHeight + pad;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0) {
      ctx.fillStyle = "#38bdf8"; // Titre cyan
    } else if (hasGps && line.startsWith("Lat:")) {
      ctx.fillStyle = "#facc15"; // Coordonnées GPS jaune doré
    } else {
      ctx.fillStyle = "#ffffff"; // Blanc
    }
    ctx.fillText(line, pad, y);
    y += lineGap;
  }
  ctx.restore();
}

/**
 * Génère une miniature (poster JPEG léger) depuis un fichier vidéo ou une URL.
 * @param {File|Blob|string} videoSource
 * @param {number} seekTime
 * @param {Object} [bannerInfo] Informations GPS pour incrustation du bandeau
 * @returns {Promise<{ thumbnailDataUrl: string, duration: number, width: number, height: number }>}
 */
export function generateVideoThumbnail(videoSource, seekTime = 1.0, bannerInfo = null) {
  return new Promise((resolve, reject) => {
    const isUrl = typeof videoSource === "string";
    const objectUrl = isUrl ? videoSource : URL.createObjectURL(videoSource);

    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    let resolved = false;

    const cleanup = () => {
      if (!isUrl && objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      video.removeAttribute("src");
      video.load();
    };

    const captureFrame = () => {
      if (resolved) return;
      resolved = true;
      try {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 360;
        const maxThumbDim = 480;
        let tw = vw;
        let th = vh;
        if (vw > maxThumbDim || vh > maxThumbDim) {
          if (vw > vh) {
            tw = maxThumbDim;
            th = Math.round((vh * maxThumbDim) / vw);
          } else {
            th = maxThumbDim;
            tw = Math.round((vw * maxThumbDim) / vh);
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, tw, th);

        if (bannerInfo) {
          drawGpsBannerOnCanvas(ctx, tw, th, bannerInfo);
        }

        const thumbnailDataUrl = canvas.toDataURL("image/jpeg", 0.78);
        const duration = Math.round(video.duration || 0);

        cleanup();
        resolve({
          thumbnailDataUrl,
          duration,
          width: vw,
          height: vh,
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onloadedmetadata = () => {
      const targetTime = Math.min(seekTime, Math.max(0.1, (video.duration || 2) / 2));
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      captureFrame();
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Impossible de lire les métadonnées de la vidéo"));
    };

    // Timeout de sécurité si le seek bloque
    setTimeout(() => {
      if (!resolved) {
        captureFrame();
      }
    }, 4000);

    video.src = objectUrl;
  });
}

/**
 * Compresse une vidéo client-side via Canvas + MediaRecorder à un débit optimisé.
 * Réduit les vidéos 1080p/4K de téléphone (50-100 Mo) à ~2-4 Mo.
 *
 * @param {File|Blob} file
 * @param {Object} options
 * @param {number} [options.maxDimension=720] Dimension max (largeur ou hauteur)
 * @param {number} [options.targetBitrate=900000] Débit cible en bps (~900 kbps)
 * @param {number} [options.fps=24] Fréquence d'images cible
 * @param {function} [options.onProgress] Callback (pourcentage 0-100, message)
 * @returns {Promise<{
 *   blob: Blob,
 *   originalSize: number,
 *   compressedSize: number,
 *   duration: number,
 *   thumbnailDataUrl: string,
 *   ratio: string
 * }>}
 */
export async function compressVideo(file, options = {}) {
  const {
    maxDimension = 720,
    targetBitrate = 900_000,
    fps = 24,
    onProgress = () => {},
    bannerInfo = null,
  } = options;

  onProgress(5, "Analyse du fichier vidéo et préparation du bandeau GPS…");

  // Extraction rapide de la miniature et des métadonnées initiales (avec incrustation du bandeau)
  let thumbInfo;
  try {
    thumbInfo = await generateVideoThumbnail(file, 0.8, bannerInfo);
  } catch {
    thumbInfo = { thumbnailDataUrl: "", duration: 0, width: 640, height: 360 };
  }

  // Si le fichier est déjà très léger (<= 2 Mo) ET qu'aucun bandeau GPS n'est demandé, pas de re-compression
  if (file.size <= 2 * 1024 * 1024 && !bannerInfo) {
    onProgress(100, "Vidéo déjà légère (pas de compression nécessaire).");
    return {
      blob: file,
      originalSize: file.size,
      compressedSize: file.size,
      duration: thumbInfo.duration,
      thumbnailDataUrl: thumbInfo.thumbnailDataUrl,
      ratio: "100%",
    };
  }

  // Vérification de compatibilité de l'API MediaRecorder et canvas.captureStream
  const hasCanvasStream = typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
  const hasMediaRecorder = typeof window !== "undefined" && typeof window.MediaRecorder === "function";

  if (!hasCanvasStream || !hasMediaRecorder) {
    console.warn("MediaRecorder ou captureStream non disponible. Utilisation du fichier original.");
    onProgress(100, "Prêt (mode direct).");
    return {
      blob: file,
      originalSize: file.size,
      compressedSize: file.size,
      duration: thumbInfo.duration,
      thumbnailDataUrl: thumbInfo.thumbnailDataUrl,
      ratio: "100%",
    };
  }

  // Sélection du meilleur type MIME supporté pour l'encodage
  const candidates = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    "video/mp4",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];
  let selectedMime = "";
  for (const c of candidates) {
    if (window.MediaRecorder.isTypeSupported(c)) {
      selectedMime = c;
      break;
    }
  }

  if (!selectedMime) {
    console.warn("Aucun codec vidéo supporté pour MediaRecorder.");
    return {
      blob: file,
      originalSize: file.size,
      compressedSize: file.size,
      duration: thumbInfo.duration,
      thumbnailDataUrl: thumbInfo.thumbnailDataUrl,
      ratio: "100%",
    };
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = objectUrl;
    video.preload = "auto";
    video.muted = true; // Muet pendant la conversion
    video.playsInline = true;

    let recorder = null;
    let stream = null;
    let audioCtx = null;
    let animId = null;
    let ended = false;
    const chunks = [];

    const cleanup = () => {
      if (animId) cancelAnimationFrame(animId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (audioCtx) {
        try { audioCtx.close(); } catch {}
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    video.onloadedmetadata = async () => {
      try {
        const vw = video.videoWidth || 720;
        const vh = video.videoHeight || 1280;
        let tw = vw;
        let th = vh;

        if (vw > maxDimension || vh > maxDimension) {
          if (vw > vh) {
            tw = maxDimension;
            th = Math.round((vh * maxDimension) / vw);
          } else {
            th = maxDimension;
            tw = Math.round((vw * maxDimension) / vh);
          }
        }
        // Les dimensions doivent être paires pour les encodeurs H.264/WebM
        tw = tw % 2 === 0 ? tw : tw - 1;
        th = th % 2 === 0 ? th : th - 1;

        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d", { alpha: false });

        stream = canvas.captureStream(fps);

        // Extraction audio via Web Audio API si possible
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            audioCtx = new AudioContextClass();
            const source = audioCtx.createMediaElementSource(video);
            const destination = audioCtx.createMediaStreamDestination();
            source.connect(destination);
            const aTracks = destination.stream.getAudioTracks();
            if (aTracks.length > 0) {
              stream.addTrack(aTracks[0]);
            }
          }
        } catch (e) {
          console.warn("Extraction audio impossible pour la vidéo:", e);
        }

        recorder = new MediaRecorder(stream, {
          mimeType: selectedMime,
          videoBitsPerSecond: targetBitrate,
        });

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          cleanup();
          const ext = selectedMime.includes("mp4") ? "mp4" : "webm";
          const compressedBlob = new Blob(chunks, { type: selectedMime });

          // Si un bandeau GPS a été incrusté ou si le fichier est plus léger, conserver le flux encodé
          const isBetter = compressedBlob.size > 0 && (compressedBlob.size < file.size || !!bannerInfo);
          const finalBlob = isBetter ? compressedBlob : file;
          const finalSize = finalBlob.size;
          const ratioPercent = Math.round((finalSize / file.size) * 100);

          onProgress(100, `Vidéo finalisée avec bandeau de localisation (${ratioPercent}%)`);

          resolve({
            blob: finalBlob,
            originalSize: file.size,
            compressedSize: finalSize,
            duration: thumbInfo.duration || Math.round(video.duration || 0),
            thumbnailDataUrl: thumbInfo.thumbnailDataUrl,
            ratio: `${ratioPercent}%`,
            extension: ext,
          });
        };

        const totalDuration = video.duration || 1;
        onProgress(10, "Incrustation bandeau GPS et compression vidéo…");

        // Boucle de rendu des images sur le canvas avec bandeau de localisation
        const renderLoop = () => {
          if (ended) return;
          ctx.drawImage(video, 0, 0, tw, th);
          if (bannerInfo) {
            drawGpsBannerOnCanvas(ctx, tw, th, bannerInfo);
          }
          const current = video.currentTime;
          const pct = Math.min(96, Math.max(10, Math.round((current / totalDuration) * 90) + 10));
          onProgress(pct, `Incrustation bandeau GPS et compression… (${pct}%)`);
          animId = requestAnimationFrame(renderLoop);
        };

        video.onended = () => {
          if (ended) return;
          ended = true;
          onProgress(98, "Finalisation du fichier…");
          if (recorder && recorder.state !== "inactive") {
            recorder.stop();
          }
        };

        // Sécurité en cas de blocage ou fin manquée
        const maxWaitMs = (totalDuration + 6) * 1000;
        setTimeout(() => {
          if (!ended) {
            ended = true;
            if (recorder && recorder.state !== "inactive") {
              recorder.stop();
            }
          }
        }, Math.max(8000, maxWaitMs));

        recorder.start(250);
        await video.play();
        animId = requestAnimationFrame(renderLoop);
      } catch (err) {
        console.warn("Échec de la compression vidéo:", err);
        cleanup();
        onProgress(100, "Prêt (mode secours).");
        resolve({
          blob: file,
          originalSize: file.size,
          compressedSize: file.size,
          duration: thumbInfo.duration,
          thumbnailDataUrl: thumbInfo.thumbnailDataUrl,
          ratio: "100%",
        });
      }
    };

    video.onerror = (e) => {
      console.warn("Erreur lecture vidéo:", e);
      cleanup();
      resolve({
        blob: file,
        originalSize: file.size,
        compressedSize: file.size,
        duration: thumbInfo.duration,
        thumbnailDataUrl: thumbInfo.thumbnailDataUrl,
        ratio: "100%",
      });
    };
  });
}
