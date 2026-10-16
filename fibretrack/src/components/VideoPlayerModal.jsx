import { useEffect } from "react";
import { formatFileSize, formatDuration } from "../lib/videoCompression";

export default function VideoPlayerModal({ video, onClose, onDelete }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!video) return null;

  const url = video.url || video.src || "";
  const label = video.label || video.name || "Vidéo terrain";
  const duration = video.duration || video.duree_sec || 0;
  const size = video.size || video.taille_octets || 0;
  const dateStr = video.captured_at || video.cree_le || video.horodatage || "";

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.88)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: 16,
      }}
    >
      <div
        className="modal-card video-player-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0f172a",
          color: "#f8fafc",
          borderRadius: 16,
          maxWidth: 680,
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          border: "1px solid #334155",
          overflow: "hidden",
        }}
      >
        {/* En-tête */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 18px",
            borderBottom: "1px solid #1e293b",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 20 }}>📹</span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {label}
              </h3>
              <div style={{ fontSize: 12, color: "#94a3b8", display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                {duration > 0 && <span>⏱ {formatDuration(duration)}</span>}
                {size > 0 && <span>📦 {formatFileSize(size)}</span>}
                {dateStr && <span>📅 {new Date(dateStr).toLocaleString("fr-FR")}</span>}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none",
              color: "#f8fafc",
              borderRadius: "50%",
              width: 34,
              height: 34,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: "bold",
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Lecteur vidéo */}
        <div
          style={{
            position: "relative",
            background: "#000000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 280,
            maxHeight: "65vh",
            overflow: "hidden",
          }}
        >
          <video
            controls
            autoPlay
            playsInline
            src={url}
            poster={video.thumbnail_url || video.thumbnailDataUrl || ""}
            style={{
              width: "100%",
              maxHeight: "65vh",
              objectFit: "contain",
              backgroundColor: "#000000",
            }}
          >
            Votre navigateur ne supporte pas la lecture de cette vidéo.
          </video>
        </div>

        {/* Barre d'actions du bas */}
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid #1e293b",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
            background: "#0b1120",
          }}
        >
          <a
            href={url}
            download={video.filename || `${label.replace(/[^a-zA-Z0-9_-]/g, "_")}.mp4`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#2563eb",
              color: "#ffffff",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            ⬇ Télécharger la vidéo
          </a>

          {onDelete && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Êtes-vous sûr de vouloir supprimer cette vidéo de terrain ?")) {
                  onDelete(video);
                  onClose();
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(239, 68, 68, 0.15)",
                color: "#f87171",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🗑️ Supprimer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
