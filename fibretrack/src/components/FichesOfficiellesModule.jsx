import { useState } from "react";
import FicheSbinDocument from "./FicheSbinDocument";
import FicheSatisfactionDocument from "./FicheSatisfactionDocument";
import { generateFichesPdf, previewFichesPdf } from "../lib/pdf";

/**
 * Module complet des Fiches Officielles d'intervention
 * Intègre :
 *  1. Fiche SBIN : Mise en service et interventions FTTH/Cuivre
 *  2. Fiche ENR-02 : Évaluation de la satisfaction du client
 *  3. Dossier complet : Les deux fiches réunies
 */
export default function FichesOfficiellesModule({
  intervention,
  onChange,
  onSave,
  onClose,
  readOnly = false,
}) {
  const [activeFicheTab, setActiveFicheTab] = useState("sbin"); // 'sbin' | 'satisfaction' | 'both'
  const [downloadingBoth, setDownloadingBoth] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const data = intervention || {};

  async function handleDownloadBoth() {
    setDownloadingBoth(true);
    setStatusMsg("Génération du dossier officiel complet (2 pages : SBIN + Satisfaction)…");
    try {
      await generateFichesPdf(data);
      setStatusMsg("Téléchargement du dossier complet lancé !");
    } catch (err) {
      setStatusMsg(`Erreur : ${err.message}`);
    } finally {
      setDownloadingBoth(false);
      setTimeout(() => setStatusMsg(""), 4000);
    }
  }

  async function handlePreviewBoth() {
    setDownloadingBoth(true);
    try {
      await previewFichesPdf(data);
    } catch (err) {
      alert(`Erreur d'ouverture : ${err.message}`);
    } finally {
      setDownloadingBoth(false);
    }
  }

  return (
    <div className="fiches-officielles-container" style={{ width: "100%", maxWidth: 860, margin: "0 auto" }}>
      {/* Barre de sélection claire entre les deux fiches */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 14,
          padding: "12px 16px",
          marginBottom: 16,
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          border: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
              📑 Documents Officiels d'Intervention
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#64748b" }}>
              Les 2 fiches officielles sont disponibles, pré-remplies et signables numériquement.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handlePreviewBoth}
              disabled={downloadingBoth}
              title="Ouvre le PDF de 2 pages réunissant la fiche SBIN et la fiche de satisfaction"
            >
              👁️ Aperçu Dossier Complet (2 fiches)
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleDownloadBoth}
              disabled={downloadingBoth}
              title="Télécharger les 2 fiches réunies dans un seul fichier PDF officiel"
            >
              {downloadingBoth ? "Génération…" : "⬇ Télécharger Dossier Complet (PDF)"}
            </button>
          </div>
        </div>

        {statusMsg && (
          <div style={{ fontSize: 12.5, color: "#2563eb", fontWeight: 600, textAlign: "center", background: "#eff6ff", padding: "6px 12px", borderRadius: 8 }}>
            {statusMsg}
          </div>
        )}

        {/* Onglets de sélection de la fiche affichée */}
        <div style={{ display: "flex", gap: 8, borderTop: "1px solid #f1f5f9", paddingTop: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setActiveFicheTab("sbin")}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              background: activeFicheTab === "sbin" ? "#0f172a" : "#f1f5f9",
              color: activeFicheTab === "sbin" ? "#ffffff" : "#475569",
              transition: "all 0.2s ease",
            }}
          >
            📄 Fiche 1 : Mise en Service (SBIN)
          </button>

          <button
            type="button"
            onClick={() => setActiveFicheTab("satisfaction")}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              background: activeFicheTab === "satisfaction" ? "#0f172a" : "#f1f5f9",
              color: activeFicheTab === "satisfaction" ? "#ffffff" : "#475569",
              transition: "all 0.2s ease",
            }}
          >
            ✍️ Fiche 2 : Satisfaction Client (ENR-02)
          </button>

          <button
            type="button"
            onClick={() => setActiveFicheTab("both")}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              background: activeFicheTab === "both" ? "#0f172a" : "#f1f5f9",
              color: activeFicheTab === "both" ? "#ffffff" : "#475569",
              transition: "all 0.2s ease",
            }}
          >
            📑 Les 2 fiches réunies (Vue globale)
          </button>
        </div>
      </div>

      {/* Rendu dynamique de la fiche sélectionnée */}
      {activeFicheTab === "sbin" && (
        <FicheSbinDocument
          intervention={data}
          onChange={onChange}
          onSave={onSave}
          onClose={onClose}
          readOnly={readOnly}
        />
      )}

      {activeFicheTab === "satisfaction" && (
        <FicheSatisfactionDocument
          intervention={data}
          onChange={onChange}
          onSave={onSave}
          onClose={onClose}
          readOnly={readOnly}
        />
      )}

      {activeFicheTab === "both" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <div style={{ borderBottom: "3px dashed #cbd5e1", paddingBottom: 20 }}>
            <FicheSbinDocument
              intervention={data}
              onChange={onChange}
              onSave={onSave}
              readOnly={readOnly}
            />
          </div>

          <div style={{ paddingTop: 10 }}>
            <FicheSatisfactionDocument
              intervention={data}
              onChange={onChange}
              onSave={onSave}
              onClose={onClose}
              readOnly={readOnly}
            />
          </div>
        </div>
      )}
    </div>
  );
}
