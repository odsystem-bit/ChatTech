import { useState, useCallback, useEffect } from "react";
import { generateGlobalReport, generateConformiteReport, generateWhatsAppReport } from "../lib/whatsapp";
import { ensureInterventionDefaults, getIntervention, saveInterventionLocally, saveIntervention } from "../models/Intervention";
import {
  generateInterventionPdf,
  generateSummaryReportPdf,
  previewInterventionPdf,
  previewSummaryReportPdf,
  shareInterventionPdf,
  generateSatisfactionPdf,
  previewSatisfactionPdf,
  generateSbinPdf,
  previewSbinPdf,
  generateFichesPdf,
  previewFichesPdf,
} from "../lib/pdf";
import FichesOfficiellesModule from "../components/FichesOfficiellesModule";

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
  const [showFichesModal, setShowFichesModal] = useState(false);
  const [reportType, setReportType] = useState("global");
  const [realises, setRealises] = useState("");
  const [recus, setRecus] = useState("");
  const [loadingAction, setLoadingAction] = useState(null);

  const compteurJour = {
    realises: realises !== "" ? Number(realises) : 0,
    recus: recus !== "" ? Number(recus) : 0,
  };
  const globalReport = generateGlobalReport(data, compteurJour);
  const conformiteReport = generateConformiteReport(data);
  const activeReport = reportType === "conformite" ? conformiteReport : globalReport;

  // --- Actions Fiche 1 : SBIN ---
  async function handleDownloadSbin() {
    if (loadingAction) return;
    setLoadingAction("downloadSbin");
    setSatStatus("Génération de la fiche SBIN (Mise en service)…");
    try {
      await generateSbinPdf(data);
      setSatStatus("Fiche SBIN téléchargée.");
    } catch (err) {
      setSatStatus(`Erreur : ${err.message}`);
    }
    setLoadingAction(null);
  }

  async function handlePreviewSbin() {
    if (loadingAction) return;
    setLoadingAction("previewSbin");
    setSatStatus("Ouverture de la fiche SBIN…");
    try {
      await previewSbinPdf(data);
      setSatStatus("");
    } catch (err) {
      setSatStatus(`Erreur : ${err.message}`);
    }
    setLoadingAction(null);
  }

  // --- Actions Fiche 2 : Satisfaction Client ---
  async function handleDownloadSatisfaction() {
    if (loadingAction) return;
    setLoadingAction("downloadSat");
    setSatStatus("Génération de la fiche de satisfaction (ENR-02)…");
    try {
      await generateSatisfactionPdf(data);
      setSatStatus("Fiche de satisfaction téléchargée.");
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

  // --- Actions Dossier Complet (2 fiches réunies) ---
  async function handleDownloadBothFiches() {
    if (loadingAction) return;
    setLoadingAction("downloadBoth");
    setPdfStatus("Génération du dossier complet (2 pages : SBIN + Satisfaction)…");
    try {
      await generateFichesPdf(data);
      setPdfStatus("Dossier complet téléchargé.");
    } catch (err) {
      setPdfStatus(`Erreur : ${err.message}`);
    }
    setLoadingAction(null);
  }

  async function handlePreviewBothFiches() {
    if (loadingAction) return;
    setLoadingAction("previewBoth");
    setPdfStatus("Ouverture du dossier complet (2 pages)…");
    try {
      await previewFichesPdf(data);
      setPdfStatus("");
    } catch (err) {
      setPdfStatus(`Erreur : ${err.message}`);
    }
    setLoadingAction(null);
  }

  async function handleSaveFichesChanges(updated) {
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
    await navigator.clipboard.writeText(activeReport);
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

      {/* SECTION DOCUMENTS OFFICIELS & SIGNATURES */}
      <div style={{ marginTop: 14, padding: 16, background: "#f8fafc", borderRadius: 14, border: "1px solid #cbd5e1" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
              📑 Documents Officiels d'Intervention (2 Fiches)
            </h4>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#64748b" }}>
              Pré-remplis avec écriture manuscrite et signatures numériques.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ background: "#2563eb", borderColor: "#2563eb", fontWeight: 700 }}
            onClick={() => setShowFichesModal(true)}
          >
            ✍️ Ouvrir & Signer les Fiches
          </button>
        </div>

        {/* Ligne 1 : Fiche SBIN */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#ffffff", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div>
            <strong style={{ fontSize: 13, color: "#0f172a" }}>📄 Fiche 1 : Mise en Service & Interventions (SBIN)</strong>
            <div style={{ fontSize: 11.5, color: "#64748b" }}>ONT SN, PTO, offres FTTH B2B2G, constats, note qualité, signatures</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={handlePreviewSbin} disabled={loadingAction === "previewSbin"}>
              {loadingAction === "previewSbin" ? "…" : "👁️ Aperçu PDF"}
            </button>
            <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={handleDownloadSbin} disabled={loadingAction === "downloadSbin"}>
              {loadingAction === "downloadSbin" ? "…" : "⬇ Télécharger"}
            </button>
          </div>
        </div>

        {/* Ligne 2 : Fiche Satisfaction */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#ffffff", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div>
            <strong style={{ fontSize: 13, color: "#0f172a" }}>✍️ Fiche 2 : Satisfaction Client (ENR-02)</strong>
            <div style={{ fontSize: 11.5, color: "#64748b" }}>Validation des 8 points, grille satisfaction, déclaration client, signatures</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={handlePreviewSatisfaction} disabled={loadingAction === "previewSat"}>
              {loadingAction === "previewSat" ? "…" : "👁️ Aperçu PDF"}
            </button>
            <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={handleDownloadSatisfaction} disabled={loadingAction === "downloadSat"}>
              {loadingAction === "downloadSat" ? "…" : "⬇ Télécharger"}
            </button>
          </div>
        </div>

        {/* Ligne 3 : Dossier complet 2 fiches */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#f1f5f9", borderRadius: 8, border: "1px solid #cbd5e1", flexWrap: "wrap", gap: 8 }}>
          <div>
            <strong style={{ fontSize: 13, color: "#0f172a" }}>📑 Dossier Complet (Les 2 Fiches Réunies)</strong>
            <div style={{ fontSize: 11.5, color: "#64748b" }}>Document PDF de 2 pages officiel regroupant SBIN et Satisfaction</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={handlePreviewBothFiches} disabled={loadingAction === "previewBoth"}>
              {loadingAction === "previewBoth" ? "…" : "👁️ Aperçu PDF (2 pages)"}
            </button>
            <button type="button" className="btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={handleDownloadBothFiches} disabled={loadingAction === "downloadBoth"}>
              {loadingAction === "downloadBoth" ? "…" : "⬇ Télécharger Dossier"}
            </button>
          </div>
        </div>

        {satStatus && <p className="gps-status" style={{ marginTop: 8 }}>{satStatus}</p>}
        {pdfStatus && <p className="gps-status" style={{ marginTop: 8 }}>{pdfStatus}</p>}
      </div>

      <button type="button" className="btn-secondary btn-large" onClick={handleShare} disabled={loadingAction === "share"} style={{ marginTop: 12 }}>
        {loadingAction === "share" ? "Chargement…" : "💬 Partager sur WhatsApp"}
      </button>
      {shareStatus && <p className="gps-status">{shareStatus}</p>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, marginBottom: 16 }}>
        <button
          type="button"
          className={reportType === "global" ? "btn-primary" : "btn-secondary"}
          onClick={() => { setReportType("global"); setCopied(false); }}
          style={{ flex: "1 1 200px", padding: "12px 16px", fontWeight: "600", fontSize: "14px" }}
        >
          📋 Rapport Global WhatsApp
        </button>
        <button
          type="button"
          className={reportType === "conformite" ? "btn-primary" : "btn-secondary"}
          onClick={() => { setReportType("conformite"); setCopied(false); }}
          style={{ flex: "1 1 200px", padding: "12px 16px", fontWeight: "600", fontSize: "14px" }}
        >
          ✅ Rapport de Conformité
        </button>
      </div>

      {reportType === "global" && (
        <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: 8, marginBottom: 16, border: "1px solid #e2e8f0" }}>
          <h4 style={{ margin: "0 0 8px 0", fontSize: 13, color: "#475569" }}>Compteur journalier</h4>
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
        </div>
      )}

      <h3>{reportType === "conformite" ? "Rapport de Conformité (texte)" : "Rapport Global WhatsApp (texte)"}</h3>
      <textarea className="whatsapp-report" readOnly value={activeReport} rows={18} />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn-primary btn-large" onClick={handleCopy}>
          {copied ? "✓ Rapport copié !" : `Copier ${reportType === "conformite" ? "la Conformité" : "le Rapport Global"}`}
        </button>
        <button
          type="button"
          className="btn-primary btn-large"
          onClick={() => {
            const url = `https://wa.me/?text=${encodeURIComponent(activeReport)}`;
            window.open(url, "_blank");
          }}
        >
          Envoyer sur WhatsApp
        </button>
      </div>

      <button type="button" className="btn-secondary btn-large" onClick={() => onEdit(intervention)} style={{ marginTop: 12 }}>
        ✏ Modifier cette intervention
      </button>

      {/* Modal Fiches Officielles Interactives & Signables */}
      {showFichesModal && (
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
          onClick={() => setShowFichesModal(false)}
        >
          <div
            style={{ maxWidth: 880, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <FichesOfficiellesModule
              intervention={data}
              onChange={handleSaveFichesChanges}
              onSave={handleSaveFichesChanges}
              onClose={() => setShowFichesModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
