import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, BarcodeFormat } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { parseBarcode } from "../lib/barcodeParser";

/**
 * Bip sonore de confirmation (Web Audio API synthétisé, aucun asset externe)
 */
function playSuccessBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(920, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1840, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Ignorer
  }
}

/**
 * Vibration haptique
 */
function triggerVibration() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([60, 40, 100]);
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
  const [detectedMac, setDetectedMac] = useState(currentMac);
  const [detectedSn, setDetectedSn] = useState(currentSn);
  const [lastScannedText, setLastScannedText] = useState("");
  const [lastScannedType, setLastScannedType] = useState("");
  const [flashOn, setFlashOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const scanLoopActiveRef = useRef(false);
  const isProcessingRef = useRef(false);
  const zxingReaderRef = useRef(null);

  // Initialisation à chaque ouverture
  useEffect(() => {
    if (isOpen) {
      setDetectedMac(currentMac);
      setDetectedSn(currentSn);
      setLastScannedText("");
      setLastScannedType("");
      setCameraError("");
      setLoadingCamera(true);
    }
  }, [isOpen, currentMac, currentSn]);

  // Traitement d'un code-barres scanné
  const handleDecodedText = useCallback(
    (decodedText) => {
      if (!decodedText || isProcessingRef.current) return;
      isProcessingRef.current = true;

      const parsed = parseBarcode(decodedText);
      playSuccessBeep();
      triggerVibration();

      setLastScannedText(parsed.value || decodedText);
      setLastScannedType(parsed.type);

      if (parsed.type === "mac") {
        setDetectedMac(parsed.value);
        if (targetField === "mac") {
          setTimeout(() => {
            onScan({ mac: parsed.value });
            onClose();
          }, 350);
          return;
        }
      } else if (parsed.type === "sn") {
        setDetectedSn(parsed.value);
        if (targetField === "sn") {
          setTimeout(() => {
            onScan({ sn: parsed.value });
            onClose();
          }, 350);
          return;
        }
      } else {
        // Format non explicitement étiqueté, appliquer selon la cible
        if (targetField === "mac") {
          setDetectedMac(parsed.value);
          setTimeout(() => {
            onScan({ mac: parsed.value });
            onClose();
          }, 350);
          return;
        } else if (targetField === "sn") {
          setDetectedSn(parsed.value);
          setTimeout(() => {
            onScan({ sn: parsed.value });
            onClose();
          }, 350);
          return;
        }
      }

      // Si mode combiné (les deux)
      if (targetField === "both") {
        const nextMac = parsed.type === "mac" ? parsed.value : detectedMac;
        const nextSn = parsed.type === "sn" ? parsed.value : detectedSn;
        if (nextMac && nextSn) {
          setTimeout(() => {
            onScan({ mac: nextMac, sn: nextSn });
            onClose();
          }, 500);
          return;
        }
      }

      // Délais anti-rebond
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000);
    },
    [targetField, detectedMac, detectedSn, onScan, onClose]
  );

  // Boucle de scan de frames vidéo
  const startScanLoop = useCallback(async () => {
    scanLoopActiveRef.current = true;

    // 1. Initialiser le lecteur natif BarcodeDetector si disponible
    let nativeDetector = null;
    if ("BarcodeDetector" in window) {
      try {
        nativeDetector = new window.BarcodeDetector({
          formats: [
            "code_128",
            "code_39",
            "code_93",
            "ean_13",
            "ean_8",
            "qr_code",
            "data_matrix",
          ],
        });
      } catch (e) {
        console.warn("BarcodeDetector fallback:", e);
      }
    }

    // 2. Initialiser ZXing BrowserMultiFormatReader comme moteur universel
    if (!zxingReaderRef.current) {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, 100);
      zxingReaderRef.current = reader;
    }

    // Boucle d'analyse d'images
    async function scanFrame() {
      if (!scanLoopActiveRef.current) return;

      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          // A. Essayer d'abord l'accélération matérielle native
          if (nativeDetector) {
            const barcodes = await nativeDetector.detect(video);
            if (barcodes && barcodes.length > 0) {
              handleDecodedText(barcodes[0].rawValue);
            }
          } else {
            // B. Sinon fallback ZXing via canvas offscreen
            let canvas = canvasRef.current;
            if (!canvas) {
              canvas = document.createElement("canvas");
              canvasRef.current = canvas;
            }
            // Réduire la résolution pour une vitesse maximale (640x360)
            const targetW = Math.min(video.videoWidth, 640);
            const targetH = Math.floor(video.videoHeight * (targetW / video.videoWidth));
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(video, 0, 0, targetW, targetH);

            const result = await zxingReaderRef.current.decodeFromCanvas(canvas);
            if (result) {
              handleDecodedText(result.getText());
            }
          }
        } catch {
          // Erreurs normales d'absence de code sur une frame donnée
        }
      }

      if (scanLoopActiveRef.current) {
        requestAnimationFrame(() => {
          setTimeout(scanFrame, 65); // ~15 analyses par seconde
        });
      }
    }

    scanFrame();
  }, [handleDecodedText]);

  // Démarrer la caméra
  const startCamera = useCallback(
    async (deviceId = null) => {
      try {
        setCameraError("");
        setLoadingCamera(true);

        // Arrêter le flux précédent
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        // Configuration caméra : prioriser la caméra arrière sur smartphone
        const videoConstraints = deviceId
          ? { deviceId: { exact: deviceId } }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // Détecter si la torche/flash est disponible
        const track = stream.getVideoTracks()[0];
        if (track) {
          const caps = track.getCapabilities?.() || {};
          setHasTorch(!!caps.torch);
        }

        // Lister les caméras disponibles
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter((d) => d.kind === "videoinput");
          setCameras(videoDevices);
        } catch {
          // Ignorer
        }

        setLoadingCamera(false);
        startScanLoop();
      } catch (err) {
        console.error("Erreur d'accès à la caméra:", err);
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
    [startScanLoop]
  );

  // Gestion du cycle de vie du modal
  useEffect(() => {
    if (!isOpen) return;

    startCamera(selectedCameraId || null);

    return () => {
      scanLoopActiveRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, selectedCameraId, startCamera]);

  // Basculer la torche/flash
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !flashOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setFlashOn(next);
    } catch (e) {
      console.warn("Torch failed:", e);
    }
  }

  // Changer de caméra (arrière / avant / grand-angle)
  function handleSwitchCamera() {
    if (cameras.length <= 1) return;
    const currentIdx = cameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextIdx = (currentIdx + 1) % cameras.length;
    const nextId = cameras[nextIdx].deviceId;
    setSelectedCameraId(nextId);
  }

  // Importer une photo depuis la galerie / stockage
  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setCameraError("");
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await img.decode();

      // Test BarcodeDetector
      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({
          formats: ["code_128", "code_39", "code_93", "ean_13", "qr_code", "data_matrix"],
        });
        const barcodes = await detector.detect(img);
        if (barcodes && barcodes.length > 0) {
          handleDecodedText(barcodes[0].rawValue);
          return;
        }
      }

      // Fallback ZXing
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const reader = new BrowserMultiFormatReader();
      const res = await reader.decodeFromCanvas(canvas);
      if (res) {
        handleDecodedText(res.getText());
      } else {
        setCameraError("Aucun code-barres lisible trouvé sur cette photo.");
      }
    } catch (err) {
      setCameraError("Impossible de lire de code-barres sur cette photo. Essayez avec une photo plus nette.");
    }
  }

  function handleConfirm() {
    const res = {};
    if (detectedMac) res.mac = detectedMac;
    if (detectedSn) res.sn = detectedSn;
    onScan(res);
    onClose();
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
              Pointez la caméra vers le code-barres de l'étiquette ONT
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
              <span style={{ fontSize: 13 }}>Démarrage de la caméra…</span>
            </div>
          )}

          {/* Viseur visuel avec faisceau laser rouge */}
          <div className="barcode-scan-overlay">
            <div className="barcode-scan-reticle">
              <div className="barcode-laser-line" />
            </div>
            <p className="barcode-scan-hint">
              {targetField === "mac"
                ? "Alignez le code MAC dans le cadre"
                : targetField === "sn"
                ? "Alignez le code SN dans le cadre"
                : "Alignez le code-barres de la box dans le cadre"}
            </p>
          </div>
        </div>

        {/* Barre de contrôles caméra */}
        <div className="barcode-controls-bar">
          {hasTorch && (
            <button
              type="button"
              className={`btn-barcode-ctrl ${flashOn ? "active" : ""}`}
              onClick={toggleTorch}
            >
              🔦 {flashOn ? "Éteindre flash" : "Flash"}
            </button>
          )}

          {cameras.length > 1 && (
            <button type="button" className="btn-barcode-ctrl" onClick={handleSwitchCamera}>
              🔄 Changer caméra
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
            🖼️ Importer photo
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
            <span className="live-type-tag">
              {lastScannedType === "mac"
                ? "✓ MAC DÉTECTÉE"
                : lastScannedType === "sn"
                ? "✓ SN DÉTECTÉ"
                : "✓ DÉTECTION"}
            </span>
            <strong>{lastScannedText}</strong>
          </div>
        )}

        {/* Synthèse des données extraites */}
        <div className="barcode-summary-box">
          <div className={`barcode-summary-row ${detectedMac ? "filled" : ""}`}>
            <span className="summary-label">MAC :</span>
            <strong className="summary-value">{detectedMac || "En attente de scan…"}</strong>
            {detectedMac && <span className="summary-check">✓</span>}
          </div>
          <div className={`barcode-summary-row ${detectedSn ? "filled" : ""}`}>
            <span className="summary-label">SN (ONT) :</span>
            <strong className="summary-value">{detectedSn || "En attente de scan…"}</strong>
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
