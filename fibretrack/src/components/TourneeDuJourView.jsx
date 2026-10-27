import { useState, useMemo } from "react";
import { parseTourneeListing } from "../lib/tourneeParser.js";
import TourneeMapView from "./TourneeMapView.jsx";
import { extractClientCoordinates } from "../lib/routeOptimizer.js";
import {
  buildClientLocationUrl,
  buildClientLocationWhatsAppLink,
  buildClientLocationRequestMessage,
} from "../lib/whatsapp.js";
import {
  isInterventionTerminee,
  isInterventionNonTraitee,
  isInterventionSupprimee,
  isInterventionATraiterTournee,
} from "../lib/interventionFilters.js";
import {
  IconTruck,
  IconLock,
  IconUnlock,
  IconZap,
  IconCheckCircle,
  IconXCircle,
  IconRefresh,
  IconClipboardList,
  IconCalendar,
  IconPhone,
  IconSmartphone,
  IconServer,
  IconBox,
  IconGlobe,
  IconUser,
  IconPlay,
  IconFileText,
  IconPlus,
  IconTrash,
  IconAlertTriangle,
  IconMap,
  IconMapPin,
} from "./Icons.jsx";

/**
 * Vue dédiée à la "Tournée du Jour" : feuille de route quotidienne contenant exclusivement
 * les interventions restant à effectuer.
 */
