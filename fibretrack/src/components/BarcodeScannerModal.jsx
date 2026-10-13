import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, BarcodeFormat } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { parseBarcode, extractOntDataFromText } from "../lib/barcodeParser";
import { recognizeOntFromVideo, getOcrWorker } from "../lib/ocrScanner";

/**
 * Bip sonore de confirmation synthétisé (Web Audio API natif, 0 asset externe)
 */
function playSuccessBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  } catch {
    // Ignorer si audio bloqué par le navigateur
  }
}

/**
 * Vibration haptique
 */
function triggerVibration() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([50, 30, 80]);
    }
  } catch {
    // Ignorer
  }
}

export default function BarcodeScannerModal({
  isOpen,
  targetField = "both",
  currentMac = "",
  currentSn = "",
  onScan,
  onClose,
}) {
  const [loadingCamera, setLoadingCamera] = useState(true);
  const [cameraError, setCameraError] = useState("");
  const [detectedMac, setDetectedMac] = useState(currentMac || "");
  const [detectedSn, setDetectedSn] = useState(currentSn || "");
  const [lastScannedText, setLastScannedText] = useState("");
  const [lastScannedType, setLastScannedType] = useState("");
  const [lastScannedSource, setLastScannedSource] = useState(""); // "barcode" ou "ocr"
  const [ocrRunning, setOcrRunning] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const scanLoopActiveRef = useRef(false);
  const zxingReaderRef = useRef(null);
  const canvasRef = useRef(null);
  const rafIdRef = useRef(null);

  // Références directes pour éviter toute recréation de fonctions et état obsolète
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const targetFieldRef = useRef(targetField);
  const detectedMacRef = useRef(currentMac || "");
  const detectedSnRef = useRef(currentSn || "");
  const isClosingRef = useRef(false);
  const lastOcrTimeRef = useRef(0);
  const ocrInProgressRef = useRef(false);

  // Maintien à jour des refs de props sans re-render
  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
    targetFieldRef.current = targetField;
  }, [onScan, onClose, targetField]);

  // Synchronisation lors de l'ouverture
  useEffect(() => {
    if (isOpen) {
      detectedMacRef.current = currentMac || "";
      detectedSnRef.current = currentSn || "";
      setDetectedMac(currentMac || "");
      setDetectedSn(currentSn || "");
      setLastScannedText("");
      setLastScannedType("");
      setLastScannedSource("");
      setCameraError("");
      setLoadingCamera(true);
      setOcrRunning(false);
      isClosingRef.current = false;
      lastOcrTimeRef.current = Date.now();

      // Pré-chauffage du worker OCR en arrière-plan dès l'ouverture du modal
      getOcrWorker().catch(() => {});
    }
  }, [isOpen, currentMac, currentSn]);

  // Traitement et enregistrement d'une valeur reconnue (code-barres ou OCR)
  const registerFoundValue = useCallback(
    (type, value, source = "barcode") => {
      if (!value || isClosingRef.current) return;

      const currentTgt = targetFieldRef.current;
      let effectiveType = type;

      // Résolution intelligente si type "unknown"
      if (effectiveType === "unknown") {
        if (currentTgt === "mac" || (currentTgt === "both" && !detectedMacRef.current && detectedSnRef.current)) {
          effectiveType = "mac";
        } else if (currentTgt === "sn" || (currentTgt === "both" && !detectedSnRef.current && detectedMacRef.current)) {
          effectiveType = "sn";
        }
      }

      let changed = false;

      if (effectiveType === "mac") {
        const prev = detectedMacRef.current;
        // Règle d'or : ne JAMAIS rétrograder une MAC complète (ex: 18D6DDF6719E-AE(17)) vers une MAC tronquée (18D6DDF6719E)
        const isUpgrade = !prev || (value.length > prev.length && value.startsWith(prev.replace(/[-_()].*$/, "")));
        if (!prev || isUpgrade || (prev !== value && !prev.includes(value))) {
          detectedMacRef.current = value;
          setDetectedMac(value);
          changed = true;
        }
      } else if (effectiveType === "sn") {
        const prev = detectedSnRef.current;
        // Ne jamais rétrograder un SN Huawei hex complet (ex: 48575443...) vers un extrait partiel
        const isUpgrade = !prev || (value.length > prev.length && value.startsWith("48575443"));
        if (!prev || isUpgrade || (prev !== value && !prev.includes(value))) {
          detectedSnRef.current = value;
          setDetectedSn(value);
          changed = true;
        }
      }

      if (changed) {
        playSuccessBeep();
        triggerVibration();
        setLastScannedText(value);
        setLastScannedType(effectiveType);
        setLastScannedSource(source);
      }

      const macVal = detectedMacRef.current;
      const snVal = detectedSnRef.current;

      // Vérification d'achèvement automatique
      if (currentTgt === "mac" && macVal) {
        isClosingRef.current = true;
        setTimeout(() => {
          onScanRef.current?.({ mac: macVal, ...(snVal ? { sn: snVal } : {}) });
          onCloseRef.current?.();
        }, 300);
      } else if (currentTgt === "sn" && snVal) {
        isClosingRef.current = true;
        setTimeout(() => {
          onScanRef.current?.({ sn: snVal, ...(macVal ? { mac: macVal } : {}) });
          onCloseRef.current?.();
        }, 300);
      } else if (currentTgt === "both" && macVal && snVal) {
        isClosingRef.current = true;
        setTimeout(() => {
          onScanRef.current?.({ mac: macVal, sn: snVal });
          onCloseRef.current?.();
        }, 350);
      }
    },
    []
  );

  // Exécution d'une passe OCR manuelle ou en arrière-plan
  const triggerOcrPass = useCallback(
    async (manual = false) => {
      if (ocrInProgressRef.current || isClosingRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;

      ocrInProgressRef.current = true;
      if (manual) setOcrRunning(true);

      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        // Recadrage sur la zone du viseur (82% largeur, 56% hauteur)
        const crop = {
          sx: Math.floor(vw * 0.09),
          sy: Math.floor(vh * 0.22),
          sw: Math.floor(vw * 0.82),
          sh: Math.floor(vh * 0.56),
        };

        const ocrRes = await recognizeOntFromVideo(video, crop);
        if (ocrRes) {
          if (ocrRes.mac) {
            registerFoundValue("mac", ocrRes.mac, "ocr");
          }
          if (ocrRes.sn) {
            registerFoundValue("sn", ocrRes.sn, "ocr");
          }
        }
      } catch (err) {
        console.warn("Passe OCR:", err);
      } finally {
        ocrInProgressRef.current = false;
        if (manual) setOcrRunning(false);
        lastOcrTimeRef.current = Date.now();
      }
    },
    [registerFoundValue]
  );

  // Boucle de scan continue ultra-performante (BarcodeDetector matériel natif + ZXing multi-tranches + Auto OCR)
  const runScanLoop = useCallback(async () => {
    scanLoopActiveRef.current = true;

    // 1. Initialiser BarcodeDetector natif avec formats strictement validés selon la spec W3C
    let nativeDetector = null;
    if ("BarcodeDetector" in window) {
      try {
        const supported = (await window.BarcodeDetector.getSupportedFormats().catch(() => [])) || [];
        const desired = ["code_128", "code_39", "qr_code", "data_matrix", "ean_13", "ean_8"];
        const validFormats = desired.filter((f) => supported.includes(f));
        if (validFormats.length > 0) {
          nativeDetector = new window.BarcodeDetector({ formats: validFormats });
        } else {
          nativeDetector = new window.BarcodeDetector();
        }
      } catch {
        try {
          nativeDetector = new window.BarcodeDetector();
        } catch {
          nativeDetector = null;
        }
      }
    }

    // 2. Initialiser ZXing BrowserMultiFormatReader avec priorité Code 128
    if (!zxingReaderRef.current) {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.EAN_13,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      zxingReaderRef.current = new BrowserMultiFormatReader(hints, 50);
    }

    let frameIndex = 0;

    async function scanFrame() {
      if (!scanLoopActiveRef.current || isClosingRef.current) return;

      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        let barcodeFoundThisFrame = false;

        // A. Détecteur matériel natif accéléré GPU (lit TOUS les codes de l'image en 1 passe)
        if (nativeDetector) {
          try {
            const barcodes = await nativeDetector.detect(video);
            if (barcodes && barcodes.length > 0) {
              barcodeFoundThisFrame = true;
              for (const b of barcodes) {
                const parsed = parseBarcode(b.rawValue);
                registerFoundValue(parsed.type, parsed.value || b.rawValue, "barcode");
              }
            }
          } catch {
            // Ignorer
          }
        }

        // B. Moteur ZXing multi-tranches haute résolution pour étiquettes superposées ou côte-à-côte
        if (!barcodeFoundThisFrame && zxingReaderRef.current) {
          try {
            let canvas = canvasRef.current;
            if (!canvas) {
              canvas = document.createElement("canvas");
              canvasRef.current = canvas;
            }

            const rx = Math.floor(vw * 0.08);
            const rw = Math.floor(vw * 0.84);
            const ry = Math.floor(vh * 0.20);
            const rh = Math.floor(vh * 0.60);

            let sx = rx;
            let sw = rw;
            let sy = ry;
            let sh = rh;

            // Découpage tournant : 
            // 0: Demi-haut (MAC empilée)
            // 1: Demi-bas (SN empilé)
            // 2: Demi-gauche (MAC latérale)
            // 3: Demi-droite (SN latéral)
            // 4: Zone complète
            const cycle = frameIndex % 5;
            if (cycle === 0) {
              sh = Math.floor(rh * 0.52);
            } else if (cycle === 1) {
              sy = ry + Math.floor(rh * 0.48);
              sh = Math.floor(rh * 0.52);
            } else if (cycle === 2) {
              sw = Math.floor(rw * 0.52);
            } else if (cycle === 3) {
              sx = rx + Math.floor(rw * 0.48);
              sw = Math.floor(rw * 0.52);
            }

            canvas.width = sw;
            canvas.height = sh;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

            const result = await zxingReaderRef.current.decodeFromCanvas(canvas);
            if (result) {
              const text = result.getText();
              const parsed = parseBarcode(text);
              registerFoundValue(parsed.type, parsed.value || text, "barcode");
            }
          } catch {
            // Normal quand aucun code n'est décodé sur cette région
          }
        }

        // C. Déclencheur Auto-OCR si l'un des codes optiques tarde (> 1100ms)
        const now = Date.now();
        const tgt = targetFieldRef.current;
        const needMac = !detectedMacRef.current && (tgt === "both" || tgt === "mac");
        const needSn = !detectedSnRef.current && (tgt === "both" || tgt === "sn");

        if ((needMac || needSn) && now - lastOcrTimeRef.current > 1100 && !ocrInProgressRef.current) {
          triggerOcrPass(false);
        }

        frameIndex++;
      }

      if (scanLoopActiveRef.current && !isClosingRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          setTimeout(scanFrame, 35); // ~28 fps pour réactivité maximale
        });
      }
    }

    scanFrame();
  }, [registerFoundValue, triggerOcrPass]);

  // Démarrer le flux vidéo caméra
  const startCamera = useCallback(
    async (deviceId = null) => {
      try {
        setCameraError("");
        setLoadingCamera(true);

        // Arrêter l'ancien flux si existant
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        // Priorité à la caméra arrière haute résolution avec focus macro
        const videoConstraints = deviceId
          ? {
              deviceId: { exact: deviceId },
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
            }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
            };

        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
        } catch {
          // Repli avec contraintes de base
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: "environment" } },
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // Capacités matérielles (autofocus continu, torche, zoom macro)
        const track = stream.getVideoTracks()[0];
        if (track) {
          const caps = track.getCapabilities?.() || {};
          if (caps.focusMode && caps.focusMode.includes("continuous")) {
            await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
          }
          setHasTorch(!!caps.torch);

          if (caps.zoom) {
            setMaxZoom(caps.zoom.max || 1);
            setZoomLevel(1);
          } else {
            setMaxZoom(1);
          }
        }

        // Découvrir les caméras disponibles
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter((d) => d.kind === "videoinput");
          setCameras(videoDevices);
        } catch {
          // Ignorer
        }

        setLoadingCamera(false);
        runScanLoop();
      } catch (err) {
        console.error("Erreur ouverture caméra:", err);
        setLoadingCamera(false);
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setCameraError(
            "Accès caméra refusé. Veuillez autoriser l'accès à la caméra dans les réglages de votre navigateur."
          );
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setCameraError("Aucune caméra détectée sur cet appareil.");
        } else {
          setCameraError(`Impossible d'ouvrir la caméra : ${err.message || err.name}`);
        }
      }
    },
    [runScanLoop]
  );

  // Cycle de vie : démarre uniquement lors de l'ouverture ou du changement d'ID caméra
  useEffect(() => {
    if (!isOpen) return;

    startCamera(selectedCameraId || null);

    return () => {
      scanLoopActiveRef.current = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, selectedCameraId, startCamera]);

  // Allumer / éteindre le flash
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !flashOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setFlashOn(next);
    } catch (e) {
      console.warn("Erreur torche:", e);
    }
  }

  // Zoom matériel (1x <-> 2x pour étiquettes miniatures)
  async function toggleZoom() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || maxZoom <= 1) return;
    try {
      const nextZoom = zoomLevel >= 2 ? 1 : Math.min(2, maxZoom);
      await track.applyConstraints({ advanced: [{ zoom: nextZoom }] });
      setZoomLevel(nextZoom);
    } catch (e) {
      console.warn("Erreur zoom:", e);
    }
  }

  // Basculer vers une autre caméra
  function handleSwitchCamera() {
    if (cameras.length <= 1) return;
    const currentIdx = cameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextIdx = (currentIdx + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIdx].deviceId);
  }

  // Importation de photo depuis la galerie avec double analyse (Codes-barres + OCR)
  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCameraError("");
      setOcrRunning(true);
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await img.decode();

      let foundAny = false;

      // 1. Analyse BarcodeDetector sur l'image importée
      if ("BarcodeDetector" in window) {
        try {
          const detector = new window.BarcodeDetector();
          const barcodes = await detector.detect(img);
          if (barcodes && barcodes.length > 0) {
            for (const b of barcodes) {
              const p = parseBarcode(b.rawValue);
              registerFoundValue(p.type, p.value || b.rawValue, "barcode");
              foundAny = true;
            }
          }
        } catch {
          // Ignorer
        }
      }

      // 2. Analyse ZXing sur canvas
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      try {
        const reader = new BrowserMultiFormatReader();
        const res = await reader.decodeFromCanvas(canvas);
        if (res) {
          const p = parseBarcode(res.getText());
          registerFoundValue(p.type, p.value || res.getText(), "barcode");
          foundAny = true;
        }
      } catch {
        // Ignorer
      }

      // 3. Analyse OCR complète sur la photo importée
      try {
        const worker = await getOcrWorker();
        const ocrResult = await worker.recognize(canvas);
        const text = ocrResult?.data?.text || "";
        const extracted = extractOntDataFromText(text);
        if (extracted.mac) {
          registerFoundValue("mac", extracted.mac, "ocr");
          foundAny = true;
        }
        if (extracted.sn) {
          registerFoundValue("sn", extracted.sn, "ocr");
          foundAny = true;
        }
      } catch (ocrErr) {
        console.warn("OCR photo:", ocrErr);
      }

      setOcrRunning(false);
      if (!foundAny) {
        setCameraError(
          "Aucun code-barres ou texte ONT lisible sur cette photo. Essayez avec une photo plus nette et bien éclairée."
        );
      }
    } catch (err) {
      setOcrRunning(false);
      setCameraError(`Erreur lecture photo : ${err.message}`);
    }
  }

  // Validation manuelle de la saisie
  function handleConfirm() {
    const res = {};
    if (detectedMacRef.current) res.mac = detectedMacRef.current;
    if (detectedSnRef.current) res.sn = detectedSnRef.current;
    onScanRef.current?.(res);
    onCloseRef.current?.();
  }

  if (!isOpen) return null;

  const targetTitle =
    targetField === "mac"
      ? "Scanner l'adresse MAC"
      : targetField === "sn"
      ? "Scanner le numéro de série (SN)"
      : "Scanner l'étiquette ONT (MAC & SN)";

  return (
    <div className="barcode-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="barcode-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* En-tête */}
        <div className="barcode-modal-header">
          <div>
            <h3>{targetTitle}</h3>
            <p className="barcode-modal-subtitle">
              Pointez la caméra vers les codes-barres ou le texte de l'étiquette ONT
            </p>
          </div>
          <button type="button" className="btn-close-viewer" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        {/* Zone de scan vidéo direct */}
        <div className="barcode-viewport-wrapper">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="barcode-video-element"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />

          {loadingCamera && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "#0f172a",
                color: "#fff",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: "3px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#2563eb",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <span style={{ fontSize: 13 }}>Démarrage instantané de la caméra…</span>
            </div>
          )}

          {/* Viseur visuel avec faisceau laser rouge */}
          <div className="barcode-scan-overlay">
            <div className="barcode-scan-reticle">
              <div className="barcode-laser-line" />
            </div>
            <p className="barcode-scan-hint">
              {targetField === "mac"
                ? "Alignez le code MAC ou son texte dans le cadre"
                : targetField === "sn"
                ? "Alignez le code SN ou son texte dans le cadre"
                : "Alignez les codes MAC & SN ou leur texte dans le cadre"}
            </p>
          </div>
        </div>

        {/* Barre de contrôles caméra & OCR */}
        <div className="barcode-controls-bar">
          <button
            type="button"
            className={`btn-barcode-ctrl ${ocrRunning ? "active" : ""}`}
            onClick={() => triggerOcrPass(true)}
            disabled={ocrRunning}
            title="Analyser instantanément le texte imprimé au-dessus des codes-barres"
          >
            {ocrRunning ? "⏳ Analyse OCR…" : "⚡ Détecter texte (OCR)"}
          </button>

          {maxZoom > 1 && (
            <button
              type="button"
              className={`btn-barcode-ctrl ${zoomLevel > 1 ? "active" : ""}`}
              onClick={toggleZoom}
              title="Agrandir pour les codes-barres miniatures"
            >
              🔍 {zoomLevel > 1 ? "Zoom 1x" : "Zoom 2x"}
            </button>
          )}

          {hasTorch && (
            <button
              type="button"
              className={`btn-barcode-ctrl ${flashOn ? "active" : ""}`}
              onClick={toggleTorch}
            >
              🔦 {flashOn ? "Éteindre" : "Flash"}
            </button>
          )}

          {cameras.length > 1 && (
            <button type="button" className="btn-barcode-ctrl" onClick={handleSwitchCamera}>
              🔄 Caméra
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileSelected}
          />
          <button
            type="button"
            className="btn-barcode-ctrl"
            onClick={() => fileInputRef.current?.click()}
          >
            🖼️ Photo
          </button>
        </div>

        {/* Message d'erreur s'il y a lieu */}
        {cameraError && (
          <div className="barcode-error-banner">
            ⚠️ {cameraError}
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: 12, padding: "6px 12px" }}
                onClick={() => startCamera(selectedCameraId || null)}
              >
                Réessayer d'ouvrir la caméra
              </button>
            </div>
          </div>
        )}

        {/* Dernier code détecté en direct */}
        {lastScannedText && (
          <div className="barcode-live-detected">
            <span
              className="live-type-tag"
              style={{
                background: lastScannedSource === "ocr" ? "#7c3aed" : "#10b981",
              }}
            >
              {lastScannedSource === "ocr" ? "⚡ OCR " : "✓ SCAN "}
              {lastScannedType === "mac"
                ? "MAC"
                : lastScannedType === "sn"
                ? "SN"
                : "DÉTECTION"}
            </span>
            <strong style={{ marginLeft: 8, wordBreak: "break-all" }}>{lastScannedText}</strong>
          </div>
        )}

        {/* Synthèse des données extraites avec mise à jour en temps réel */}
        <div className="barcode-summary-box">
          <div className={`barcode-summary-row ${detectedMac ? "filled" : ""}`}>
            <span className="summary-label">MAC :</span>
            <strong
              className="summary-value"
              style={{ color: detectedMac ? "#047857" : "var(--text-muted)" }}
            >
              {detectedMac || "En attente de scan…"}
            </strong>
            {detectedMac && <span className="summary-check">✓</span>}
          </div>
          <div className={`barcode-summary-row ${detectedSn ? "filled" : ""}`}>
            <span className="summary-label">SN (ONT) :</span>
            <strong
              className="summary-value"
              style={{ color: detectedSn ? "#047857" : "var(--text-muted)" }}
            >
              {detectedSn || "En attente de scan…"}
            </strong>
            {detectedSn && <span className="summary-check">✓</span>}
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="barcode-modal-actions">
          <button
            type="button"
            className="btn-primary"
            style={{ flex: 1, padding: "12px 16px" }}
            onClick={handleConfirm}
            disabled={!detectedMac && !detectedSn}
          >
            Valider l'enregistrement
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: "12px 16px" }}
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
