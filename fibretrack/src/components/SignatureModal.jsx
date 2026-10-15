import { useState, useRef, useEffect } from "react";

/**
 * Composant de signature modale tactile haute définition
 * Prise en charge Retina/High-DPI, touch mobile et souris
 */
export default function SignatureModal({ title, initialValue, onSave, onClose }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (initialValue && initialValue.startsWith("data:image")) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasDrawn(true);
      };
      img.src = initialValue;
    }
  }, [initialValue]);

  function getCoordinates(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function startDrawing(e) {
    e.preventDefault();
    isDrawing.current = true;
    lastPoint.current = getCoordinates(e);
  }

  function draw(e) {
    if (!isDrawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const currentPoint = getCoordinates(e);

    ctx.strokeStyle = "#0033cc"; // Encre bleue stylo authentique
    ctx.lineWidth = 2.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();

    lastPoint.current = currentPoint;
    setHasDrawn(true);
  }

  function stopDrawing() {
    isDrawing.current = false;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  }

  function handleValidate() {
    const canvas = canvasRef.current;
    if (!canvas) {
      onClose();
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
    onClose();
  }

  return (
    <div className="sig-modal-backdrop" onClick={onClose}>
      <div className="sig-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="sig-modal-header">
          <h3>✍️ {title}</h3>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: "4px 10px", fontSize: 13 }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="sig-modal-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="sig-modal-canvas"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>
        <div className="sig-modal-footer">
          <button type="button" className="btn-secondary" onClick={handleClear}>
            🗑️ Effacer
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="button" className="btn-primary" onClick={handleValidate}>
              ✓ Valider la signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
