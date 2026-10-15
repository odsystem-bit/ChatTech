import { useState } from "react";
import "./FicheSbinDocument.css";
import SignatureModal from "./SignatureModal";
import { generateSbinPdf, previewSbinPdf } from "../lib/pdf";

/**
 * Reproduction exacte du document Word officiel SBIN :
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

  // Formatage de la date (JJ/MM/AAAA)
  const dateObj = data.date ? new Date(data.date) : new Date();
  const jour = String(dateObj.getDate()).padStart(2, "0");
  const mois = String(dateObj.getMonth() + 1).padStart(2, "0");
  const annee = dateObj.getFullYear();
  const dateFormatted = `${jour}/${mois}/${annee}`;

  // Type de service (FTTH par défaut)
  const serviceType = (data.service_type || data.etat || "FTTH").toUpperCase();
  const isFtth = serviceType.includes("FTTH") || serviceType.includes("PON") || !serviceType.includes("CUIVRE");
  const isCuivre = serviceType.includes("CUIVRE");

  // Offre souscrite
  const offreActuelle = data.offre_souscrite || "Fibre Pro";
  const remiseOk = data.remise_equipement_ok ?? true;

  async function handleDownloadPdf() {
    setDownloading(true);
    setPdfMsg("Génération du PDF officiel SBIN…");
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

      {/* FEUILLE OFFICIELLE SBIN (Reproduction conforme du gabarit Word) */}
      <div className="fiche-sbin-page">
        {/* LIGNE 1 : LOGO SBIN À GAUCHE & BANNIÈRE POLYGONALE À DROITE */}
        <div className="fiche-sbin-top-header">
          <div className="fiche-sbin-logo-area">
            <img
              src="/templates/logos/logo_sbin.jpg"
              alt="Logo SBIN"
              className="fiche-sbin-logo-img"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>

          <div className="fiche-sbin-black-banner">
            <span>Production et Interventions clients</span>
          </div>
        </div>

        {/* LIGNE 2 : TITRE OFFICIEL CENTRÉ */}
        <div className="fiche-sbin-doc-title">
          FICHE DE MISE EN SERVICE ET INTERVENTIONS FTTH/CUIVRE
        </div>

        {/* TABLEAU 1 : EN-TÊTE IDENTIFICATION & SERVICE */}
        <table className="sbin-word-table">
          <tbody>
            <tr>
              <td style={{ width: "50%" }}>
                <div className="dotted-field-wrap">
                  <span className="dotted-field-label">Date d'intervention (NI/INT) :</span>
                  <div className="dotted-line-fill">
                    <span className="sbin-hand">{dateFormatted}</span>
                  </div>
                </div>
              </td>
              <td style={{ width: "50%" }}>
                <div className="dotted-field-wrap">
                  <span className="dotted-field-label">Client :</span>
                  <div className="dotted-line-fill">
                    {readOnly ? (
                      <span className="sbin-hand">{data.nom_client || ""}</span>
                    ) : (
                      <input
                        type="text"
                        className="sbin-hand-input"
                        value={data.nom_client || ""}
                        onChange={(e) => update("nom_client", e.target.value)}
                        placeholder="Nom du client / Société"
                      />
                    )}
                  </div>
                </div>
              </td>
            </tr>

            <tr>
              <td>
                <span style={{ fontWeight: 600, marginRight: 6 }}>Service :</span>
                <span style={{ marginRight: 6 }}>FTTH</span>
                <span
                  className="sbin-checkbox"
                  onClick={() => !readOnly && update("service_type", "FTTH")}
                >
                  {isFtth && <span className="sbin-check-val">✓</span>}
                </span>

                <span style={{ margin: "0 6px 0 16px" }}>CUIVRE</span>
                <span
                  className="sbin-checkbox"
                  onClick={() => !readOnly && update("service_type", "Cuivre")}
                >
                  {isCuivre && <span className="sbin-check-val">✓</span>}
                </span>
              </td>
              <td>
                <div className="dotted-field-wrap">
                  <span className="dotted-field-label">Ligne :</span>
                  <div className="dotted-line-fill">
                    {readOnly ? (
                      <span className="sbin-hand">{data.telephone_ligne || ""}</span>
                    ) : (
                      <input
                        type="text"
                        className="sbin-hand-input"
                        value={data.telephone_ligne || ""}
                        onChange={(e) => update("telephone_ligne", e.target.value)}
                        placeholder="N° de ligne"
                      />
                    )}
                  </div>
                </div>
              </td>
            </tr>

            <tr>
              <td>
                <div className="dotted-field-wrap">
                  <span className="dotted-field-label">Date de déclaration :</span>
                  <div className="dotted-line-fill">
                    <span className="sbin-hand">{dateFormatted}</span>
                  </div>
                </div>
              </td>
              <td>
                <div className="dotted-field-wrap">
                  <span className="dotted-field-label">Mobil :</span>
                  <div className="dotted-line-fill">
                    {readOnly ? (
                      <span className="sbin-hand">{data.mobile || data.telephone_ligne || ""}</span>
                    ) : (
                      <input
                        type="text"
                        className="sbin-hand-input"
                        value={data.mobile || data.telephone_ligne || ""}
                        onChange={(e) => update("mobile", e.target.value)}
                        placeholder="N° mobile"
                      />
                    )}
                  </div>
                </div>
              </td>
            </tr>

            <tr>
              <td>
                <div className="dotted-field-wrap">
                  <span className="dotted-field-label">Date de mise en service :</span>
                  <div className="dotted-line-fill">
                    <span className="sbin-hand">{dateFormatted}</span>
                  </div>
                </div>
              </td>
              <td>
                <div className="dotted-field-wrap">
                  <span className="dotted-field-label">Mail :</span>
                  <div className="dotted-line-fill">
                    {readOnly ? (
                      <span className="sbin-hand">{data.mail || ""}</span>
                    ) : (
                      <input
                        type="email"
                        className="sbin-hand-input"
                        value={data.mail || ""}
                        onChange={(e) => update("mail", e.target.value)}
                        placeholder="client@domaine.com"
                      />
                    )}
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* TABLEAU 2 : 1 – INSTALLATION */}
        <table className="sbin-word-table">
          <thead>
            <tr>
              <th style={{ width: "36%" }}>DÉSIGNATION / CONSTAT</th>
              <th style={{ width: "24%" }}>QUANTITÉ</th>
              <th style={{ width: "40%" }}>OBSERVATION</th>
            </tr>
            <tr>
              <td colSpan="3" className="sbin-subheading-row">
                1 – INSTALLATION
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>ONT / FT (Numéro de série)</td>
              <td>
                {readOnly ? (
                  <span className="sbin-hand">{data.ont_sn || data.sn || ""}</span>
                ) : (
                  <input
                    type="text"
                    className="sbin-hand-input"
                    value={data.ont_sn || data.sn || ""}
                    onChange={(e) => {
                      update("ont_sn", e.target.value);
                      update("sn", e.target.value);
                    }}
                    placeholder="SN ONT"
                  />
                )}
              </td>
              <td>
                {readOnly ? (
                  <span className="sbin-hand">{data.observation_ont || "Conforme"}</span>
                ) : (
                  <input
                    type="text"
                    className="sbin-hand-input"
                    value={data.observation_ont ?? "Conforme"}
                    onChange={(e) => update("observation_ont", e.target.value)}
                  />
                )}
              </td>
            </tr>

            <tr>
              <td>PTO</td>
              <td>
                {readOnly ? (
                  <span className="sbin-hand">{data.pto_qte ?? 1}</span>
                ) : (
                  <input
                    type="number"
                    className="sbin-hand-input"
                    value={data.pto_qte ?? 1}
                    onChange={(e) => update("pto_qte", Number(e.target.value))}
                  />
                )}
              </td>
              <td>
                {readOnly ? (
                  <span className="sbin-hand">{data.observation_pto || "Pose murale"}</span>
                ) : (
                  <input
                    type="text"
                    className="sbin-hand-input"
                    value={data.observation_pto ?? "Pose murale"}
                    onChange={(e) => update("observation_pto", e.target.value)}
                  />
                )}
              </td>
            </tr>

            <tr>
              <td>Répéteur WIFI</td>
              <td>
                {readOnly ? (
                  <span className="sbin-hand">{data.repeteur_wifi_qte ?? 0}</span>
                ) : (
                  <input
                    type="number"
                    className="sbin-hand-input"
                    value={data.repeteur_wifi_qte ?? 0}
                    onChange={(e) => update("repeteur_wifi_qte", Number(e.target.value))}
                  />
                )}
              </td>
              <td>
                {readOnly ? (
                  <span className="sbin-hand">{data.observation_repeteur || (Number(data.repeteur_wifi_qte) > 0 ? "Configuré" : "Néant")}</span>
                ) : (
                  <input
                    type="text"
                    className="sbin-hand-input"
                    value={data.observation_repeteur ?? (Number(data.repeteur_wifi_qte) > 0 ? "Configuré" : "Néant")}
                    onChange={(e) => update("observation_repeteur", e.target.value)}
                  />
                )}
              </td>
            </tr>

            <tr>
              <td style={{ fontSize: "9px", lineHeight: "1.15", padding: "4px 5px" }}>
                Emplacement de l'ONT (Dans l'observation, le client doit confirmer qu'il a autorisé lui-même l'emplacement du routeur. Cette déclaration se termine par le nom et la signature du client)
              </td>
              <td>
                {readOnly ? (
                  <span className="sbin-hand">{data.emplacement_ont || "Salon"}</span>
                ) : (
                  <input
                    type="text"
                    className="sbin-hand-input"
                    value={data.emplacement_ont || "Salon"}
                    onChange={(e) => update("emplacement_ont", e.target.value)}
                    placeholder="Ex: Salon"
                  />
                )}
              </td>
              <td>
                {readOnly ? (
                  <span className="sbin-hand" style={{ fontSize: "13px" }}>
                    {data.emplacement_ont_declaration || `J'autorise l'emplacement du routeur dans le ${data.emplacement_ont || "salon"}. ${data.nom_client || ""}`}
                  </span>
                ) : (
                  <textarea
                    className="sbin-hand-textarea"
                    rows="2"
                    value={
                      data.emplacement_ont_declaration ??
                      `J'autorise l'emplacement du routeur dans le ${data.emplacement_ont || "salon"}. ${data.nom_client || ""}`
                    }
                    onChange={(e) => update("emplacement_ont_declaration", e.target.value)}
                  />
                )}
              </td>
            </tr>

            <tr>
              <td colSpan="3" className="sbin-subheading-row">
                Satisfaction du client
              </td>
            </tr>
            <tr>
              <td colSpan="3" style={{ minHeight: "30px", padding: "4px 6px" }}>
                {readOnly ? (
                  <span className="sbin-hand">
                    {data.appreciation_satisfaction_libre || "Très satisfait de l'installation, des délais et du débit."}
                  </span>
                ) : (
                  <input
                    type="text"
                    className="sbin-hand-input"
                    value={data.appreciation_satisfaction_libre || "Très satisfait de l'installation, des délais et du débit."}
                    onChange={(e) => update("appreciation_satisfaction_libre", e.target.value)}
                    placeholder="Commentaire de satisfaction du client"
                  />
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* TITRE SECTION 2 */}
        <div className="fiche-sbin-section-heading">
          2- VÉRIFICATION SUR LES OFFRES FTTH B2B2G
        </div>

        {/* TABLEAU 3 : VÉRIFICATION OFFRES B2B2G */}
        <table className="sbin-word-table">
          <thead>
            <tr>
              <th style={{ width: "32%" }}>Offre souscrite par le client</th>
              <th style={{ width: "44%" }}>Vérification de la remise d'équipement</th>
              <th style={{ width: "24%" }}>Résultat</th>
            </tr>
          </thead>
          <tbody>
            {[
              {
                id: "Fibre Pro",
                label: "Fibre Pro",
                verif: "NA",
                type: "na",
              },
              {
                id: "Fibre Pro Max",
                label: "Fibre Pro Max",
                verif: "Vérifier si le Terminal fixe est bien remis au client",
                type: "remise",
              },
              {
                id: "Fibre Pro Mega",
                label: "Fibre Pro Mega",
                verif: "Vérifier si le Terminal fixe est bien remis au client",
                type: "remise",
              },
              {
                id: "Fibre Office Max",
                label: "Fibre Office Max",
                verif: "Vérifier si le Terminal fixe et Pocket 4G sont bien remis au client",
                type: "remise",
              },
              {
                id: "Fibre Office Mega",
                label: "Fibre Office Mega",
                verif: "Vérifier si le Terminal fixe et Pocket 4G sont bien remis au client",
                type: "remise",
              },
            ].map((row) => {
              const isSelected = (offreActuelle || "").toLowerCase().includes(row.id.toLowerCase());
              return (
                <tr key={row.id}>
                  <td>
                    <span style={{ marginRight: 6 }}>{row.label}</span>
                    <span
                      className="sbin-checkbox"
                      onClick={() => !readOnly && update("offre_souscrite", row.id)}
                    >
                      {isSelected && <span className="sbin-check-val">✓</span>}
                    </span>
                  </td>
                  <td style={{ textAlign: row.type === "na" ? "center" : "left", fontSize: "9.5px" }}>
                    {row.verif}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {row.type === "na" ? (
                      <span>NA</span>
                    ) : (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <span
                          className="sbin-checkbox"
                          onClick={() => !readOnly && update("remise_equipement_ok", true)}
                        >
                          {isSelected && remiseOk && <span className="sbin-check-val">✓</span>}
                        </span>
                        <span style={{ fontSize: "9.5px", marginRight: 8 }}>Oui</span>

                        <span
                          className="sbin-checkbox"
                          onClick={() => !readOnly && update("remise_equipement_ok", false)}
                        >
                          {isSelected && !remiseOk && <span className="sbin-check-val">✗</span>}
                        </span>
                        <span style={{ fontSize: "9.5px" }}>Non</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* TITRE SECTION 3 */}
        <div className="fiche-sbin-section-heading">
          3 - INTERVENTIONS (CONSTATS ET TRAVAUX EXÉCUTÉS)
        </div>

        {/* TABLEAU 4 : INTERVENTIONS, CONSTATS, TRAVAUX */}
        <table className="sbin-word-table">
          <thead>
            <tr>
              <th style={{ width: "33.3%" }}>CONSTATS (DIAGNOSTIC)</th>
              <th style={{ width: "33.3%" }}>TRAVAUX EXÉCUTÉS</th>
              <th style={{ width: "33.4%" }}>OBSERVATIONS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ height: "65px", verticalAlign: "top" }}>
                {readOnly ? (
                  <span className="sbin-hand" style={{ fontSize: "13px" }}>
                    {data.constat_diagnostic || "Raccordement FTTH conforme"}
                  </span>
                ) : (
                  <textarea
                    className="sbin-hand-textarea"
                    rows="4"
                    value={data.constat_diagnostic ?? "Raccordement FTTH conforme"}
                    onChange={(e) => update("constat_diagnostic", e.target.value)}
                  />
                )}
              </td>
              <td style={{ height: "65px", verticalAlign: "top" }}>
                {readOnly ? (
                  <span className="sbin-hand" style={{ fontSize: "13px" }}>
                    {data.travaux_executes || "Tirage câble optique, pose PTO et raccordement ONT"}
                  </span>
                ) : (
                  <textarea
                    className="sbin-hand-textarea"
                    rows="4"
                    value={data.travaux_executes ?? "Tirage câble optique, pose PTO et raccordement ONT"}
                    onChange={(e) => update("travaux_executes", e.target.value)}
                  />
                )}
              </td>
              <td style={{ height: "65px", verticalAlign: "top" }}>
                {readOnly ? (
                  <span className="sbin-hand" style={{ fontSize: "13px" }}>
                    {data.observations_intervention || "Signal optique -19.5 dBm, débit conforme"}
                  </span>
                ) : (
                  <textarea
                    className="sbin-hand-textarea"
                    rows="4"
                    value={data.observations_intervention ?? "Signal optique -19.5 dBm, débit conforme"}
                    onChange={(e) => update("observations_intervention", e.target.value)}
                  />
                )}
              </td>
            </tr>

            <tr>
              <td>Matériels récupérés</td>
              <td colSpan="2">
                {readOnly ? (
                  <span className="sbin-hand">{data.materiel_recupere || "Néant"}</span>
                ) : (
                  <input
                    type="text"
                    className="sbin-hand-input"
                    value={data.materiel_recupere || "Néant"}
                    onChange={(e) => update("materiel_recupere", e.target.value)}
                  />
                )}
              </td>
            </tr>

            <tr>
              <td>(à déposer à la SBIN ici contre décharge)</td>
              <td colSpan="2">
                <span style={{ color: "#64748b", fontSize: "9px" }}>—</span>
              </td>
            </tr>

            <tr>
              <td>Nombre de rendez-vous manqués :</td>
              <td colSpan="2">
                {readOnly ? (
                  <span className="sbin-hand">{data.rdv_manques ?? "0"}</span>
                ) : (
                  <input
                    type="number"
                    className="sbin-hand-input"
                    style={{ width: "80px" }}
                    value={data.rdv_manques ?? "0"}
                    onChange={(e) => update("rdv_manques", e.target.value)}
                  />
                )}
              </td>
            </tr>

            <tr>
              <td>
                Qualité de l'intervention de l'équipe : ....../10
              </td>
              <td colSpan="2">
                {readOnly ? (
                  <span className="sbin-hand">{data.note_qualite_equipe ?? "10"} / 10</span>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      className="sbin-hand-input"
                      style={{ width: "50px" }}
                      value={data.note_qualite_equipe ?? "10"}
                      onChange={(e) => update("note_qualite_equipe", e.target.value)}
                    />
                    <span className="sbin-hand">/ 10</span>
                  </div>
                )}
              </td>
            </tr>

            <tr>
              <td colSpan="3" style={{ textAlign: "center", fontWeight: 600, fontSize: "9.5px", background: "#f8fafc" }}>
                Autre élément à remplir par le prestataire sur demande du client
              </td>
            </tr>
            <tr>
              <td colSpan="3" style={{ minHeight: "24px" }}>
                {readOnly ? (
                  <span className="sbin-hand">{data.autre_element || "RAS"}</span>
                ) : (
                  <input
                    type="text"
                    className="sbin-hand-input"
                    value={data.autre_element || "RAS"}
                    onChange={(e) => update("autre_element", e.target.value)}
                    placeholder="Éléments complémentaires éventuels"
                  />
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* SECTION BAS DE PAGE : APPRÉCIATION GLOBALE ET SIGNATURES */}
        <div className="sbin-bottom-block">
          <div className="sbin-appreciation-line">
            Appréciation générale du client ............{" "}
            {readOnly ? (
              <span className="sbin-hand" style={{ fontSize: "16px" }}>
                {data.note_appreciation_client ?? "10"}
              </span>
            ) : (
              <input
                type="number"
                min="1"
                max="10"
                className="sbin-hand-input"
                style={{ width: "40px", display: "inline-block", textAlign: "center" }}
                value={data.note_appreciation_client ?? "10"}
                onChange={(e) => update("note_appreciation_client", e.target.value)}
              />
            )}{" "}
            /10
          </div>

          <div className="sbin-signature-title">
            Signature (Suivi du nom et prénoms)
          </div>

          <div className="sbin-signatures-row">
            {/* Colonne Signature Client */}
            <div className="sbin-sig-col">
              <div className="sbin-sig-role">Client</div>
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
                        className="sbin-sig-clear-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          update("signature_client", null);
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </>
                ) : (
                  <div className="sbin-sig-placeholder">
                    <span>✍️ Cliquer pour signer</span>
                    <small>Signature tactile client</small>
                  </div>
                )}
              </div>
              <div className="sbin-sig-name">
                <span className="sbin-hand">{data.nom_client || ""}</span>
              </div>
            </div>

            {/* Colonne Signature Prestataire */}
            <div className="sbin-sig-col" style={{ alignItems: "flex-end", textAlign: "right" }}>
              <div className="sbin-sig-role" style={{ width: "100%", textAlign: "right" }}>
                Prestataire
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
                      alt="Signature Prestataire"
                      className="sbin-sig-img"
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        className="sbin-sig-clear-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          update("signature_technicien", null);
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </>
                ) : (
                  <div className="sbin-sig-placeholder">
                    <span>✍️ Cliquer pour signer</span>
                    <small>Signature prestataire</small>
                  </div>
                )}
              </div>
              <div className="sbin-sig-name" style={{ width: "100%", textAlign: "right" }}>
                <span className="sbin-hand">{data.nom_technicien || "Technicien"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Signature Tactile Haute Définition */}
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
