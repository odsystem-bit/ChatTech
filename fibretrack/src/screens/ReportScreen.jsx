import { useState, useCallback, useEffect } from "react";
import { generateWhatsAppReport } from "../lib/whatsapp";
import { ensureInterventionDefaults, getIntervention, saveInterventionLocally } from "../models/Intervention";
import {
  generateInterventionPdf,
  generateSummaryReportPdf,
  previewInterventionPdf,
  previewSummaryReportPdf,
  shareInterventionPdf,
} from "../lib/pdf";

export default function ReportScreen({ intervention, onClose, onEdit }) {
  const [data, setData] = useState(ensureInterventionDefaults(intervention));
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (intervention) {
      setData(ensureInterventionDefaults(intervention));
    }
  }, [intervention]);

  const handleRefreshReport = useCallback(async () => {
    if (refreshing || !data?.id) return;
    setRefreshing(true);
    try {
      const fresh = await getIntervention(data.id);
      if (fresh) {
        const full = { ...fresh, _fully_loaded: true };
        saveInterventionLocally(full);
        setData(full);
      }
    } catch (err) {
      console.warn("Report refresh error:", err);
    } finally {
      setRefreshing(false);
    }
  }, [data?.id, refreshing]);

  const [copied, setCopied] = useState(false);
  const [pdfStatus, setPdfStatus] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [realises, setRealises] = useState("");
  const [recus, setRecus] = useState("");
  const [loadingAction, setLoadingAction] = useState(null);

  const compteurJour = {
    realises: realises !== "" ? Number(realises) : 0,
    recus: recus !== "" ? Number(recus) : 0,
  };
  const report = generateWhatsAppReport(data, compteurJour);

  async function handleCopy() {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownloadPdf() {
    if (loadingAction) return;
    setLoadingAction("downloadPdf");
    setPdfStatus("Génération du PDF…");
    try {
      await generateInterventionPdf(data);
      setPdfStatus("PDF téléchargé.");
    } catch (err) {
      setPdfStatus(`Erreur : ${err.message}`);
    }
    setLoadingAction(null);
  }

  async function handlePreviewPdf() {
    if (loadingAction) return;
    setLoadingAction("previewPdf");
    setPdfStatus("Ouverture du PDF…");
    try {
      await previewInterventionPdf(data);
      setPdfStatus("");
    } catch (err) {
      setPdfStatus(`Erreur : ${err.message}`);
    }
    setLoadingAction(null);
  }

  async function handleDownloadReport() {
    if (loadingAction) return;
    setLoadingAction("downloadReport");
    setReportStatus("Génération du rapport (photos + schéma)…");
    try {
      await generateSummaryReportPdf(data);
      setReportStatus("Rapport téléchargé.");
    } catch (err) {
      setReportStatus(`Erreur : ${err.message}`);
    }
    setLoadingAction(null);
  }

  async function handlePreviewReport() {
    if (loadingAction) return;
    setLoadingAction("previewReport");
    setReportStatus("Ouverture du rapport…");
    try {
      await previewSummaryReportPdf(data);
      setReportStatus("");
    } catch (err) {
      setReportStatus(`Erreur : ${err.message}`);
    }
    setLoadingAction(null);
  }

  async function handleShare() {
    if (loadingAction) return;
    setLoadingAction("share");
    setShareStatus("Préparation du partage…");
    try {
      const result = await shareInterventionPdf(data);
      setShareStatus(
        result === "shared"
          ? "Partagé !"
          : "Partage non disponible sur ce navigateur - PDF téléchargé, joignez-le manuellement à WhatsApp."
      );
    } catch (err) {
      if (err.name !== "AbortError") setShareStatus(`Erreur : ${err.message}`);
      else setShareStatus("");
    }
    setLoadingAction(null);
  }

  return (
    <div className="report-screen">
      <header className="form-header">
        <h2>Intervention terminée</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="btn-header-refresh"
            onClick={handleRefreshReport}
            disabled={refreshing}
            title="Actualiser les informations de l'intervention"
          >
            <span className={refreshing ? "spin-icon" : ""}>🔄</span>
            <span className="btn-refresh-label">{refreshing ? "…" : "Actualiser"}</span>
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
              <path d="M3 12l6 6 12-12" />
            </svg>
            Accueil
          </button>
        </div>
      </header>

      <div className="status-banner" style={{ marginBottom: 16 }}>
        ✅ <strong>{data.nom_client || "Nouveau client"}</strong> — Intervention terminée
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn-primary btn-large" onClick={handlePreviewPdf} disabled={loadingAction === "previewPdf"}>
          {loadingAction === "previewPdf" ? "Chargement…" : "📄 Voir les fiches officielles"}
        </button>
        <button type="button" className="btn-secondary btn-large" onClick={handleDownloadPdf} disabled={loadingAction === "downloadPdf"}>
          {loadingAction === "downloadPdf" ? "Chargement…" : "⬇ Télécharger les fiches"}
        </button>
      </div>
      {pdfStatus && <p className="gps-status">{pdfStatus}</p>}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <button type="button" className="btn-primary btn-large" onClick={handlePreviewReport} disabled={loadingAction === "previewReport"}>
          {loadingAction === "previewReport" ? "Chargement…" : "📸 Voir le rapport (photos + schéma)"}
        </button>
        <button type="button" className="btn-secondary btn-large" onClick={handleDownloadReport} disabled={loadingAction === "downloadReport"}>
          {loadingAction === "downloadReport" ? "Chargement…" : "⬇ Télécharger le rapport"}
        </button>
      </div>
      {reportStatus && <p className="gps-status">{reportStatus}</p>}

      <button type="button" className="btn-secondary btn-large" onClick={handleShare} disabled={loadingAction === "share"} style={{ marginTop: 12 }}>
        {loadingAction === "share" ? "Chargement…" : "💬 Partager sur WhatsApp"}
      </button>
      {shareStatus && <p className="gps-status">{shareStatus}</p>}

      <h3>Compteur journalier</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="form-field" style={{ flex: "1 1 120px" }}>
          <span>Réalisés (aujourd'hui)</span>
          <input
            type="number"
            min="0"
            value={realises}
            onChange={(e) => setRealises(e.target.value)}
            placeholder="0"
          />
        </label>
        <label className="form-field" style={{ flex: "1 1 120px" }}>
          <span>Reçus (dossiers donnés)</span>
          <input
            type="number"
            min="0"
            value={recus}
            onChange={(e) => setRecus(e.target.value)}
            placeholder="0"
          />
        </label>
      </div>

      <h3>Rapport WhatsApp (texte)</h3>
      <textarea className="whatsapp-report" readOnly value={report} rows={18} />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn-primary btn-large" onClick={handleCopy}>
          {copied ? "Copié !" : "Copier vers le presse-papier"}
        </button>
        <button
          type="button"
          className="btn-primary btn-large"
          onClick={() => {
            const url = `https://wa.me/?text=${encodeURIComponent(report)}`;
            window.open(url, "_blank");
          }}
        >
          Envoyer sur WhatsApp
        </button>
      </div>

      <button type="button" className="btn-secondary btn-large" onClick={() => onEdit(intervention)} style={{ marginTop: 12 }}>
        ✏ Modifier cette intervention
      </button>
    </div>
  );
}
