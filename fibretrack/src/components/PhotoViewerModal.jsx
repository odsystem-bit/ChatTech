import { useState, useEffect } from "react";
import { downloadPhotoFile } from "../lib/photoDownload.js";

export default function PhotoViewerModal({ photo, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  useEffect(() => {
    if (!photo) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [photo, onClose]);

  if (!photo) return null;

  async function handleDownload(e) {
    e?.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    setDownloadSuccess(false);
    try {
      await downloadPhotoFile(photo);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.error("Erreur téléchargement photo:", err);
      alert("Impossible de télécharger la photo : " + err.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="photo-viewer-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="photo-viewer-card" onClick={(e) => e.stopPropagation()}>
        <div className="photo-viewer-header">
          <div className="photo-viewer-title">
            <h3>{photo.title || "Photo terrain"}</h3>
            {photo.subtitle && <p>{photo.subtitle}</p>}
          </div>
          <div className="photo-viewer-header-actions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className={`btn-download-viewer ${downloadSuccess ? "is-success" : ""}`}
              onClick={handleDownload}
              disabled={downloading}
              title="Télécharger cette photo sur votre appareil"
              aria-label="Télécharger la photo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{downloadSuccess ? "✓ Enregistré" : downloading ? "Téléchargement…" : "Télécharger"}</span>
            </button>
            <button type="button" className="btn-close-viewer" onClick={onClose} aria-label="Fermer">
              ✕
            </button>
          </div>
        </div>

        <div
          className="photo-viewer-img-container"
          onClick={handleDownload}
          title="Cliquer pour télécharger la photo sur votre appareil"
          style={{ cursor: "pointer" }}
        >
          <img src={photo.url} alt={photo.title || "Photo agrandie"} className="photo-viewer-img" />
          <div className="photo-viewer-download-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{downloadSuccess ? "✓ Photo téléchargée !" : "Cliquer pour télécharger"}</span>
          </div>
        </div>

        {photo.info && photo.info.length > 0 && (
          <div className="photo-viewer-info-grid">
            {photo.info.map((item, idx) => (
              <div key={idx} className="photo-info-item">
                <span className="photo-info-label">{item.label}</span>
                <strong className="photo-info-val">{item.val}</strong>
              </div>
            ))}
          </div>
        )}

        <div className="photo-viewer-actions" style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn-primary"
            style={{
              flex: 1,
              padding: "12px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontWeight: 700,
            }}
            onClick={handleDownload}
            disabled={downloading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {downloadSuccess ? "✓ Photo téléchargée avec succès" : downloading ? "Téléchargement en cours…" : "Télécharger la photo"}
          </button>
          <button type="button" className="btn-secondary" style={{ flex: 1, padding: "12px" }} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
