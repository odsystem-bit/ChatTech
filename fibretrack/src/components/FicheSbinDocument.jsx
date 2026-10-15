import { useState } from "react";
import "./FicheSbinDocument.css";
import SignatureModal from "./SignatureModal";
import { generateSbinPdf, previewSbinPdf } from "../lib/pdf";

/**
 * Reproduction exacte du document officiel SBIN :
 * "FICHE DE MISE EN SERVICE ET INTERVENTIONS FTTH/CUIVRE"
 */
export default function FicheSbinDocument({
  intervention,
  onChange,
  onSave,
  onClose,
  readOnly = false,
}) {
  const [activeSigner, setActiveSigner] = useState(null); // 'client' | 'technicien' | null
  const [downloading, setDownloading] = useState(false);
  const [pdfMsg, setPdfMsg] = useState("");

  const data = intervention || {};

  function update(key, value) {
    if (readOnly || !onChange) return;
    onChange({
      ...data,
      [key]: value,
    });
  }

  // Formatage de date
  const dateObj = data.date ? new Date(data.date) : new Date();
  const jour = String(dateObj.getDate()).padStart(2, "0");
  const mois = String(dateObj.getMonth() + 1).padStart(2, "0");
  const annee = dateObj.getFullYear();
  const dateFormatted = `${jour}/${mois}/${annee}`;

  // Offre souscrite
  const offreActuelle = data.offre_souscrite || "Fibre Pro";
  const remiseOk = data.remise_equipement_ok ?? true;

  // Type de service (FTTH par défaut)
  const serviceType = (data.service_type || data.etat || "FTTH").toUpperCase();
  const isFtth = serviceType.includes("FTTH") || serviceType.includes("PON") || !serviceType.includes("CUIVRE");
  const isCuivre = serviceType.includes("CUIVRE");

  async function handleDownloadPdf() {
    setDownloading(true);
    setPdfMsg("Génération du PDF Fiche SBIN…");
    try {
      await generateSbinPdf(data);
      setPdfMsg("Téléchargement de la fiche SBIN lancé !");
    } catch (err) {
      setPdfMsg(`Erreur : ${err.message}`);
    } finally {
      setDownloading(false);
      setTimeout(() => setPdfMsg(""), 3500);
    }
  }

  async function handlePreviewPdf() {
    setDownloading(true);
    try {
      await previewSbinPdf(data);
    } catch (err) {
      alert(`Erreur d'ouverture : ${err.message}`);
    } finally {
      setDownloading(false);
    }
  }

  function handleSignatureSave(dataUrl) {
    if (activeSigner === "client") {
      update("signature_client", dataUrl);
    } else if (activeSigner === "technicien") {
      update("signature_technicien", dataUrl);
    }
    setActiveSigner(null);
  }

  return (
    <div className="fiche-sbin-wrapper">
      {/* Barre d'outils dédiée à la fiche SBIN */}
      <div className="fiche-sbin-toolbar">
        <button
          type="button"
          className="btn-primary"
          onClick={handlePreviewPdf}
          disabled={downloading}
          title="Ouvre le PDF officiel exact de la Fiche SBIN dans un nouvel onglet"
        >
          👁️ Aperçu PDF Fiche SBIN
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={handleDownloadPdf}
          disabled={downloading}
          title="Télécharger directement la Fiche SBIN au format PDF"
        >
          ⬇ Télécharger PDF Fiche SBIN
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => window.print()}
          title="Imprimer directement ce document"
        >
          🖨️ Imprimer
        </button>

        {onClose && (
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            style={{ marginLeft: "auto" }}
          >
            ✕ Fermer
          </button>
        )}

        {pdfMsg && (
          <span style={{ width: "100%", textAlign: "center", fontSize: 12, color: "#2563eb", fontWeight: 600, marginTop: 4 }}>
            {pdfMsg}
          </span>
        )}
      </div>

      {/* Conteneur Feuille A4 SBIN */}
      <div className="fiche-sbin-page">
        {/* En-tête SBIN */}
        <div className="fiche-sbin-header">
          <div className="fiche-sbin-logo">
            <img
              src="/templates/logos/logo_sbin.jpg"
              alt="Logo SBIN"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>
          <div className="fiche-sbin-title-group">
            <h1 className="fiche-sbin-main-title">
              FICHE DE MISE EN SERVICE ET INTERVENTIONS FTTH/CUIVRE
            </h1>
            <div className="fiche-sbin-banner-black">
              Production et Interventions clients
            </div>
          </div>
        </div>

        {/* Tableau En-tête Client & Service */}
        <table className="fiche-sbin-table">
          <tbody>
            <tr>
              <td style={{ width: "20%", fontWeight: "bold" }}>Date :</td>
              <td style={{ width: "30%" }}>
                <span className="handwritten-blue">{dateFormatted}</span>
              </td>
              <td style={{ width: "20%", fontWeight: "bold" }}>Nom du Client :</td>
              <td style={{ width: "30%" }}>
                {readOnly ? (
                  <span className="handwritten-blue">{data.nom_client || "—"}</span>
                ) : (
                  <input
                    type="text"
                    className="handwritten-blue-input"
                    value={data.nom_client || ""}
                    onChange={(e) => update("nom_client", e.target.value)}
                    placeholder="Nom du client"
                  />
                )}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>Service :</td>
              <td>
                <span
                  className="handwritten-check-box"
                  onClick={() => !readOnly && update("service_type", isFtth ? "Cuivre" : "FTTH")}
                >
                  {isFtth && <span className="handwritten-check-mark">✓</span>}
                </span>
                <span style={{ fontWeight: "bold", marginRight: 16 }}>FTTH</span>

                <span
                  className="handwritten-check-box"
                  onClick={() => !readOnly && update("service_type", isCuivre ? "FTTH" : "Cuivre")}
                >
                  {isCuivre && <span className="handwritten-check-mark">✓</span>}
                </span>
                <span style={{ fontWeight: "bold" }}>Cuivre</span>
              </td>
              <td style={{ fontWeight: "bold" }}>Ligne :</td>
              <td>
                {readOnly ? (
                  <span className="handwritten-blue">{data.telephone_ligne || "—"}</span>
                ) : (
                  <input
                    type="text"
                    className="handwritten-blue-input"
                    value={data.telephone_ligne || ""}
                    onChange={(e) => update("telephone_ligne", e.target.value)}
                    placeholder="Numéro de ligne"
                  />
                )}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>Mobile :</td>
              <td>
                {readOnly ? (
                  <span className="handwritten-blue">{data.mobile || data.telephone_ligne || "—"}</span>
                ) : (
                  <input
                    type="text"
                    className="handwritten-blue-input"
                    value={data.mobile || data.telephone_ligne || ""}
                    onChange={(e) => update("mobile", e.target.value)}
                    placeholder="Numéro mobile"
                  />
                )}
              </td>
              <td style={{ fontWeight: "bold" }}>Mail :</td>
              <td>
                {readOnly ? (
                  <span className="handwritten-blue">{data.mail || "—"}</span>
                ) : (
                  <input
                    type="email"
                    className="handwritten-blue-input"
                    value={data.mail || ""}
                    onChange={(e) => update("mail", e.target.value)}
                    placeholder="client@domaine.com"
                  />
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 1. INSTALLATION */}
        <table className="fiche-sbin-table">
          <thead>
            <tr>
              <th colSpan="2" className="fiche-sbin-section-header">
                1. INSTALLATION
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ width: "35%", fontWeight: "bold" }}>ONT (SN) :</td>
              <td>
                {readOnly ? (
                  <span className="handwritten-blue">{data.ont_sn || data.sn || "—"}</span>
                ) : (
                  <input
                    type="text"
                    className="handwritten-blue-input"
                    value={data.ont_sn || data.sn || ""}
                    onChange={(e) => {
                      update("ont_sn", e.target.value);
                      update("sn", e.target.value);
                    }}
                    placeholder="Ex: ALCLB1234567"
                  />
                )}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>PTO (Qté) :</td>
              <td>
                {readOnly ? (
                  <span className="handwritten-blue">{data.pto_qte ?? 1}</span>
                ) : (
                  <input
                    type="number"
                    className="handwritten-blue-input"
                    style={{ width: 80 }}
                    value={data.pto_qte ?? 1}
                    onChange={(e) => update("pto_qte", Number(e.target.value))}
                  />
                )}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>Répéteur Wifi (Qté) :</td>
              <td>
                {readOnly ? (
                  <span className="handwritten-blue">{data.repeteur_wifi_qte ?? 0}</span>
                ) : (
                  <input
                    type="number"
                    className="handwritten-blue-input"
                    style={{ width: 80 }}
                    value={data.repeteur_wifi_qte ?? 0}
                    onChange={(e) => update("repeteur_wifi_qte", Number(e.target.value))}
                  />
                )}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>Emplacement ONT :</td>
              <td>
                {readOnly ? (
                  <span className="handwritten-blue">{data.emplacement_ont || "Salon"}</span>
                ) : (
                  <input
                    type="text"
                    className="handwritten-blue-input"
                    value={data.emplacement_ont || "Salon"}
                    onChange={(e) => update("emplacement_ont", e.target.value)}
                    placeholder="Ex: Salon / Bureau"
                  />
                )}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>Appréciation satisfaction client :</td>
              <td>
                {readOnly ? (
                  <span className="handwritten-blue">{data.appreciation_satisfaction_libre || "Très satisfait des travaux"}</span>
                ) : (
                  <input
                    type="text"
                    className="handwritten-blue-input"
                    value={data.appreciation_satisfaction_libre || "Très satisfait des travaux"}
                    onChange={(e) => update("appreciation_satisfaction_libre", e.target.value)}
                    placeholder="Appréciation globale du client"
                  />
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 2. VÉRIFICATION SUR LES OFFRES FTTH B2B2G */}
        <table className="fiche-sbin-table">
          <thead>
            <tr>
              <th colSpan="3" className="fiche-sbin-section-header">
                2. VÉRIFICATION SUR LES OFFRES FTTH B2B2G
              </th>
            </tr>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ width: "40%" }}>Offre</th>
              <th style={{ width: "30%" }}>Débit</th>
              <th style={{ width: "30%", textAlign: "center" }}>Répéteur remis ?</th>
            </tr>
          </thead>
          <tbody>
            {[
              { nom: "Fibre Pro", debit: "200 M / 20 M", hasRep: false },
              { nom: "Fibre Pro Max", debit: "300 M / 30 M", hasRep: true },
              { nom: "Fibre Pro Mega", debit: "400 M / 40 M", hasRep: true },
              { nom: "Fibre Office Max", debit: "600 M / 60 M", hasRep: true },
              { nom: "Fibre Office Mega", debit: "800 M / 80 M", hasRep: true },
            ].map((off) => {
              const isSelected =
                (offreActuelle || "").toLowerCase().includes(off.nom.toLowerCase());
              return (
                <tr key={off.nom} style={{ background: isSelected ? "rgba(37,99,235,0.04)" : "transparent" }}>
                  <td>
                    <span
                      className="handwritten-check-box"
                      onClick={() => !readOnly && update("offre_souscrite", off.nom)}
                    >
                      {isSelected && <span className="handwritten-check-mark">✓</span>}
                    </span>
                    <strong style={{ marginLeft: 4 }}>{off.nom}</strong>
                  </td>
                  <td>{off.debit}</td>
                  <td style={{ textAlign: "center" }}>
                    {off.hasRep ? (
                      <div>
                        <span
                          className="handwritten-check-box"
                          onClick={() => !readOnly && update("remise_equipement_ok", true)}
                        >
                          {isSelected && remiseOk && <span className="handwritten-check-mark">✓</span>}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: "bold", marginRight: 8 }}>OUI</span>

                        <span
                          className="handwritten-check-box"
                          onClick={() => !readOnly && update("remise_equipement_ok", false)}
                        >
                          {isSelected && !remiseOk && <span className="handwritten-check-mark">✗</span>}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: "bold" }}>NON</span>
                      </div>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: 10 }}>Non applicable</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 3. INTERVENTIONS (CONSTATS ET TRAVAUX EXÉCUTÉS) */}
        <table className="fiche-sbin-table" style={{ marginBottom: 0 }}>
          <thead>
            <tr>
              <th colSpan="3" className="fiche-sbin-section-header">
                3. INTERVENTIONS (CONSTATS ET TRAVAUX EXÉCUTÉS)
              </th>
            </tr>
          </thead>
        </table>

        <div className="sbin-interv-grid" style={{ marginTop: 6 }}>
          <div className="sbin-interv-box">
            <div className="sbin-interv-label">Constat / Diagnostic :</div>
            {readOnly ? (
              <span className="handwritten-blue" style={{ fontSize: 14 }}>
                {data.constat_diagnostic || "Raccordement FTTH conforme"}
              </span>
            ) : (
              <textarea
                className="sbin-interv-textarea"
                rows="3"
                value={data.constat_diagnostic ?? "Raccordement FTTH conforme"}
                onChange={(e) => update("constat_diagnostic", e.target.value)}
              />
            )}
          </div>

          <div className="sbin-interv-box">
            <div className="sbin-interv-label">Travaux exécutés :</div>
            {readOnly ? (
              <span className="handwritten-blue" style={{ fontSize: 14 }}>
                {data.travaux_executes || "Tirage câble, pose PTO et ONT"}
              </span>
            ) : (
              <textarea
                className="sbin-interv-textarea"
                rows="3"
                value={data.travaux_executes ?? "Tirage câble, pose PTO et ONT"}
                onChange={(e) => update("travaux_executes", e.target.value)}
              />
            )}
          </div>

          <div className="sbin-interv-box">
            <div className="sbin-interv-label">Observations :</div>
            {readOnly ? (
              <span className="handwritten-blue" style={{ fontSize: 14 }}>
                {data.observations_intervention || "Signal optique conforme, débit validé"}
              </span>
            ) : (
              <textarea
                className="sbin-interv-textarea"
                rows="3"
                value={data.observations_intervention ?? "Signal optique conforme, débit validé"}
                onChange={(e) => update("observations_intervention", e.target.value)}
              />
            )}
          </div>
        </div>

        {/* Détails complémentaires intervention */}
        <table className="fiche-sbin-table">
          <tbody>
            <tr>
              <td style={{ width: "50%", fontWeight: "bold" }}>Matériels récupérés :</td>
              <td>
                {readOnly ? (
                  <span className="handwritten-blue">{data.materiel_recupere || "Néant"}</span>
                ) : (
                  <input
                    type="text"
                    className="handwritten-blue-input"
                    value={data.materiel_recupere || "Néant"}
                    onChange={(e) => update("materiel_recupere", e.target.value)}
                  />
                )}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>Nombre de RDV manqués :</td>
              <td>
                {readOnly ? (
                  <span className="handwritten-blue">{data.rdv_manques ?? "0"}</span>
                ) : (
                  <input
                    type="number"
                    className="handwritten-blue-input"
                    style={{ width: 80 }}
                    value={data.rdv_manques ?? "0"}
                    onChange={(e) => update("rdv_manques", e.target.value)}
                  />
                )}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>Note qualité équipe prestataire (/10) :</td>
              <td>
                {readOnly ? (
                  <span className="handwritten-blue">{data.note_qualite_equipe ?? "10"} / 10</span>
                ) : (
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="handwritten-blue-input"
                    style={{ width: 80 }}
                    value={data.note_qualite_equipe ?? "10"}
                    onChange={(e) => update("note_qualite_equipe", e.target.value)}
                  />
                )}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>Autre élément :</td>
              <td>
                {readOnly ? (
                  <span className="handwritten-blue">{data.autre_element || "RAS"}</span>
                ) : (
                  <input
                    type="text"
                    className="handwritten-blue-input"
                    value={data.autre_element || "RAS"}
                    onChange={(e) => update("autre_element", e.target.value)}
                  />
                )}
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: "bold" }}>Note d'appréciation globale du client (/10) :</td>
              <td>
                {readOnly ? (
                  <span className="handwritten-blue">{data.note_appreciation_client ?? "10"} / 10</span>
                ) : (
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="handwritten-blue-input"
                    style={{ width: 80 }}
                    value={data.note_appreciation_client ?? "10"}
                    onChange={(e) => update("note_appreciation_client", e.target.value)}
                  />
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Signatures officielles SBIN */}
        <div className="fiche-sbin-signatures">
          {/* Signature Client */}
          <div className="sbin-sig-card">
            <div className="sbin-sig-title">Signature du Client</div>
            <div className="sbin-sig-row">
              <strong>Nom & Prénom :</strong>
              <span className="handwritten-blue">{data.nom_client || "—"}</span>
            </div>
            <div className="sbin-sig-row">
              <strong>Date :</strong>
              <span className="handwritten-blue">{dateFormatted}</span>
            </div>

            <div
              className="sbin-sig-box"
              onClick={() => !readOnly && setActiveSigner("client")}
              title="Cliquer pour signer numériquement"
            >
              {data.signature_client ? (
                <>
                  <img
                    src={data.signature_client}
                    alt="Signature Client"
                    className="sbin-sig-img"
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      className="sbin-sig-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        update("signature_client", null);
                      }}
                    >
                      Effacer
                    </button>
                  )}
                </>
              ) : (
                <div className="sbin-sig-placeholder">
                  <span>✍️ Cliquez ici pour signer</span>
                  <small style={{ color: "#94a3b8" }}>Signature tactile Client</small>
                </div>
              )}
            </div>
          </div>

          {/* Signature Prestataire */}
          <div className="sbin-sig-card">
            <div className="sbin-sig-title">Signature Prestataire / Technicien</div>
            <div className="sbin-sig-row">
              <strong>Nom & Prénom :</strong>
              <span className="handwritten-blue">{data.nom_technicien || "Technicien"}</span>
            </div>
            <div className="sbin-sig-row">
              <strong>Date :</strong>
              <span className="handwritten-blue">{dateFormatted}</span>
            </div>

            <div
              className="sbin-sig-box"
              onClick={() => !readOnly && setActiveSigner("technicien")}
              title="Cliquer pour signer numériquement"
            >
              {data.signature_technicien ? (
                <>
                  <img
                    src={data.signature_technicien}
                    alt="Signature Technicien"
                    className="sbin-sig-img"
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      className="sbin-sig-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        update("signature_technicien", null);
                      }}
                    >
                      Effacer
                    </button>
                  )}
                </>
              ) : (
                <div className="sbin-sig-placeholder">
                  <span>✍️ Cliquez ici pour signer</span>
                  <small style={{ color: "#94a3b8" }}>Signature tactile Prestataire</small>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Signature Tactile */}
      {activeSigner && (
        <SignatureModal
          title={
            activeSigner === "client"
              ? "Signature du Client (Fiche SBIN)"
              : "Signature du Prestataire / Technicien (Fiche SBIN)"
          }
          initialValue={
            activeSigner === "client"
              ? data.signature_client
              : data.signature_technicien
          }
          onSave={handleSignatureSave}
          onClose={() => setActiveSigner(null)}
        />
      )}
    </div>
  );
}
