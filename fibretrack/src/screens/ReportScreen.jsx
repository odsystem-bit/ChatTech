import { useState, useCallback, useEffect } from "react";
import { generateWhatsAppReport } from "../lib/whatsapp";
import { ensureInterventionDefaults, getIntervention, saveInterventionLocally, saveIntervention } from "../models/Intervention";
import {
  generateInterventionPdf,
  generateSummaryReportPdf,
  previewInterventionPdf,
  previewSummaryReportPdf,
  shareInterventionPdf,
  generateSatisfactionPdf,
  previewSatisfactionPdf,
} from "../lib/pdf";
import FicheSatisfactionDocument from "../components/FicheSatisfactionDocument";

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
  const [satStatus, setSatStatus] = useState("");
  const [showSatModal, setShowSatModal] = useState(false);
  const [realises, setRealises] = useState("");
  const [recus, setRecus] = useState("");
  const [loadingAction, setLoadingAction] = useState(null);

  const compteurJour = {
    realises: realises !== "" ? Number(realises) : 0,
    recus: recus !== "" ? Number(recus) : 0,
  };
  const report = generateWhatsAppReport(data, compteurJour);

  async function handleDownloadSatisfaction() {
    if (loadingAction) return;
    setLoadingAction("downloadSat");
    setSatStatus("Génération de la fiche de satisfaction…");
    try {
      await generateSatisfactionPdf(data);
      setSatStatus("Fiche téléchargée.");
    } catch (err) {
      setSatStatus(`Erreur : ${err.message}`);
    }
    setLoadingAction(null);
  }

  async function handlePreviewSatisfaction() {
    if (loadingAction) return;
    setLoadingAction("previewSat");
    setSatStatus("Ouverture de la fiche de satisfaction…");
    try {
      await previewSatisfactionPdf(data);
      setSatStatus("");
    } catch (err) {
      setSatStatus(`Erreur : ${err.message}`);
    }
    setLoadingAction(null);
  }

  async function handleSaveSatisfactionChanges(updated) {
    setData(updated);
    saveInterventionLocally(updated);
    try {
      await saveIntervention(updated);
      setSatStatus("✓ Modifications et signatures enregistrées.");
    } catch (err) {
      console.warn("Could not save to remote:", err);
      setSatStatus("✓ Enregistré en local.");
    }
  }

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

      {/* Module Fiche de Satisfaction Client (ENR-02) */}
      <div style={{ marginTop: 14, padding: 14, background: "#f8fafc", borderRadius: 12, border: "1px solid #cbd5e1" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>✍️</span>
          <div>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
              Fiche d'Évaluation de la Satisfaction Client (ENR-02)
            </h4>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#64748b" }}>
              Document officiel Premium Company Bénin pré-rempli avec signature numérique.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <button
            type="button"
            className="btn-primary"
            style={{ background: "#2563eb", borderColor: "#2563eb", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={() => setShowSatModal(true)}
          >
            📋 Ouvrir la fiche & Signer
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handlePreviewSatisfaction}
            disabled={loadingAction === "previewSat"}
          >
            {loadingAction === "previewSat" ? "Chargement…" : "👁️ Aperçu PDF Officiel"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleDownloadSatisfaction}
            disabled={loadingAction === "downloadSat"}
          >
            {loadingAction === "downloadSat" ? "Chargement…" : "⬇ Télécharger PDF"}
          </button>
        </div>
        {satStatus && <p className="gps-status" style={{ marginTop: 8 }}>{satStatus}</p>}
      </div>

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

      {/* Modal Fiche de Satisfaction Interactive & Signable */}
      {showSatModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.75)",
            zIndex: 9990,
            overflowY: "auto",
            padding: "20px 10px",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
          }}
          onClick={() => setShowSatModal(false)}
        >
          <div
            style={{ maxWidth: 860, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <FicheSatisfactionDocument
              intervention={data}
              onChange={handleSaveSatisfactionChanges}
              onSave={handleSaveSatisfactionChanges}
              onClose={() => setShowSatModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
