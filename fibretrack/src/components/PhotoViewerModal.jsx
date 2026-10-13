import { useEffect } from "react";

export default function PhotoViewerModal({ photo, onClose }) {
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

  return (
    <div className="photo-viewer-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="photo-viewer-card" onClick={(e) => e.stopPropagation()}>
        <div className="photo-viewer-header">
          <div className="photo-viewer-title">
            <h3>{photo.title || "Photo terrain"}</h3>
            {photo.subtitle && <p>{photo.subtitle}</p>}
          </div>
          <button type="button" className="btn-close-viewer" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="photo-viewer-img-container">
          <img src={photo.url} alt={photo.title || "Photo agrandie"} className="photo-viewer-img" />
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

        <div className="photo-viewer-actions">
          <button type="button" className="btn-primary" style={{ width: "100%", padding: "12px" }} onClick={onClose}>
            Fermer la photo
          </button>
        </div>
      </div>
    </div>
  );
}

