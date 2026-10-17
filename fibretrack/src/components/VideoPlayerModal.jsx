import { useState, useEffect } from "react";
import { formatFileSize, formatDuration, burnGpsBannerOnVideo } from "../lib/videoCompression";

export default function VideoPlayerModal({ video, clientName = "", onClose, onDelete }) {
  const [showBanner, setShowBanner] = useState(true);
  const [isBurning, setIsBurning] = useState(false);
  const [burnProgress, setBurnProgress] = useState(0);
  const [burnStatus, setBurnStatus] = useState("");
  const [downloadSuccess, setDownloadSuccess] = useState(false);

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
  const effectiveClient = clientName || video.nom_client || video.clientName || "";
  const effectiveTech = video.ajoute_par || video.technicien || "";

  const triggerDownload = (downloadUrl, fileName) => {
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 4500);
  };

  const handleDownloadVideo = async (withBanner = true) => {
    if (isBurning) return;

    const safeTitle = (label || "Video_Terrain")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_");

    if (!withBanner) {
      // Téléchargement du fichier brut
      triggerDownload(url, `${safeTitle}_brut.mp4`);
      return;
    }

    // Si la vidéo estampillée est déjà en cache mémoire
    if (video.stampedUrl) {
      const ext = video.stampedExt || "mp4";
      triggerDownload(video.stampedUrl, `${safeTitle}_GPS.${ext}`);
      return;
    }

    // Incrustation dynamique du bandeau sur les frames de la vidéo
    setIsBurning(true);
    setBurnProgress(10);
    setBurnStatus("Initialisation du transcodage avec bandeau GPS…");

    const bannerInfo = {
      client: effectiveClient,
      type: label,
      lieu: video.lieu || "",
      lat: video.lat,
      lng: video.lng,
      precision_m: video.precision_m || 10,
      horodatage: dateStr || Date.now(),
      technicien: effectiveTech,
    };

    try {
      const result = await burnGpsBannerOnVideo(url, bannerInfo, (pct, statusText) => {
        setBurnProgress(pct);
        setBurnStatus(statusText);
      });

      if (result && result.url) {
        // Enregistrer dans l'objet vidéo pour réutilisation instantanée
        video.stampedUrl = result.url;
        video.stampedBlob = result.blob;
        video.stampedExt = result.extension;

        triggerDownload(result.url, `${safeTitle}_GPS.${result.extension}`);
      } else {
        // Repli gracieux
        triggerDownload(url, `${safeTitle}.mp4`);
      }
    } catch (err) {
      console.warn("Échec incrustation bandeau vidéo, repli fichier direct:", err);
      triggerDownload(url, `${safeTitle}.mp4`);
    } finally {
      setIsBurning(false);
      setBurnProgress(0);
      setBurnStatus("");
    }
  };

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
                {effectiveClient && <span>👤 {effectiveClient}</span>}
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

        {/* Lecteur vidéo avec bandeau de localisation incrusté au bas de la vidéo */}
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

          {/* Bandeau de géolocalisation & horodatage collé directement sur la vidéo en bas */}
          {(video.lat != null || video.lieu || dateStr) && showBanner && (
            <div
              className="video-gps-docked-band"
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background: "linear-gradient(to top, rgba(2, 6, 23, 0.95) 0%, rgba(15, 23, 42, 0.85) 75%, transparent 100%)",
                padding: "24px 14px 10px 14px",
                pointerEvents: "none",
                zIndex: 6,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                borderTop: "2px solid #38bdf8",
                textShadow: "0 1px 3px rgba(0,0,0,0.9)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <span style={{ fontWeight: 800, color: "#38bdf8", fontSize: 13 }}>
                  👤 {effectiveClient ? `Client: ${effectiveClient} • ` : ""}📍 {label}
                </span>
                <span style={{ fontSize: 11, color: "#e2e8f0" }}>
                  📅 {new Date(dateStr || Date.now()).toLocaleString("fr-FR")}
                </span>
              </div>
              {video.lieu && (
                <div style={{ fontSize: 11.5, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  🏠 Lieu: {video.lieu}
                </div>
              )}
              {video.lat != null && video.lng != null && (
                <div style={{ fontSize: 11.5, color: "#facc15", fontFamily: "monospace", fontWeight: 700 }}>
                  🌐 Lat: {Number(video.lat).toFixed(6)} | Lng: {Number(video.lng).toFixed(6)}
                  {video.precision_m != null && ` (±${Number(video.precision_m).toFixed(1)} m)`}
                </div>
              )}
              {effectiveTech && (
                <div style={{ fontSize: 10.5, color: "#94a3b8" }}>
                  👷 Technicien: {effectiveTech}
                </div>
              )}
            </div>
          )}

          {/* Bouton discret pour afficher/masquer le bandeau afin de ne pas obstruer la vue */}
          {(video.lat != null || video.lieu || dateStr) && (
            <button
              type="button"
              onClick={() => setShowBanner((v) => !v)}
              title={showBanner ? "Masquer le bandeau de localisation" : "Afficher le bandeau de localisation"}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                background: "rgba(0, 0, 0, 0.65)",
                color: "#ffffff",
                border: "1px solid rgba(255, 255, 255, 0.25)",
                borderRadius: 20,
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                zIndex: 7,
                backdropFilter: "blur(4px)",
              }}
            >
              {showBanner ? "👁️ Masquer bandeau" : "👁️ Afficher bandeau"}
            </button>
          )}
        </div>

        {/* Barre de progression pendant l'incrustation */}
        {isBurning && (
          <div style={{ padding: "10px 18px", background: "#030712", borderTop: "1px solid #1e293b" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#38bdf8", fontWeight: 600, marginBottom: 5 }}>
              <span>⚙️ {burnStatus || "Incrustation du bandeau GPS sur les pixels de la vidéo…"}</span>
              <span>{burnProgress}%</span>
            </div>
            <div style={{ width: "100%", height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
              <div
                style={{
                  width: `${burnProgress}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #38bdf8, #2563eb)",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
          </div>
        )}

        {/* Message de succès */}
        {downloadSuccess && !isBurning && (
          <div style={{ padding: "8px 18px", background: "rgba(16, 185, 129, 0.15)", borderTop: "1px solid rgba(16, 185, 129, 0.3)", color: "#34d399", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <span>✅ Vidéo téléchargée avec succès (bandeau GPS gravé façon CamScanner).</span>
          </div>
        )}

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
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Bouton principal : Téléchargement avec bandeau GPS gravé */}
            <button
              type="button"
              disabled={isBurning}
              onClick={() => handleDownloadVideo(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: isBurning ? "#475569" : "#0284c7",
                color: "#ffffff",
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: isBurning ? "not-allowed" : "pointer",
                boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
              }}
              title="Télécharger la vidéo avec le bandeau GPS et horodatage gravé façon CamScanner"
            >
              {isBurning ? "⏳ Incrustation en cours…" : "⬇ Télécharger vidéo (avec bandeau GPS)"}
            </button>

            {/* Bouton secondaire : Téléchargement brut */}
            <button
              type="button"
              disabled={isBurning}
              onClick={() => handleDownloadVideo(false)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "transparent",
                color: "#94a3b8",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                border: "1px solid #334155",
                cursor: isBurning ? "not-allowed" : "pointer",
              }}
              title="Télécharger le fichier original sans bandeau"
            >
              Fichier brut
            </button>
          </div>

          {onDelete && (
            <button
              type="button"
              disabled={isBurning}
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
                cursor: isBurning ? "not-allowed" : "pointer",
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
