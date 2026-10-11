import { useEffect, useRef, useState } from "react";

/**
 * Zone de signature tactile - s'agrandit au touch pour permettre une signature comfortable.
 * 
 * @param {{ label: string, value?: string, onChange: (dataUrl: string) => void }} props
 */
export default function SignaturePad({ label, value, onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return {
      x: ((point.clientX - rect.left) / rect.width) * canvasRef.current.width,
      y: ((point.clientY - rect.top) / rect.height) * canvasRef.current.height,
    };
  }

  function start(e) {
    e.preventDefault();
    if (!expanded) {
      setExpanded(true);
      setTimeout(() => {
        drawingRef.current = true;
        lastPointRef.current = getPos(e);
      }, 100);
      return;
    }
    drawingRef.current = true;
    lastPointRef.current = getPos(e);
  }

  function move(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.strokeStyle = "#0033cc";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPointRef.current = pos;
  }

  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  function collapse() {
    setExpanded(false);
  }

  return (
    <div className={`signature-pad ${expanded ? "signature-expanded" : ""}`}>
      <div className="signature-header">
        <span>{label}</span>
        {expanded && (
          <button type="button" className="btn-secondary" onClick={collapse} style={{ fontSize: 14, padding: "8px 16px" }}>
            Réduire
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={300}
        className="signature-canvas"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="signature-buttons">
        <button type="button" className="btn-secondary" onClick={clear}>
          Effacer
        </button>
        {expanded && (
          <button type="button" className="btn-primary" onClick={collapse}>
            Terminer la signature
          </button>
        )}
      </div>
      {!expanded && (
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          Touchez la zone pour agrandir et signer
        </p>
      )}
    </div>
  );
}