export default function TourneeDuJourView({
  interventions = [],
  currentUser = "",
  techniciens = [],
  onOpenIntervention,
  onSaveIntervention,
  onDeleteIntervention,
  onCreateTourneeBatch,
  onAddNewIntervention,
  onSwitchTab,
  onRefresh,
}) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [assignTechnicien, setAssignTechnicien] = useState(currentUser || "");
  const [importing, setImporting] = useState(false);

  // Vue cartographique interactive & optimisation de tournée
  const [mapViewOpen, setMapViewOpen] = useState(false);

  // Modale de confirmation avant de lancer / déverrouiller un dossier
  const [launchConfirmDossier, setLaunchConfirmDossier] = useState(null);

  // Modale de confirmation avant de supprimer définitivement un dossier
  const [deleteConfirmDossier, setDeleteConfirmDossier] = useState(null);

  // Modale de déclaration non traité
  const [cancelModalDossier, setCancelModalDossier] = useState(null);
  const [cancelReason, setCancelReason] = useState("Client injoignable (ne répond pas aux appels)");
  const [cancelCustomReason, setCancelCustomReason] = useState("");

  // Tous les dossiers planifiés pour la date sélectionnée (hors supprimés) pour les compteurs de suivi
  const allDayDossiers = useMemo(() => {
    return (interventions || []).filter((intv) => {
      if (isInterventionSupprimee(intv)) return false;
      if (intv.tournee_du_jour) {
        return String(intv.tournee_du_jour).slice(0, 10) === selectedDate;
      }
      const intvDate = String(intv.date || "").slice(0, 10);
      return intvDate === selectedDate;
    });
  }, [interventions, selectedDate]);

  // Feuille de route : UNIQUEMENT les interventions restant à effectuer (non démarrées, non terminées, non annulées, non supprimées)
  const tourneeDossiers = useMemo(() => {
    return allDayDossiers
      .filter((intv) => isInterventionATraiterTournee(intv, selectedDate))
      .sort((a, b) => {
        const oA = Number(a.tournee_ordre || 9999);
        const oB = Number(b.tournee_ordre || 9999);
        if (oA !== oB) return oA - oB;
        return (a.nom_client || "").localeCompare(b.nom_client || "");
      });
  }, [allDayDossiers, selectedDate]);

  // Statistiques globales de la journée
  const stats = useMemo(() => {
    const total = allDayDossiers.length;
    let traites = 0;
    let enCours = 0;
    let verrouilles = 0;
    let nonTraites = 0;

    allDayDossiers.forEach((d) => {
      if (isInterventionNonTraitee(d)) {
        nonTraites++;
      } else if (isInterventionTerminee(d)) {
        traites++;
      } else if (isInterventionATraiterTournee(d, selectedDate)) {
        verrouilles++;
      } else {
        enCours++;
      }
    });

    const percent = total > 0 ? Math.round(((traites + nonTraites) / total) * 100) : 0;
    return { total, traites, enCours, verrouilles, nonTraites, percent };
  }, [allDayDossiers, selectedDate]);

  // Toast pour feedback utilisateur (ex: lien copié)
  const [toastMessage, setToastMessage] = useState("");

  const copyClientLink = (dossier) => {
    const url = buildClientLocationUrl(dossier?.id || "");
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setToastMessage(`Lien copié pour ${dossier.nom_client || "le client"} !`);
        setTimeout(() => setToastMessage(""), 3500);
      }).catch(() => {
        prompt("Copiez ce lien pour le client :", url);
      });
    } else {
      prompt("Copiez ce lien pour le client :", url);
    }
  };

  const dossiersSansGps = useMemo(() => {
    return tourneeDossiers.filter((d) => {
      const coords = extractClientCoordinates(d);
      return !coords && !d.client_gps_recu && !(d.latitude && d.longitude);
    });
  }, [tourneeDossiers]);

  // Déverrouillage effectif d'un dossier et passage en cours
  function handleUnlockDossier(dossier, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const updated = {
      ...dossier,
      tournee_verrouille: false,
      statut: "en_cours",
      modifie_le: new Date().toISOString(),
      changed_fields: ["tournee_verrouille", "statut", "modifie_le"],
    };
    setLaunchConfirmDossier(null);
    if (onSaveIntervention) {
      onSaveIntervention(updated);
    }
    if (onOpenIntervention) {
      onOpenIntervention(updated);
    }
  }

  // Marquer un dossier comme non traité (quitte la tournée et reste conservé dans l'historique)
  function handleConfirmNonTraite() {
    if (!cancelModalDossier) return;
    const finalReason = cancelReason === "Autre motif" ? cancelCustomReason.trim() : cancelReason;
    const updated = {
      ...cancelModalDossier,
      statut: "non_traite",
      motif_non_traite: finalReason || "Client non joint / reporté",
      tournee_verrouille: false,
      modifie_le: new Date().toISOString(),
      changed_fields: ["statut", "motif_non_traite", "tournee_verrouille", "modifie_le"],
    };
    setCancelModalDossier(null);
    setCancelCustomReason("");
    if (onSaveIntervention) {
      onSaveIntervention(updated);
    }
  }

  // Suppression définitive d'un dossier de la tournée
  function handleConfirmDelete() {
    if (!deleteConfirmDossier) return;
    const toDeleteId = deleteConfirmDossier.id;
    setDeleteConfirmDossier(null);
    if (onDeleteIntervention) {
      onDeleteIntervention(toDeleteId);
    }
  }

  // Aperçu en direct du texte d'import
  const parsedPreview = useMemo(() => {
    return parseTourneeListing(importText);
  }, [importText]);

  // Soumission de l'import du listing
  async function handleImportSubmit(e) {
    if (e) e.preventDefault();
    if (parsedPreview.length === 0) return;
    setImporting(true);
    try {
      if (onCreateTourneeBatch) {
        await onCreateTourneeBatch(selectedDate, parsedPreview, assignTechnicien);
      }
      setImportModalOpen(false);
      setImportText("");
      if (onRefresh) onRefresh();
    } catch (err) {
      alert("Erreur lors de l'importation de la tournée : " + err.message);
    } finally {
      setImporting(false);
    }
  }

  // Date formatée en français
  const formattedDateFR = useMemo(() => {
    try {
      const [y, m, d] = selectedDate.split("-");
      const dt = new Date(Number(y), Number(m) - 1, Number(d));
      return dt.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  if (mapViewOpen) {
    return (
      <div className="tournee-container">
        <TourneeMapView
          dossiers={allDayDossiers}
          selectedDate={selectedDate}
          onClose={() => setMapViewOpen(false)}
          onSaveIntervention={onSaveIntervention}
          onOpenIntervention={onOpenIntervention}
        />
      </div>
    );
  }

  return (
    <div className="tournee-container">
      {/* ===== EN-TÊTE PRINCIPAL DE LA TOURNÉE ===== */}
      <div className="tournee-header-card">
        <div className="tournee-header-top">
          <div className="tournee-title-group">
            <span className="tournee-icon" aria-hidden="true">
              <IconTruck size={24} color="var(--primary, #2563eb)" />
            </span>
            <div>
              <h2 className="tournee-title">Tournée du Jour — Feuille de route</h2>
              <div className="tournee-date-badge">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <IconCalendar size={14} />
                  {formattedDateFR}
                </span>
                <input
                  type="date"
                  className="tournee-date-picker-inline"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  title="Changer de date"
                />
              </div>
            </div>
          </div>

          <div className="tournee-header-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-tournee-map"
              onClick={() => setMapViewOpen(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
              title="Cartographie interactive et optimisation de l'itinéraire"
            >
              <IconMap size={16} />
              <span>Carte & Optimiser ({allDayDossiers.length})</span>
            </button>
            {onAddNewIntervention && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onAddNewIntervention(selectedDate)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}
              >
                <IconPlus size={16} />
                <span>Ajouter une intervention</span>
              </button>
            )}
            <button
              type="button"
              className="btn-tournee-import"
              onClick={() => setImportModalOpen(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              <IconClipboardList size={16} />
              <span>Importer le listing du jour</span>
            </button>
          </div>
        </div>

        {/* ===== BARRE DES COMPTEURS SYNTHÉTIQUES ===== */}
        <div className="tournee-metrics-grid">
          <div className="tournee-metric-chip locked" title="Interventions restant à effectuer dans la feuille de route">
            <span className="metric-label" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <IconLock size={13} />
              <span>À effectuer</span>
            </span>
            <span className="metric-val">{String(stats.verrouilles).padStart(2, "0")}</span>
          </div>
          <div
            className="tournee-metric-chip progress"
            title="Cliquez pour voir les interventions en cours"
            onClick={() => onSwitchTab && onSwitchTab("en_cours")}
            style={{ cursor: onSwitchTab ? "pointer" : "default" }}
          >
            <span className="metric-label" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <IconZap size={13} />
              <span>En cours ↗</span>
            </span>
            <span className="metric-val">{String(stats.enCours).padStart(2, "0")}</span>
          </div>
          <div
            className="tournee-metric-chip done"
            title="Cliquez pour voir les interventions terminées"
            onClick={() => onSwitchTab && onSwitchTab("terminees", "terminees")}
            style={{ cursor: onSwitchTab ? "pointer" : "default" }}
          >
            <span className="metric-label" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <IconCheckCircle size={13} />
              <span>Terminées ↗</span>
            </span>
            <span className="metric-val">{String(stats.traites).padStart(2, "0")}</span>
          </div>
          <div
            className="tournee-metric-chip canceled"
            title="Consulter les interventions non traitées"
            onClick={() => onSwitchTab && onSwitchTab("non_traitees")}
            style={{ cursor: onSwitchTab ? "pointer" : "default" }}
          >
            <span className="metric-label" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <IconXCircle size={13} />
              <span>Non traitées ↗</span>
            </span>
            <span className="metric-val">{String(stats.nonTraites).padStart(2, "0")}</span>
          </div>
          <div className="tournee-metric-chip total" title="Nombre total de dossiers prévus pour cette journée">
            <span className="metric-label">Total journée</span>
            <span className="metric-val">{String(stats.total).padStart(2, "0")}</span>
          </div>
        </div>

        {/* Jauge de progression de la feuille de route */}
        {stats.total > 0 && (
          <div className="tournee-progress-wrap">
            <div className="tournee-progress-bar">
              <div
                className="tournee-progress-fill"
                style={{ width: `${stats.percent}%` }}
              />
            </div>
            <div className="tournee-progress-legend">
              <span>
                {stats.verrouilles === 0
                  ? "Feuille de route terminée (0 intervention en attente)"
                  : `${stats.verrouilles} intervention${stats.verrouilles > 1 ? "s" : ""} restant à effectuer`}
              </span>
              <span className="legend-highlight">
                {stats.traites} terminée(s) • {stats.enCours} en cours{stats.nonTraites > 0 ? ` • ${stats.nonTraites} non traitée(s)` : ""}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ===== LISTE DES INTERVENTIONS À EFFECTUER (FEUILLE DE ROUTE EXCLUSIVE) ===== */}
      {tourneeDossiers.length === 0 ? (
        <div className="tournee-empty-card">
          <div className="empty-icon" style={{ display: "inline-flex", justifyContent: "center", alignItems: "center", color: stats.total > 0 ? "#16a34a" : "var(--primary)" }}>
            {stats.total > 0 ? <IconCheckCircle size={48} /> : <IconTruck size={48} />}
          </div>
          {stats.total > 0 ? (
            <>
              <h3>Feuille de route du jour vide — Toutes les interventions ont été prises en charge</h3>
              <p style={{ maxWidth: 540, margin: "8px auto 14px" }}>
                Aucune intervention ne reste en attente pour le <strong>{formattedDateFR}</strong>. Les dossiers démarrés sont dans{" "}
                <strong>En cours ({stats.enCours})</strong>, les dossiers achevés dans <strong>Terminées ({stats.traites})</strong>
                {stats.nonTraites > 0 ? `, et les dossiers reportés dans l'historique Non traitées (${stats.nonTraites})` : ""}.
                Vous pouvez préparer une nouvelle tournée ou ajouter de nouvelles interventions.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 10 }}>
                {stats.enCours > 0 && onSwitchTab && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onSwitchTab("en_cours")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <IconZap size={16} />
                    <span>Voir En cours ({stats.enCours})</span>
                  </button>
                )}
                {stats.traites > 0 && onSwitchTab && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onSwitchTab("terminees", "terminees")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <IconCheckCircle size={16} />
                    <span>Voir Terminées ({stats.traites})</span>
                  </button>
                )}
                {stats.nonTraites > 0 && onSwitchTab && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onSwitchTab("non_traitees")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <IconXCircle size={16} />
                    <span>Voir Non traitées ({stats.nonTraites})</span>
                  </button>
                )}
                {onSwitchTab && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onSwitchTab("rapport")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <IconFileText size={16} />
                    <span>Ouvrir l&apos;onglet Rapport</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <h3>Aucune intervention à effectuer pour cette journée</h3>
              <p>
                La feuille de route du <strong>{formattedDateFR}</strong> est prête à recevoir les interventions de la journée.
              </p>
            </>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
            {onAddNewIntervention && (
              <button
                type="button"
                className="btn-secondary btn-large"
                onClick={() => onAddNewIntervention(selectedDate)}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <IconPlus size={18} />
                <span>Créer une intervention</span>
              </button>
            )}
            <button
              type="button"
              className="btn-primary btn-large"
              onClick={() => setImportModalOpen(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <IconClipboardList size={18} />
              <span>Coller le listing du jour (Import Express)</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="tournee-dossiers-list">
          {dossiersSansGps.length > 0 && (
            <div className="tournee-gps-bulk-banner">
              <span className="text">
                📍 {dossiersSansGps.length} dossier{dossiersSansGps.length > 1 ? "s" : ""} en attente de position client
              </span>
              <button
                type="button"
                className="btn-tournee-map"
                onClick={() => setMapViewOpen(true)}
                style={{ padding: "4px 10px", fontSize: 12 }}
              >
                Ouvrir la carte
              </button>
            </div>
          )}
          {tourneeDossiers.map((dossier, idx) => {
            const ordreNum = dossier.tournee_ordre || idx + 1;

            const handleCardClick = () => {
              setLaunchConfirmDossier(dossier);
            };

            return (
              <div
                key={dossier.id}
                className="tournee-card status-locked"
                onClick={handleCardClick}
                style={{ cursor: "pointer" }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCardClick();
                  }
                }}
              >
                {/* Numéro d'ordre & badge statut */}
                <div className="tournee-card-header">
                  <div className="tournee-card-num-badge">
                    <span className="num">#{ordreNum}</span>
                    <strong className="client-name">{dossier.nom_client || "Dossier sans nom"}</strong>
                  </div>

                  <div className="tournee-card-status-badge">
                    <span className="badge badge-locked" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <IconLock size={13} />
                      <span>À effectuer</span>
                    </span>
                  </div>
                </div>

                {/* Données clés du dossier */}
                <div className="tournee-card-details">
                  {dossier.telephone_ligne && (
                    <span className="detail-chip" title="Numéro de ligne fixe">
                      <IconPhone size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                      Ligne : <strong>{dossier.telephone_ligne}</strong>
                    </span>
                  )}
                  {dossier.mobile && (
                    <a
                      href={`tel:${String(dossier.mobile).replace(/\s+/g, "").split("/")[0]}`}
                      className="detail-chip link"
                      title="Appeler le client"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconSmartphone size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                      Mobile : <strong>{dossier.mobile}</strong>
                    </a>
                  )}
                  {dossier.msan && (
                    <span className="detail-chip" title="MSAN">
                      <IconServer size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                      MSAN : <strong>{dossier.msan}</strong>
                    </span>
                  )}
                  {dossier.fat_ref && (
                    <span className="detail-chip" title="Référence FAT">
                      <IconBox size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                      FAT : <strong>{dossier.fat_ref}</strong>
                    </span>
                  )}
                  {dossier.offre_souscrite && (
                    <span className="detail-chip" title="Offre / Type">
                      <IconGlobe size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                      Offre : <strong>{dossier.offre_souscrite}</strong>
                    </span>
                  )}
                  {dossier.nom_technicien && (
                    <span className="detail-chip tech" title="Technicien assigné">
                      <IconUser size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
                      {dossier.nom_technicien}
                    </span>
                  )}
                </div>

                {/* Statut GPS & Demande de localisation WhatsApp */}
                {(() => {
                  const coords = extractClientCoordinates(dossier);
                  const hasGps = Boolean(coords || dossier.client_gps_recu || (dossier.latitude && dossier.longitude));
                  const repere = dossier.client_repere || (Array.isArray(dossier.points_gps) ? dossier.points_gps.find((p) => p?.repere)?.repere : "");
                  const waLink = buildClientLocationWhatsAppLink(dossier);

                  if (hasGps) {
                    return (
                      <div className="tournee-gps-badge-row" onClick={(e) => e.stopPropagation()}>
                        <span className="tournee-gps-pill received" title="Coordonnées GPS client enregistrées">
                          <IconMapPin size={13} color="#16a34a" />
                          <span>Position client validée</span>
                        </span>
                        {repere && (
                          <span className="tournee-gps-repere" title={`Repère visuel : ${repere}`}>
                            🏠 {repere}
                          </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="tournee-gps-action-row" onClick={(e) => e.stopPropagation()}>
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-tournee-wa-loc"
                        title="Envoyer le lien WhatsApp au client pour capter sa position"
                      >
                        <span style={{ fontSize: 13 }}>📲</span>
                        <span>Demander position WhatsApp</span>
                      </a>
                      <button
                        type="button"
                        className="btn-tournee-copy-link"
                        title="Copier le lien direct pour le client"
                        onClick={() => copyClientLink(dossier)}
                      >
                        📋 Copier lien
                      </button>
                    </div>
                  );
                })()}

                {/* Actions de la carte */}
                <div className="tournee-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="btn-action-unlock"
                    onClick={() => setLaunchConfirmDossier(dossier)}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <IconUnlock size={15} />
                    <span>Démarrer l&apos;intervention</span>
                  </button>
                  <button
                    type="button"
                    className="btn-action-map"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMapViewOpen(true);
                    }}
                    title="Voir l'emplacement et le trajet sur la carte"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}
                  >
                    <IconMap size={14} />
                    <span>Carte</span>
                  </button>
                  <button
                    type="button"
                    className="btn-action-danger"
                    onClick={() => setCancelModalDossier(dossier)}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    <IconXCircle size={15} />
                    <span>Non traité</span>
                  </button>

                  {/* Bouton de suppression définitive sur chaque carte */}
                  <button
                    type="button"
                    className="btn-action-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmDossier(dossier);
                    }}
                    title="Supprimer définitivement ce dossier"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}
                  >
                    <IconTrash size={14} />
                    <span>Supprimer</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== MODALE DE CONFIRMATION AVANT DE LANCER L'INTERVENTION ===== */}
      {launchConfirmDossier && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            padding: 16,
          }}
          onClick={() => setLaunchConfirmDossier(null)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <IconUnlock size={22} color="var(--primary, #2563eb)" />
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                  Lancer cette intervention ?
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setLaunchConfirmDossier(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ margin: "14px 0", fontSize: 14, color: "var(--text)", lineHeight: 1.5 }}>
              <p style={{ margin: "0 0 12px", color: "var(--text-muted)" }}>
                Voulez-vous lancer cette intervention ? Le dossier passera automatiquement{" "}
                <strong>En cours</strong> et les autres interventions resteront verrouillées avec le cadenas.
              </p>

              <div
                style={{
                  background: "var(--bg-card, #f8fafc)",
                  border: "1.5px solid var(--border, #cbd5e1)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                  <IconUser size={16} color="var(--primary, #2563eb)" />
                  <span>{launchConfirmDossier.nom_client || "Dossier sans nom"}</span>
                </div>
                {launchConfirmDossier.telephone_ligne && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                    <IconPhone size={14} />
                    <span>Ligne fixe : <strong>{launchConfirmDossier.telephone_ligne}</strong></span>
                  </div>
                )}
                {launchConfirmDossier.mobile && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                    <IconSmartphone size={14} />
                    <span>Mobile : <strong>{launchConfirmDossier.mobile}</strong></span>
                  </div>
                )}
                {(launchConfirmDossier.msan || launchConfirmDossier.fat_ref) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                    <IconServer size={14} />
                    <span>MSAN : <strong>{launchConfirmDossier.msan || "-"}</strong> • FAT : <strong>{launchConfirmDossier.fat_ref || "-"}</strong></span>
                  </div>
                )}
                {launchConfirmDossier.offre_souscrite && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
                    <IconGlobe size={14} />
                    <span>Offre : <strong>{launchConfirmDossier.offre_souscrite}</strong></span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setLaunchConfirmDossier(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleUnlockDossier(launchConfirmDossier)}
                style={{ minWidth: 180, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                <IconPlay size={16} />
                <span>Oui, lancer l&apos;intervention</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODALE DE CONFIRMATION DE SUPPRESSION DÉFINITIVE ===== */}
      {deleteConfirmDossier && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            padding: 16,
          }}
          onClick={() => setDeleteConfirmDossier(null)}
        >
          <div className="modal-card modal-card-danger" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-header" style={{ borderBottom: "1px solid var(--border-light, #e2e8f0)", paddingBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: "#fee2e2",
                  color: "#dc2626",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  <IconAlertTriangle size={22} color="#dc2626" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#991b1b" }}>
                    Supprimer définitivement ?
                  </h3>
                  <span style={{ fontSize: 12, color: "var(--text-muted, #64748b)" }}>
                    Action irréversible sur la tournée du jour
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeleteConfirmDossier(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ padding: "16px 0" }}>
              <p style={{ margin: "0 0 14px", fontSize: 14, color: "var(--text, #1e293b)", lineHeight: 1.5 }}>
                Êtes-vous sûr de vouloir supprimer définitivement cette intervention de la journée ?
              </p>

              <div style={{
                background: "#f8fafc",
                border: "1.5px solid #e2e8f0",
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 14,
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 6 }}>
                  {deleteConfirmDossier.nom_client || "Dossier sans nom"}
                </div>
                {deleteConfirmDossier.telephone_ligne && (
                  <div style={{ fontSize: 13, color: "#475569", marginBottom: 3 }}>
                    Ligne fixe : <strong>{deleteConfirmDossier.telephone_ligne}</strong>
                  </div>
                )}
                {deleteConfirmDossier.mobile && (
                  <div style={{ fontSize: 13, color: "#475569", marginBottom: 3 }}>
                    Mobile : <strong>{deleteConfirmDossier.mobile}</strong>
                  </div>
                )}
                {(deleteConfirmDossier.msan || deleteConfirmDossier.fat_ref) && (
                  <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>
                    {deleteConfirmDossier.msan ? `MSAN : ${deleteConfirmDossier.msan} ` : ""}
                    {deleteConfirmDossier.fat_ref ? `• FAT : ${deleteConfirmDossier.fat_ref}` : ""}
                  </div>
                )}
              </div>

              <div style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12,
                color: "#991b1b",
                lineHeight: 1.45,
              }}>
                ⚠️ Ce dossier sera immédiatement et définitivement retiré de la tournée du jour, des interventions en cours et de tous les compteurs opérationnels.
              </div>
            </div>

            <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteConfirmDossier(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-danger-confirm"
                onClick={handleConfirmDelete}
                style={{
                  background: "#dc2626",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 18px",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <IconTrash size={15} />
                <span>Oui, supprimer définitivement</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODALE D'IMPORT EXPRESS DU LISTING DU JOUR ===== */}
      {importModalOpen && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            padding: 16,
          }}
          onClick={() => !importing && setImportModalOpen(false)}
        >
          <div className="modal-card tournee-import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <IconClipboardList size={22} color="var(--primary, #2563eb)" />
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                  Importer le listing de la Tournée du Jour
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !importing && setImportModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
              Collez ci-dessous le listing complet des dossiers du jour (reçu par mail, Excel ou WhatsApp).
              Le système extrait automatiquement les <strong>noms</strong>, <strong>lignes</strong>,{" "}
              <strong>mobiles</strong>, <strong>MSAN</strong> et <strong>FAT</strong>.
            </p>

            <form onSubmit={handleImportSubmit}>
              <div className="form-field" style={{ marginBottom: 12 }}>
                <span>Date de la tournée</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  required
                />
              </div>

              {techniciens && techniciens.length > 0 && (
                <div className="form-field" style={{ marginBottom: 12 }}>
                  <span>Assigner au technicien</span>
                  <select
                    value={assignTechnicien}
                    onChange={(e) => setAssignTechnicien(e.target.value)}
                  >
                    <option value="">-- Technicien par défaut ({currentUser || "Non assigné"}) --</option>
                    {techniciens.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-field" style={{ marginBottom: 16 }}>
                <span>Listing brut (Copier-Coller)</span>
                <textarea
                  rows={6}
                  placeholder={`Exemple :\nOJUS MALIKI ET FILS\t0121257097\t0197923750\tFTTH\tSEM-PL02 FAT103\nBLOUEDOU  SEIDOU \t0121293241\t0169659530\tFTTH\tSEM-PL165 FAT23\nSANNI AKIMOU ADEDIRAN ADJAHO\t0121297613\t0197181647\tFTTH\tSEM-PL151 FAT47\nANAGONOU ALLELUIA DORCAS\t0121295715\t0141129211/140929302\tFTTH\tSEM-PL02 FAT215`}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.4 }}
                  required
                />
              </div>

              {/* Aperçu en direct */}
              {parsedPreview.length > 0 && (
                <div className="import-preview-box">
                  <div className="import-preview-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <IconCheckCircle size={16} color="var(--success, #16a34a)" />
                    <strong>{parsedPreview.length} dossier(s) détecté(s)</strong> pour la tournée :
                  </div>
                  <ul className="import-preview-list">
                    {parsedPreview.map((item, idx) => (
                      <li key={idx} className="import-preview-item">
                        <span className="item-order">#{idx + 1}</span>
                        <div className="item-info">
                          <strong>{item.nom_client}</strong>
                          <span className="item-sub">
                            Ligne: {item.telephone_ligne || "-"} • Mob: {item.mobile || "-"} • MSAN: {item.msan || "-"} • FAT: {item.fat_ref || "-"}
                          </span>
                        </div>
                        <span className="item-lock-badge locked" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <IconLock size={12} />
                          <span>Verrouillé (En attente)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={importing}
                  onClick={() => setImportModalOpen(false)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={importing || parsedPreview.length === 0}
                  style={{ minWidth: 200, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <IconPlus size={16} />
                  <span>{importing ? "Création de la tournée…" : `Créer la Tournée (${parsedPreview.length} dossiers)`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODALE DE DÉCLARATION NON TRAITÉ ===== */}
      {cancelModalDossier && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(4px)",
            padding: 16,
          }}
          onClick={() => setCancelModalDossier(null)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <IconXCircle size={20} color="var(--danger, #ef4444)" />
                <h3 style={{ margin: 0, fontSize: 17, color: "var(--danger, #ef4444)" }}>
                  Déclarer le dossier Non traité
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setCancelModalDossier(null)}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: "var(--text)", margin: "0 0 14px", lineHeight: 1.5 }}>
              Vous êtes sur le point d&apos;annuler l&apos;intervention pour aujourd&apos;hui pour le client{" "}
              <strong>{cancelModalDossier.nom_client}</strong>. Veuillez indiquer le motif :
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {[
                "Client injoignable (ne répond pas aux appels)",
                "Client absent du domicile / Reporté",
                "Problème réseau / Câble ou FAT saturé",
                "Intempéries / Accès impossible",
                "Autre motif",
              ].map((reason) => (
                <label
                  key={reason}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: cancelReason === reason ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                    background: cancelReason === reason ? "var(--primary-light, #eff6ff)" : "transparent",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <input
                    type="radio"
                    name="cancel_reason"
                    checked={cancelReason === reason}
                    onChange={() => setCancelReason(reason)}
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>

            {cancelReason === "Autre motif" && (
              <div className="form-field" style={{ marginBottom: 14 }}>
                <span>Précisez le motif</span>
                <input
                  type="text"
                  value={cancelCustomReason}
                  onChange={(e) => setCancelCustomReason(e.target.value)}
                  placeholder="Ex: Refus du propriétaire..."
                  required
                />
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setCancelModalDossier(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmNonTraite}
                style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
              >
                Confirmer l&apos;annulation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de confirmation (ex: lien copié) */}
      {toastMessage && (
        <div style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#0f172a",
          color: "#ffffff",
          padding: "10px 18px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
          zIndex: 9999,
          pointerEvents: "none",
        }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
