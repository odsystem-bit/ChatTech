import { useState, useRef, useEffect } from "react";
import "./FicheSatisfactionDocument.css";
import { generateSatisfactionPdf, previewSatisfactionPdf } from "../lib/pdf";

/**
 * Composant de signature modale tactile haute définition
 */
function SignatureModal({ title, initialValue, onSave, onClose }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Support Retina / High-DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (initialValue && initialValue.startsWith("data:image")) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasDrawn(true);
      };
      img.src = initialValue;
    }
  }, [initialValue]);

  function getCoordinates(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function startDrawing(e) {
    e.preventDefault();
    isDrawing.current = true;
    lastPoint.current = getCoordinates(e);
  }

  function draw(e) {
    if (!isDrawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const currentPoint = getCoordinates(e);

    ctx.strokeStyle = "#0033cc"; // Encre bleue authentique
    ctx.lineWidth = 2.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();

    lastPoint.current = currentPoint;
    setHasDrawn(true);
  }

  function stopDrawing() {
    isDrawing.current = false;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  }

  function handleValidate() {
    const canvas = canvasRef.current;
    if (!canvas) {
      onClose();
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
    onClose();
  }

  return (
    <div className="sig-modal-backdrop" onClick={onClose}>
      <div className="sig-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="sig-modal-header">
          <h3>✍️ {title}</h3>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: "4px 10px", fontSize: 13 }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="sig-modal-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="sig-modal-canvas"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>
        <div className="sig-modal-footer">
          <button type="button" className="btn-secondary" onClick={handleClear}>
            🗑️ Effacer
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="button" className="btn-primary" onClick={handleValidate}>
              ✓ Valider la signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Reproduction exacte du document officiel ENR-02
 * "FICHE D'ÉVALUATION DE LA SATISFACTION DU CLIENT"
 */
export default function FicheSatisfactionDocument({
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

  // Mise à jour simplifiée d'une propriété de l'intervention
  function update(key, value) {
    if (readOnly || !onChange) return;
    onChange({
      ...data,
      [key]: value,
    });
  }

  // Formatage de la date d'intervention
  const dateObj = data.date ? new Date(data.date) : new Date();
  const jour = String(dateObj.getDate()).padStart(2, "0");
  const mois = String(dateObj.getMonth() + 1).padStart(2, "0");
  const annee = dateObj.getFullYear();
  const dateFormatted = `${jour} / ${mois} / ${annee}`;

  // Référence ticket / dossier
  const dossierRef =
    data.numero_dossier ||
    (data.id ? String(data.id).slice(0, 8).toUpperCase() : "FT-2026-001");

  // Type d'intervention (Installation par défaut)
  const typeIntv = (data.type_intervention_satisfaction || "Installation").toLowerCase();

  // Niveaux de satisfaction
  const satisfactionLevels = ["Très satisfait", "Satisfait", "Peu satisfait", "Insatisfait"];

  // 8 points de validation
  const validationPoints = [
    {
      id: "travaux_conformes",
      label: "Les travaux réalisés correspondent à votre demande",
      val: data.travaux_conformes ?? true,
    },
    {
      id: "emplacement_valide",
      label: "L'emplacement des équipements a été validé avec vous",
      val: data.emplacement_valide ?? true,
    },
    {
      id: "travail_propre",
      label: "Les techniciens ont travaillé proprement et en sécurité",
      val: data.travail_propre ?? true,
    },
    {
      id: "service_teste",
      label: "Le fonctionnement du service a été testé en votre présence",
      val: data.service_teste ?? true,
    },
    {
      id: "service_fonctionne",
      label: "Le service fonctionne correctement après intervention",
      val: data.service_fonctionne ?? true,
    },
    {
      id: "explications_donnees",
      label: "Les explications ou consignes nécessaires vous ont été données",
      val: data.explications_donnees ?? true,
    },
    {
      id: "recommanderait",
      label: "Recommanderiez-vous notre entreprise à un proche ?",
      val: data.recommanderait ?? true,
    },
    {
      id: "accepte_recontact",
      label: "Accepteriez-vous d'être recontacté pour le suivi qualité ?",
      val: data.accepte_recontact ?? true,
    },
  ];

  async function handleDownloadPdf() {
    setDownloading(true);
    setPdfMsg("Génération du PDF officiel…");
    try {
      await generateSatisfactionPdf(data);
      setPdfMsg("Téléchargement lancé !");
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
      await previewSatisfactionPdf(data);
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fiche-sat-wrapper">
      {/* Barre d'action supérieure */}
      <div className="fiche-sat-toolbar">
        <button
          type="button"
          className="btn-primary"
          onClick={() => window.print()}
          title="Imprimer directement ou exporter en PDF via le navigateur"
        >
          🖨️ Imprimer / PDF Navigateur
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={handlePreviewPdf}
          disabled={downloading}
          title="Ouvrir le PDF généré par le serveur avec le gabarit officiel"
        >
          👁️ Aperçu PDF Serveur
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={handleDownloadPdf}
          disabled={downloading}
          title="Télécharger le document officiel PDF signé"
        >
          {downloading ? "Génération…" : "📄 Télécharger PDF"}
        </button>

        {onSave && (
          <button
            type="button"
            className="btn-primary"
            style={{ background: "#16a34a", borderColor: "#16a34a" }}
            onClick={() => onSave(data)}
          >
            💾 Enregistrer
          </button>
        )}

        {onClose && (
          <button type="button" className="btn-secondary" onClick={onClose}>
            ✕ Fermer
          </button>
        )}

        {pdfMsg && (
          <span style={{ fontSize: 13, color: "#2563eb", fontWeight: 600, marginLeft: 8 }}>
            {pdfMsg}
          </span>
        )}
      </div>

      {/* FEUILLE OFFICIELLE (Reproduction fidèle ENR-02) */}
      <div className="fiche-sat-page">
        {/* En-tête */}
        <div className="fiche-sat-header">
          <div className="fiche-sat-meta">
            <div className="meta-enr">ENR-02</div>
            <div className="meta-ver">Version : 01</div>
            <div>Date : 12 Fév 2026</div>
          </div>
          <div className="fiche-sat-logo">
            <img
              src="/templates/logos/logo_premium_company_benin.jpeg"
              alt="Premium Company Bénin"
              onError={(e) => {
                // Fallback propre si chemin absolu
                e.target.style.display = "none";
              }}
            />
          </div>
        </div>

        {/* Titre & Référence */}
        <div className="fiche-sat-title-block">
          <h1 className="fiche-sat-title">FICHE D'ÉVALUATION DE LA SATISFACTION DU CLIENT</h1>
          <div className="fiche-sat-ref">
            Référence dossier / ticket :{" "}
            <span className="handwritten-blue">{dossierRef}</span>
          </div>
        </div>

        {/* 1. Informations client */}
        <div className="fiche-sat-section-title">1. Informations client</div>
        <table className="fiche-sat-table">
          <thead>
            <tr>
              <th style={{ width: "38%" }}>Informations</th>
              <th style={{ width: "62%" }}>Détails</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Nom du client / Société</td>
              <td>
                <span className="handwritten-value">
                  {data.nom_client || "—"}
                </span>
              </td>
            </tr>
            <tr>
              <td>Téléphone</td>
              <td>
                <span className="handwritten-value">
                  {data.telephone_ligne || data.mobile || "—"}
                </span>
              </td>
            </tr>
            <tr>
              <td>Adresse / Zone</td>
              <td>
                <span className="handwritten-value">
                  {data.adresse_zone || "—"}
                </span>
              </td>
            </tr>
            <tr>
              <td>Type d'intervention</td>
              <td>
                <div className="fiche-sat-type-options">
                  <label
                    className="fiche-sat-type-item"
                    onClick={() => update("type_intervention_satisfaction", "Installation")}
                  >
                    <span className={`fiche-sat-box ${typeIntv === "installation" ? "checked" : ""}`}>
                      {typeIntv === "installation" && <span className="fiche-sat-checkmark">✓</span>}
                    </span>
                    <span>Installation</span>
                  </label>

                  <label
                    className="fiche-sat-type-item"
                    onClick={() => update("type_intervention_satisfaction", "SAV")}
                  >
                    <span className={`fiche-sat-box ${typeIntv === "sav" ? "checked" : ""}`}>
                      {typeIntv === "sav" && <span className="fiche-sat-checkmark">✓</span>}
                    </span>
                    <span>SAV</span>
                  </label>

                  <label
                    className="fiche-sat-type-item"
                    onClick={() => update("type_intervention_satisfaction", "Maintenance")}
                  >
                    <span className={`fiche-sat-box ${typeIntv === "maintenance" ? "checked" : ""}`}>
                      {typeIntv === "maintenance" && <span className="fiche-sat-checkmark">✓</span>}
                    </span>
                    <span>Maintenance</span>
                  </label>
                </div>
              </td>
            </tr>
            <tr>
              <td>Date de l'intervention</td>
              <td>
                <span className="handwritten-value">{dateFormatted}</span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* 2. Validation de l'intervention */}
        <div className="fiche-sat-section-title">2. Validation de l'intervention</div>
        <div className="fiche-sat-section-subtitle">Merci de confirmer les points suivants :</div>
        <table className="fiche-sat-table">
          <thead>
            <tr>
              <th style={{ width: "78%" }}>Vérification</th>
              <th className="col-center" style={{ width: "11%" }}>Oui</th>
              <th className="col-center" style={{ width: "11%" }}>Non</th>
            </tr>
          </thead>
          <tbody>
            {validationPoints.map((pt) => (
              <tr key={pt.id}>
                <td>{pt.label}</td>
                <td
                  className="fiche-sat-check-cell"
                  onClick={() => update(pt.id, true)}
                  title="Cocher Oui"
                >
                  <span className={`fiche-sat-box ${pt.val === true ? "checked" : ""}`}>
                    {pt.val === true && <span className="fiche-sat-checkmark">✓</span>}
                  </span>
                </td>
                <td
                  className="fiche-sat-check-cell"
                  onClick={() => update(pt.id, false)}
                  title="Cocher Non"
                >
                  <span className={`fiche-sat-box ${pt.val === false ? "checked" : ""}`}>
                    {pt.val === false && <span className="fiche-sat-checkmark">✓</span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 3. Votre niveau de satisfaction */}
        <div className="fiche-sat-section-title">3. Votre niveau de satisfaction</div>
        <div className="fiche-sat-section-subtitle">Merci de cocher votre niveau de satisfaction :</div>
        <table className="fiche-sat-table">
          <thead>
            <tr>
              <th style={{ width: "40%" }}>Critères</th>
              {satisfactionLevels.map((lvl) => (
                <th key={lvl} className="col-center" style={{ width: "15%" }}>
                  {lvl}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { id: "qualite", label: "Qualité de la prestation", val: data.qualite || "Satisfait" },
              { id: "delais", label: "Respect des délais", val: data.delais || "Satisfait" },
              { id: "professionnalisme", label: "Professionnalisme des techniciens", val: data.professionnalisme || "Satisfait" },
            ].map((crit) => (
              <tr key={crit.id}>
                <td>{crit.label}</td>
                {satisfactionLevels.map((lvl) => {
                  const isChecked = crit.val === lvl;
                  return (
                    <td
                      key={lvl}
                      className="fiche-sat-check-cell"
                      onClick={() => update(crit.id, lvl)}
                      title={`Sélectionner ${lvl}`}
                    >
                      <span className={`fiche-sat-box ${isChecked ? "checked" : ""}`}>
                        {isChecked && <span className="fiche-sat-checkmark">✓</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* 4- Déclaration du client */}
        <div className="fiche-sat-declaration">
          <div className="fiche-sat-section-title">4- Déclaration du client</div>
          <div className="declaration-preamble">
            Je soussigné(e){" "}
            <span className="declaration-name-line">
              <span className="handwritten-blue" style={{ fontSize: 16 }}>
                {data.nom_client_declaration || data.nom_client || "—"}
              </span>
            </span>
            , certifie que :
          </div>
          <ol className="declaration-list">
            <li>
              Les techniciens de PREMIUM COMPANY BENIN ont réalisé l'intervention dans le respect des
              normes techniques, de sécurité et de professionnalisme.
            </li>
            <li>
              Aucun technicien ne m'a demandé, proposé ou accepté d'argent, de cadeau ou d'avantage
              personnel en dehors des frais officiels communiqués et payés pour mon raccordement au
              fournisseur d'Accès Internet.
            </li>
            <li>
              Je n'ai subi aucune pression, ni menace ni comportement irrespectueux de la part des
              techniciens.
            </li>
            <li>
              Je n'ai effectué aucun paiement supplémentaire non justifié ou en complicité avec un
              technicien de PREMIUM COMPANY BENIN.
            </li>
            <li>Le routeur a été installé à l'endroit que j'ai moi-même choisi.</li>
            <li>
              Le service a été réalisé de manière transparente, conforme au devis officiel, et le
              matériel installé est fonctionnel au moment de la validation.
            </li>
            <li>
              J'ai été informé(e) du canal officiel de contact de PREMIUM COMPANY BENIN en cas de
              réclamation, de doute sur une facturation ou de suggestion.
            </li>
          </ol>
        </div>

        {/* 5. Observation ou remarque du client */}
        <div className="fiche-sat-remarques">
          <div className="fiche-sat-section-title">5. Observation ou remarque du client</div>

          <div
            className="remarque-row"
            style={{ cursor: "pointer" }}
            onClick={() => {
              update("remarque_aucune", true);
              update("remarque_libre", "");
            }}
          >
            <span className={`fiche-sat-box ${data.remarque_aucune ? "checked" : ""}`}>
              {data.remarque_aucune && <span className="fiche-sat-checkmark">✓</span>}
            </span>
            <span>Aucune remarque</span>
          </div>

          <div className="remarque-row">
            <span
              className={`fiche-sat-box ${!data.remarque_aucune || data.remarque_libre ? "checked" : ""}`}
              style={{ cursor: "pointer" }}
              onClick={() => update("remarque_aucune", false)}
            >
              {(!data.remarque_aucune || data.remarque_libre) && (
                <span className="fiche-sat-checkmark">✓</span>
              )}
            </span>
            <span>Remarque / suggestion :</span>
            <div className="remarque-input-line">
              <input
                type="text"
                className="handwritten-blue"
                placeholder={data.remarque_aucune ? "" : "Écrire une observation ici…"}
                value={data.remarque_libre || ""}
                disabled={readOnly}
                onChange={(e) => {
                  update("remarque_aucune", false);
                  update("remarque_libre", e.target.value);
                }}
              />
            </div>
          </div>

          <div className="remarque-confirmation">
            Je confirme que les vérifications et tests de fonctionnement ont été réalisés en ma présence.
          </div>
        </div>

        {/* Tableau de signatures officielles */}
        <table className="fiche-sat-signatures-table">
          <thead>
            <tr>
              <th>Nom et Prénom du client</th>
              <th>Nom et prénom du Technicien</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {/* Colonne Signature Client */}
              <td>
                <div className="signature-box-content">
                  <div className="signature-name-row">
                    <span className="handwritten-blue">
                      {data.nom_client_declaration || data.nom_client || "—"}
                    </span>
                  </div>

                  <div
                    className="signature-visual-area"
                    onClick={() => !readOnly && setActiveSigner("client")}
                    title="Cliquez pour signer ou modifier la signature"
                  >
                    {data.signature_client ? (
                      <img
                        src={data.signature_client}
                        alt="Signature Client"
                        className="signature-img-rendered"
                      />
                    ) : (
                      <button
                        type="button"
                        className="signature-prompt-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!readOnly) setActiveSigner("client");
                        }}
                      >
                        ✍️ Signer ici (Client)
                      </button>
                    )}
                  </div>

                  {!readOnly && data.signature_client && (
                    <div className="signature-action-overlay">
                      <button
                        type="button"
                        className="signature-modify-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSigner("client");
                        }}
                      >
                        Modifier la signature
                      </button>
                    </div>
                  )}
                </div>
              </td>

              {/* Colonne Signature Technicien */}
              <td>
                <div className="signature-box-content">
                  <div className="signature-name-row">
                    <span className="handwritten-blue">
                      {data.nom_technicien || "—"}
                    </span>
                  </div>

                  <div
                    className="signature-visual-area"
                    onClick={() => !readOnly && setActiveSigner("technicien")}
                    title="Cliquez pour signer ou modifier la signature"
                  >
                    {data.signature_technicien ? (
                      <img
                        src={data.signature_technicien}
                        alt="Signature Technicien"
                        className="signature-img-rendered"
                      />
                    ) : (
                      <button
                        type="button"
                        className="signature-prompt-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!readOnly) setActiveSigner("technicien");
                        }}
                      >
                        ✍️ Signer ici (Technicien)
                      </button>
                    )}
                  </div>

                  {!readOnly && data.signature_technicien && (
                    <div className="signature-action-overlay">
                      <button
                        type="button"
                        className="signature-modify-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSigner("technicien");
                        }}
                      >
                        Modifier la signature
                      </button>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Modal interactif pour capturer la signature numérique tactile */}
      {activeSigner && (
        <SignatureModal
          title={
            activeSigner === "client"
              ? `Signature du Client (${data.nom_client || "Client"})`
              : `Signature du Technicien (${data.nom_technicien || "Technicien"})`
          }
          initialValue={
            activeSigner === "client" ? data.signature_client : data.signature_technicien
          }
          onSave={(dataUrl) => {
            if (activeSigner === "client") {
              update("signature_client", dataUrl);
            } else {
              update("signature_technicien", dataUrl);
            }
          }}
          onClose={() => setActiveSigner(null)}
        />
      )}
    </div>
  );
}
