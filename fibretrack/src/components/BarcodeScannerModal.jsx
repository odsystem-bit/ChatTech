import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { parseBarcode } from "../lib/barcodeParser";

/**
 * Joue un bip sonore de succès via l'API Web Audio (aucun fichier externe requis)
 */
function playSuccessBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // Note La5 (880 Hz)
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch {
    // Silencieux si audio bloqué
  }
}

/**
 * Déclenche une vibration haptique si supportée
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

/**
 * @param {{
 *   isOpen: boolean,
 *   targetField: 'mac' | 'sn' | 'both',
 *   currentMac?: string,
 *   currentSn?: string,
 *   onScan: (result: { mac?: string, sn?: string }) => void,
 *   onClose: () => void
 * }} props
 */
export default function BarcodeScannerModal({
  isOpen,
  targetField = "both",
  currentMac = "",
  currentSn = "",
  onScan,
  onClose,
}) {
  const [scannerError, setScannerError] = useState("");
  const [detectedMac, setDetectedMac] = useState(currentMac);
  const [detectedSn, setDetectedSn] = useState(currentSn);
  const [lastScannedText, setLastScannedText] = useState("");
  const [lastScannedType, setLastScannedType] = useState("");
  const [flashOn, setFlashOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");

  const scannerRef = useRef(null);
  const fileInputRef = useRef(null);
  const isProcessingRef = useRef(false);

  // Mettre à jour les valeurs existantes à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setDetectedMac(currentMac);
      setDetectedSn(currentSn);
      setLastScannedText("");
      setLastScannedType("");
      setScannerError("");
    }
  }, [isOpen, currentMac, currentSn]);

  // Traiter un code-barres scanné
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
          // Si on ciblait spécifiquement le MAC, validation immédiate
          setTimeout(() => {
            onScan({ mac: parsed.value });
            onClose();
          }, 450);
          return;
        }
      } else if (parsed.type === "sn") {
        setDetectedSn(parsed.value);
        if (targetField === "sn") {
          // Si on ciblait spécifiquement le SN, validation immédiate
          setTimeout(() => {
            onScan({ sn: parsed.value });
            onClose();
          }, 450);
          return;
        }
      } else {
        // Type générique : l'attribuer selon la cible demandée
        if (targetField === "mac") {
          setDetectedMac(parsed.value);
          setTimeout(() => {
            onScan({ mac: parsed.value });
            onClose();
          }, 450);
          return;
        } else if (targetField === "sn") {
          setDetectedSn(parsed.value);
          setTimeout(() => {
            onScan({ sn: parsed.value });
            onClose();
          }, 450);
          return;
        }
      }

      // Si mode 'both', vérifier si on a les deux
      if (targetField === "both") {
        const nextMac = parsed.type === "mac" ? parsed.value : detectedMac;
        const nextSn = parsed.type === "sn" ? parsed.value : detectedSn;
        if (nextMac && nextSn) {
          setTimeout(() => {
            onScan({ mac: nextMac, sn: nextSn });
            onClose();
          }, 600);
          return;
        }
      }

      // Laisser un délai de debounce avant le prochain scan
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1200);
    },
    [targetField, detectedMac, detectedSn, onScan, onClose]
  );

  // Démarrer la caméra
  useEffect(() => {
    if (!isOpen) return;

    let html5QrCode = null;
    let isMounted = true;

    async function initScanner() {
      try {
        setScannerError("");
        setScannerActive(true);

        const formatsToSupport = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ];

        html5QrCode = new Html5Qrcode("reader-barcode-viewport", {
          formatsToSupport,
          verbose: false,
        });
        scannerRef.current = html5QrCode;

        // Récupérer les caméras
        const devices = await Html5Qrcode.getCameras().catch(() => []);
        if (isMounted) {
          setCameras(devices);
          if (devices.length > 0 && !selectedCameraId) {
            // Préférer la caméra arrière (environnement)
            const backCamera = devices.find((d) => /back|rear|environnement/i.test(d.label)) || devices[devices.length - 1];
            setSelectedCameraId(backCamera.id);
          }
        }

        const cameraConfig = selectedCameraId
          ? { deviceId: { exact: selectedCameraId } }
          : { facingMode: "environment" };

        const qrConfig = {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            // Zone rectangulaire idéale pour les codes-barres 1D d'étiquettes
            const width = Math.floor(viewfinderWidth * 0.88);
            const height = Math.floor(Math.min(viewfinderHeight * 0.45, 180));
            return { width, height };
          },
          aspectRatio: 1.3333,
        };

        await html5QrCode.start(
          cameraConfig,
          qrConfig,
          (decodedText) => {
            handleDecodedText(decodedText);
          },
          () => {
            // Erreurs normales de détection par frame, ignorées
          }
        );

        if (isMounted) {
          // Tester support torche
          try {
            const capabilities = html5QrCode.getRunningTrackCapabilities();
            if (capabilities && capabilities.torch) {
              setHasTorch(true);
            }
          } catch {
            setHasTorch(false);
          }
        }
      } catch (err) {
        console.error("Scanner init error:", err);
        if (isMounted) {
          setScannerError(
            "Impossible d'accéder à la caméra. Vérifiez les autorisations du navigateur ou utilisez l'import de photo."
          );
        }
      }
    }

    // Petit délai pour assurer le montage de la div DOM
    const timer = setTimeout(() => {
      initScanner();
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode
          .stop()
          .catch(() => {})
          .finally(() => {
            html5QrCode.clear();
          });
      }
    };
  }, [isOpen, selectedCameraId, handleDecodedText]);

  // Basculer la torche
  async function toggleTorch() {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextState = !flashOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }],
      });
      setFlashOn(nextState);
    } catch (e) {
      console.warn("Torch toggle failed:", e);
    }
  }

  // Scanner depuis une image de galerie / fichier
  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file || !scannerRef.current) return;
    try {
      setScannerError("");
      const result = await scannerRef.current.scanFile(file, true);
      handleDecodedText(result);
    } catch (err) {
      setScannerError("Aucun code-barres lisible détecté sur cette photo.");
    }
  }

  // Validation manuelle de ce qui a été détecté
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
        <div className="barcode-modal-header">
          <div>
            <h3>{targetTitle}</h3>
            <p className="barcode-modal-subtitle">
              Pointez la caméra vers le code-barres correspondant sur l'étiquette
            </p>
          </div>
          <button type="button" className="btn-close-viewer" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        {/* Zone de scan vidéo */}
        <div className="barcode-viewport-wrapper">
          <div id="reader-barcode-viewport" className="barcode-viewport" />
          <div className="barcode-scan-overlay">
            <div className="barcode-scan-reticle">
              <div className="barcode-laser-line" />
            </div>
            <p className="barcode-scan-hint">
              {targetField === "mac"
                ? "Alignez le code-barres MAC dans le cadre"
                : targetField === "sn"
                ? "Alignez le code-barres SN dans le cadre"
                : "Alignez les codes-barres de la box dans le cadre"}
            </p>
          </div>
        </div>

        {/* Contrôles caméra */}
        <div className="barcode-controls-bar">
          {hasTorch && (
            <button
              type="button"
              className={`btn-barcode-ctrl ${flashOn ? "active" : ""}`}
              onClick={toggleTorch}
              title="Allumer le flash"
            >
              🔦 {flashOn ? "Éteindre flash" : "Flash"}
            </button>
          )}

          {cameras.length > 1 && (
            <button
              type="button"
              className="btn-barcode-ctrl"
              onClick={() => {
                const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
                const nextIndex = (currentIndex + 1) % cameras.length;
                setSelectedCameraId(cameras[nextIndex].id);
              }}
              title="Changer de caméra"
            >
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
            title="Importer une photo depuis la galerie"
          >
            🖼️ Importer photo
          </button>
        </div>

        {/* Message d'erreur éventuel */}
        {scannerError && (
          <div className="barcode-error-banner">
            ⚠️ {scannerError}
          </div>
        )}

        {/* Dernier code lu */}
        {lastScannedText && (
          <div className="barcode-live-detected">
            <span className="live-type-tag">
              {lastScannedType === "mac" ? "✓ MAC DÉTECTÉE" : lastScannedType === "sn" ? "✓ SN DÉTECTÉ" : "✓ DÉTECTION"}
            </span>
            <strong>{lastScannedText}</strong>
          </div>
        )}

        {/* Résumé des données extraites */}
        <div className="barcode-summary-box">
          <div className={`barcode-summary-row ${detectedMac ? "filled" : ""}`}>
            <span className="summary-label">MAC :</span>
            <strong className="summary-value">{detectedMac || "En attente de scan..."}</strong>
            {detectedMac && <span className="summary-check">✓</span>}
          </div>
          <div className={`barcode-summary-row ${detectedSn ? "filled" : ""}`}>
            <span className="summary-label">SN (ONT) :</span>
            <strong className="summary-value">{detectedSn || "En attente de scan..."}</strong>
            {detectedSn && <span className="summary-check">✓</span>}
          </div>
        </div>

        {/* Actions de validation */}
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
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
