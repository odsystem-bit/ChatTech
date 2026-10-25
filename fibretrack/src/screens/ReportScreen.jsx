import { useState, useCallback, useEffect, useMemo } from "react";
import { generateGlobalReport, generateConformiteReport, generateRapportDuJour, fmt2 } from "../lib/whatsapp";
import { collectCelprosPhotos } from "../lib/slotPhotos";
import { openWhatsAppText } from "../lib/reportShare";
import { CELPROS_PHOTO_SLOTS } from "./InterventionFormScreen";
import { isInterventionTerminee } from "../lib/interventionFilters";
import {
  ensureInterventionDefaults,
  getIntervention,
  getStoredIntervention,
  saveInterventionLocally,
  saveIntervention,
} from "../models/Intervention";
import {
  downloadPhotoFile,
  downloadAllPhotosAsZip,
  downloadDayPhotosAsZip,
  downloadVideoFile,
  downloadTextReportFile,
  savePhotosToLocalDirectory,
  sanitizeClientFolderName,
} from "../lib/photoDownload";
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
import VideoPlayerModal from "../components/VideoPlayerModal";
import { formatDuration, formatFileSize } from "../lib/videoCompression";
import {
  IconRefresh,
  IconCheckCircle,
  IconClipboardList,
  IconChart,
  IconFileText,
} from "../components/Icons";

export default function ReportScreen({ intervention, allInterventions = [], onClose, onEdit }) {
  const [data, setData] = useState(ensureInterventionDefaults(intervention));
  const [refreshing, setRefreshing] = useState(false);
  const [downloadProgressText, setDownloadProgressText] = useState("");
  const [activeViewingVideo, setActiveViewingVideo] = useState(null);

  useEffect(() => {
    if (intervention) {
      setData(ensureInterventionDefaults(intervention));
    }
  }, [intervention]);

  // Photos CelPros de cette intervention (ordre CelPros + poteaux), additionnelles exclues
  const photoEntries = useMemo(() => collectCelprosPhotos(data, CELPROS_PHOTO_SLOTS), [data]);

  // Photos additionnelles terrain
  const photosAdditionnelles = useMemo(() => {
    return (data?.whatsapp_photos || []).filter(
      (p) => p && (p.additionnelle || p.is_additionnelle || p.slot === "additionnelle" || String(p.slot).startsWith("additionnelle_") || p.type === "additionnelle")
    );
  }, [data?.whatsapp_photos]);

  // Liste ordonnée de TOUTES les photos de l'intervention (CelPros + Poteaux + Additionnelles)
  const allInterventionPhotos = useMemo(() => {
    const list = [];
    const seen = new Set();

    for (const item of photoEntries) {
      const url = item.url || item.photo?.url || item.photo?.photo || "";
      if (url && !seen.has(url)) {
        seen.add(url);
        list.push({
          id: String(item.photo?.id || item.key),
          key: item.key,
          label: item.label,
          url,
          lat: item.photo?.lat,
          lng: item.photo?.lng,
          lieu: item.photo?.lieu,
          isAdditionnelle: false,
        });
      }
    }

    photosAdditionnelles.forEach((ap, idx) => {
      const url = ap.url || ap.photo || "";
      if (url && !seen.has(url)) {
        seen.add(url);
        list.push({
          id: String(ap.id || `additionnelle_${idx + 1}`),
          key: `additionnelle_${idx + 1}`,
          label: ap.label || ap.name || `Photo additionnelle #${idx + 1}`,
          url,
          lat: ap.lat,
          lng: ap.lng,
          lieu: ap.lieu,
          isAdditionnelle: true,
        });
      }
    });

    return list;
  }, [photoEntries, photosAdditionnelles]);


  const [viewingPhoto, setViewingPhoto] = useState(null);

  // Charger toujours la fiche complète et à jour à l'ouverture du rapport
  useEffect(() => {
    if (!intervention?.id) return;
    let cancelled = false;
    getIntervention(intervention.id)
      .then((fresh) => {
        if (cancelled || !fresh) return;
        const full = { ...fresh, _fully_loaded: true };
        saveInterventionLocally(full);
        setData(ensureInterventionDefaults(full));
      })
      .catch((err) => console.warn("Chargement complet du rapport:", err));
    return () => {
      cancelled = true;
    };
  }, [intervention?.id]);

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
  const [sendStatus, setSendStatus] = useState("");
  const [satStatus, setSatStatus] = useState("");
  const [showFichesModal, setShowFichesModal] = useState(false);
  const [reportType, setReportType] = useState("global");
  const [realises, setRealises] = useState("");
  const [recus, setRecus] = useState("");
  const [loadingAction, setLoadingAction] = useState(null);
  const [isManualCounter, setIsManualCounter] = useState(false);

  // Calcul automatique des compteurs "Reçus" et "Réalisés" du jour selon la tournée
  const computeCounters = useCallback(() => {
    const list = Array.isArray(allInterventions) && allInterventions.length > 0 ? allInterventions : [];
    const targetDate = data?.tournee_du_jour || (data?.date ? String(data.date).slice(0, 10) : new Date().toISOString().slice(0, 10));

    // Filtrer les dossiers de la même journée de tournée
    const todayDossiers = list.filter((intv) => {
      if (!intv) return false;
      if (intv.tournee_du_jour) return intv.tournee_du_jour === targetDate;
      const d = (intv.date || "").slice(0, 10);
      return d === targetDate;
    });

    if (todayDossiers.length > 0) {
      const nbRecus = todayDossiers.length;
      let nbTraites = todayDossiers.filter((d) => isInterventionTerminee(d) || d.id === data?.id).length;
      if (nbTraites === 0) nbTraites = 1; // Au minimum le dossier en cours de rapport
      setRecus(String(nbRecus));
      setRealises(String(nbTraites));
    } else {
      setRecus("1");
      setRealises("1");
    }
  }, [allInterventions, data?.id, data?.tournee_du_jour, data?.date]);

  useEffect(() => {
    if (!isManualCounter) {
      computeCounters();
    }
  }, [computeCounters, isManualCounter]);

  const targetDate = useMemo(() => {
    return data?.tournee_du_jour || (data?.date ? String(data.date).slice(0, 10) : new Date().toISOString().slice(0, 10));
  }, [data?.tournee_du_jour, data?.date]);

  const todayDossiers = useMemo(() => {
    const list = Array.isArray(allInterventions) && allInterventions.length > 0 ? allInterventions : [];
    const items = list
      .filter((intv) => {
        if (!intv || intv.supprime_le) return false;
        if (intv.tournee_du_jour) return intv.tournee_du_jour === targetDate;
        const d = (intv.date || "").slice(0, 10);
        return d === targetDate;
      })
      .map((intv) => {
        if (data?.id && intv.id === data.id) return data;
        const cached = intv.id ? getStoredIntervention(intv.id) : null;
        return cached ? { ...cached, ...intv, whatsapp_photos: cached.whatsapp_photos || intv.whatsapp_photos, points_gps: cached.points_gps || intv.points_gps, videos_terrain: cached.videos_terrain || intv.videos_terrain } : intv;
      });
    if (data?.id && !items.some((i) => i.id === data.id)) {
      items.push(data);
    }
    return items;
  }, [allInterventions, data, targetDate]);

  const validesJour = useMemo(() => {
    return todayDossiers.filter((d) => isInterventionTerminee(d) || d.id === data?.id).length;
  }, [todayDossiers, data?.id]);

  const compteurJour = {
    realises: realises !== "" ? Number(realises) : validesJour,
    recus: recus !== "" ? Number(recus) : todayDossiers.length,
  };
  const globalReport = useMemo(() => generateGlobalReport(data, compteurJour), [data, compteurJour]);
  const conformiteReport = useMemo(() => generateConformiteReport(data), [data]);
  const rapportDuJour = useMemo(() => {
    return generateRapportDuJour(todayDossiers, data, {
      date: targetDate,
      totalRecus: Number(recus) || todayDossiers.length,
      countTraites: Number(realises) || validesJour,
      countValides: validesJour,
    });
  }, [todayDossiers, data, targetDate, recus, realises, validesJour]);

  const activeReport = useMemo(() => {
    if (reportType === "conformite") return conformiteReport;
    if (reportType === "jour") return rapportDuJour;
    return globalReport;
  }, [reportType, conformiteReport, rapportDuJour, globalReport]);


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

  async function handleCopyText(textToCopy = activeReport) {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Erreur copie presse-papier :", err);
    }
  }

  async function handleCopy() {
    return handleCopyText(activeReport);
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

  // Envoi direct du rapport officiel sur WhatsApp (texte seul, sans liens photos)
  function handleShareWhatsApp() {
    try {
      navigator.clipboard.writeText(activeReport);
    } catch {
      /* ignore */
    }
    openWhatsAppText(activeReport);
    setSendStatus("✓ WhatsApp ouvert avec le rapport officiel (copié également dans le presse-papier).");
  }

  // 2. Téléchargement groupé de toutes les photos dans un dossier au nom du client (ZIP)
  async function handleDownloadAllPhotosZip(photosToDownload = null) {
    const targetList = Array.isArray(photosToDownload) && photosToDownload.length > 0
      ? photosToDownload
      : allInterventionPhotos;

    const hasVideos = Array.isArray(data.videos_terrain) && data.videos_terrain.length > 0;
    if (targetList.length === 0 && !hasVideos && !activeReport) {
      setSendStatus("Aucune photo, vidéo ou rapport disponible à télécharger.");
      return;
    }

    setLoadingAction("downloadZip");
    setDownloadProgressText("Préparation du dossier complet (Rapports, Photos, Vidéos)…");
    try {
      const res = await downloadAllPhotosAsZip(targetList, data.nom_client, {
        reportText: activeReport,
        reports: {
          globalReport,
          conformiteReport,
          rapportDuJour,
        },
        interventionId: data.id,
        videos: data.videos_terrain || [],
        onProgress: (_curr, _tot, msg) => setDownloadProgressText(msg),
      });
      setSendStatus(
        `✓ Dossier '${res.folderName}' (${res.count} photos, ${res.videoCount || 0} vidéos, 3 rapports) téléchargé dans vos Téléchargements !`
      );
    } catch (err) {
      console.error("Erreur téléchargement zip:", err);
      setSendStatus(`Erreur lors du téléchargement du dossier : ${err.message}`);
    } finally {
      setLoadingAction(null);
      setDownloadProgressText("");
    }
  }

  // 3. Enregistrement direct dans un sous-dossier local (Desktop Chrome / Edge)
  async function handleSaveToLocalFolder(photosToDownload = null) {
    const targetList = Array.isArray(photosToDownload) && photosToDownload.length > 0
      ? photosToDownload
      : allInterventionPhotos;

    if (targetList.length === 0) {
      setSendStatus("Aucune photo disponible à enregistrer.");
      return;
    }

    setLoadingAction("saveFolder");
    setDownloadProgressText("Choix du dossier…");
    try {
      const res = await savePhotosToLocalDirectory(targetList, data.nom_client, {
        reportText: activeReport,
        onProgress: (_curr, _tot, msg) => setDownloadProgressText(msg),
      });
      setSendStatus(`✓ Dossier '${res.folderName}' créé avec succès avec ${res.count} photo(s) !`);
    } catch (err) {
      if (err.name !== "AbortError") {
        setSendStatus(`Erreur dossier local : ${err.message}`);
      }
    } finally {
      setLoadingAction(null);
      setDownloadProgressText("");
    }
  }

  // 5. Téléchargement groupé de TOUTES les photos & vidéos de la journée (ZIP structuré par client)
  async function handleDownloadDayZip() {
    if (loadingAction) return;
    setLoadingAction("downloadDayZip");
    setDownloadProgressText("Synchronisation des photos de l'équipe pour la journée…");
    try {
      const hydratedDossiers = await Promise.all(
        todayDossiers.map(async (d) => {
          if (!d?.id) return d;
          try {
            const full = await getIntervention(d.id);
            if (full) {
              saveInterventionLocally({ ...full, _fully_loaded: true });
              return full;
            }
          } catch (_) {
            // fallback to current or local cached dossier
          }
          return d.id === data?.id ? data : (getStoredIntervention(d.id) || d);
        })
      );
      const freshRapportDuJour = generateRapportDuJour(hydratedDossiers, data, {
        date: targetDate,
        realises: compteurJour.realises,
        recus: compteurJour.recus,
      });
      const res = await downloadDayPhotosAsZip(hydratedDossiers, targetDate, {
        rapportDuJourText: freshRapportDuJour || rapportDuJour,
        onProgress: (_curr, _tot, msg) => setDownloadProgressText(msg),
      });
      setSendStatus(
        `✓ Archive complète du jour (${res.totalPhotos} photos/vidéos de ${res.totalInterventions} clients) téléchargée !`
      );
    } catch (err) {
      console.error("Erreur téléchargement archive jour:", err);
      if (err && err.name !== "AbortError") {
        setSendStatus(`Erreur archive jour : ${err.message}`);
      }
    } finally {
      setLoadingAction(null);
      setDownloadProgressText("");
    }
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
            <IconRefresh size={16} className={refreshing ? "spin-icon" : ""} style={{ verticalAlign: "middle" }} />
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

      {/* Bannière Client */}
      <div className="status-banner" style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IconCheckCircle size={18} color="var(--success, #16a34a)" />
          <span><strong>{data.nom_client || "Nouveau client"}</strong> — Intervention terminée</span>
        </div>
        <button
          type="button"
          className="btn-secondary"
          style={{ padding: "4px 10px", fontSize: 12 }}
          onClick={() => onEdit(data)}
        >
          ✏ Modifier l'intervention
        </button>
      </div>

      {/* Barre d'onglets segmentés */}
      <div className="report-segmented-tabs">
        <button
          type="button"
          className={`report-tab-btn ${reportType === "global" ? "active" : ""}`}
          onClick={() => {
            setReportType("global");
            setCopied(false);
          }}
        >
          <span className="tab-icon">📊</span>
          <div className="tab-text-block">
            <span className="tab-title">Rapport Global</span>
            <span className="tab-sub">Client & Photos ({allInterventionPhotos.length})</span>
          </div>
        </button>

        <button
          type="button"
          className={`report-tab-btn ${reportType === "conformite" ? "active" : ""}`}
          onClick={() => {
            setReportType("conformite");
            setCopied(false);
          }}
        >
          <span className="tab-icon">⚖️</span>
          <div className="tab-text-block">
            <span className="tab-title">Conformité</span>
            <span className="tab-sub">Audit qualité</span>
          </div>
        </button>

        <button
          type="button"
          className={`report-tab-btn ${reportType === "jour" ? "active" : ""}`}
          onClick={() => {
            setReportType("jour");
            setCopied(false);
          }}
        >
          <span className="tab-icon">📅</span>
          <div className="tab-text-block">
            <span className="tab-title">Rapport du Jour</span>
            <span className="tab-sub">Tournée ({validesJour}/{compteurJour.recus})</span>
          </div>
        </button>

        <button
          type="button"
          className={`report-tab-btn ${reportType === "fiches" ? "active" : ""}`}
          onClick={() => {
            setReportType("fiches");
            setCopied(false);
          }}
        >
          <span className="tab-icon">📑</span>
          <div className="tab-text-block">
            <span className="tab-title">Documents PDF</span>
            <span className="tab-sub">Fiches SBIN & Signatures</span>
          </div>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ONGLET 1 : RAPPORT GLOBAL DE L'INTERVENTION ACTIVE                         */}
      {/* ========================================================================= */}
      {reportType === "global" && (
        <div className="report-tab-panel">
          {/* Boîte compteur journalier */}
          <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: 10, marginBottom: 14, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
              <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#334155", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <IconChart size={15} />
                <span>Compteur journalier ({fmt2(compteurJour.realises)} Réalisés / {fmt2(compteurJour.recus)} Reçus)</span>
              </h4>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>
                  {isManualCounter ? "Modifié manuellement" : "Calculé selon la tournée"}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: "3px 8px", fontSize: 11, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
                  onClick={() => {
                    setIsManualCounter(false);
                    computeCounters();
                  }}
                  title="Recalculer automatiquement à partir des dossiers de la journée"
                >
                  <IconRefresh size={12} />
                  <span>Recalculer</span>
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label className="form-field" style={{ flex: "1 1 120px" }}>
                <span>Réalisés (aujourd'hui)</span>
                <input
                  type="number"
                  min="0"
                  value={realises}
                  onChange={(e) => {
                    setIsManualCounter(true);
                    setRealises(e.target.value);
                  }}
                  placeholder="0"
                />
              </label>
              <label className="form-field" style={{ flex: "1 1 120px" }}>
                <span>Reçus (dossiers donnés)</span>
                <input
                  type="number"
                  min="0"
                  value={recus}
                  onChange={(e) => {
                    setIsManualCounter(true);
                    setRecus(e.target.value);
                  }}
                  placeholder="0"
                />
              </label>
            </div>
          </div>

          {/* Barre d'actions Rapport Global */}
          <div className="report-actions-bar">
            <button
              type="button"
              className="btn-primary"
              onClick={handleShareWhatsApp}
              style={{ flex: "2 1 200px", background: "#16a34a", borderColor: "#16a34a", fontWeight: 700, padding: "10px 14px" }}
              title="Partager le texte officiel du rapport sur WhatsApp"
            >
              💬 Partager sur WhatsApp
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleDownloadAllPhotosZip(allInterventionPhotos)}
              disabled={loadingAction === "downloadZip" || (allInterventionPhotos.length === 0 && (!data.videos_terrain || data.videos_terrain.length === 0))}
              style={{ flex: "2 1 240px", background: "#2563eb", borderColor: "#2563eb", fontWeight: 700, padding: "10px 14px" }}
              title="Télécharge l'archive complète avec tous les rapports, photos et vidéos de cette intervention"
            >
              {loadingAction === "downloadZip" ? (
                <span>⏳ {downloadProgressText || "Dossier en cours…"}</span>
              ) : (
                <span>📁 Télécharger l'archive complète (ZIP)</span>
              )}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleCopyText(globalReport)}
              style={{ flex: "1 1 150px", padding: "10px 14px" }}
            >
              {copied ? "✓ Copié !" : "📋 Copier le rapport"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                downloadTextReportFile(
                  globalReport,
                  `Rapport_Global_${sanitizeClientFolderName(data.nom_client || "Client")}.txt`
                )
              }
              style={{ flex: "1 1 140px", padding: "10px 14px" }}
              title="Télécharger le texte du rapport global au format .txt"
            >
              ⬇ Télécharger (.txt)
            </button>
          </div>

          {sendStatus && <p className="gps-status" style={{ marginBottom: 12 }}>{sendStatus}</p>}

          {/* Zone de texte du rapport avec bouton copier flottant */}
          <div className="report-box-wrapper">
            <button
              type="button"
              className="report-copy-floating-btn"
              onClick={() => handleCopyText(globalReport)}
            >
              {copied ? "✓ Copié !" : "📋 Copier"}
            </button>
            <textarea
              className="whatsapp-report"
              readOnly
              value={globalReport}
              rows={16}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>

          {/* SECTION PHOTOS & MÉDIAS DU CLIENT */}
          <div style={{ marginTop: 14, padding: 16, background: "#f8fafc", borderRadius: 14, border: "1px solid #cbd5e1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                  📸 Photos & Vidéos du client
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                  {photoEntries.length} photo{photoEntries.length > 1 ? "s" : ""} CelPros • {photosAdditionnelles.length} additionnelle{photosAdditionnelles.length > 1 ? "s" : ""} • {data.videos_terrain?.length || 0} vidéo{data.videos_terrain?.length > 1 ? "s" : ""}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "3px 10px", borderRadius: 6, fontWeight: 700 }}>
                  ✓ Enregistrées en BDD
                </span>
              </div>
            </div>

            {/* Galerie CelPros & Poteaux */}
            {photoEntries.length > 0 && (
              <div style={{ marginBottom: 14, background: "#fff", padding: 12, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
                    Photos CelPros & Poteaux ({photoEntries.length})
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(105px, 1fr))", gap: 8 }}>
                  {photoEntries.map((pe, peIdx) => {
                    const url = pe.url || pe.photo?.url || pe.photo?.photo || "";
                    if (!url) return null;
                    const lat = pe.photo?.lat;
                    const lng = pe.photo?.lng;
                    const isPole = pe.key.startsWith("poteau_");
                    return (
                      <div
                        key={pe.key || peIdx}
                        style={{ borderRadius: 8, overflow: "hidden", border: isPole ? "1.5px solid #38bdf8" : "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer" }}
                        onClick={() => setViewingPhoto({
                          url,
                          title: pe.label,
                          subtitle: pe.photo?.lieu || (lat != null ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : ""),
                        })}
                        title="Cliquer pour agrandir la photo"
                      >
                        <img
                          src={url}
                          alt={pe.label}
                          style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }}
                        />
                        <div style={{ padding: "4px 5px", fontSize: 10.5, textAlign: "center", fontWeight: 700, color: isPole ? "#0369a1" : "#334155", background: isPole ? "#f0f9ff" : "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={pe.label}>
                          {isPole ? "🪵 " : ""}{pe.label} {lat != null ? "📍" : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Galerie Photos Additionnelles */}
            {photosAdditionnelles.length > 0 && (
              <div style={{ marginBottom: 12, background: "#fff", padding: 12, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
                    Photos additionnelles ({photosAdditionnelles.length})
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                  {photosAdditionnelles.map((ap, apIdx) => (
                    <div
                      key={ap.id || apIdx}
                      style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #cbd5e1", background: "#f1f5f9", cursor: "pointer" }}
                      onClick={() => setViewingPhoto({
                        url: ap.url,
                        title: `Photo additionnelle #${apIdx + 1}`,
                        subtitle: ap.lieu || (ap.lat ? `${ap.lat.toFixed(5)}, ${ap.lng.toFixed(5)}` : ""),
                      })}
                      title="Cliquer pour agrandir la photo"
                    >
                      <img
                        src={ap.url}
                        alt={`Photo additionnelle ${apIdx + 1}`}
                        style={{ width: "100%", height: 75, objectFit: "cover", display: "block" }}
                      />
                      <div style={{ padding: "3px 4px", fontSize: 10.5, textAlign: "center", fontWeight: 700, color: "#475569" }}>
                        #{apIdx + 1} {ap.lat != null ? "📍" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Galerie Vidéos */}
            {Array.isArray(data.videos_terrain) && data.videos_terrain.length > 0 && (
              <div style={{ marginTop: 12, background: "#fff", padding: 12, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
                    📹 Vidéos terrain ({data.videos_terrain.length})
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
                  {data.videos_terrain.map((vid, vidIdx) => (
                    <div
                      key={vid.id || vidIdx}
                      style={{
                        position: "relative",
                        borderRadius: 8,
                        overflow: "hidden",
                        border: "1px solid #cbd5e1",
                        background: "#0f172a",
                      }}
                    >
                      <div
                        style={{
                          position: "relative",
                          cursor: "pointer",
                          aspectRatio: "16 / 10",
                        }}
                        onClick={() => setActiveViewingVideo(vid)}
                        title="Cliquer pour lire la vidéo"
                      >
                        {vid.thumbnail_url ? (
                          <img
                            src={vid.thumbnail_url}
                            alt={vid.label || `Vidéo ${vidIdx + 1}`}
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                            🎬
                          </div>
                        )}
                        <span
                          style={{
                            position: "absolute",
                            top: 4,
                            left: 4,
                            background: "rgba(0,0,0,0.65)",
                            color: "#fff",
                            fontSize: 9.5,
                            fontWeight: 600,
                            padding: "1px 5px",
                            borderRadius: 3,
                            maxWidth: "70%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {vid.label || `Vidéo #${vidIdx + 1}`}
                        </span>
                        {(vid.lat != null || vid.lieu) && (
                          <span
                            style={{
                              position: "absolute",
                              top: 4,
                              right: 4,
                              background: "rgba(15, 23, 42, 0.75)",
                              color: "#facc15",
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "1px 4px",
                              borderRadius: 3,
                            }}
                            title={vid.lieu || (vid.lat ? `${vid.lat.toFixed(5)}, ${vid.lng.toFixed(5)}` : "GPS")}
                          >
                            📍 GPS
                          </span>
                        )}
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background: "rgba(0,0,0,0.65)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontSize: 14,
                          }}
                        >
                          ▶
                        </div>
                        {vid.duration && (
                          <span
                            style={{
                              position: "absolute",
                              bottom: 4,
                              left: 4,
                              background: "rgba(0,0,0,0.75)",
                              color: "#fff",
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "1px 5px",
                              borderRadius: 3,
                            }}
                          >
                            ⏱️ {formatDuration(vid.duration)}
                          </span>
                        )}
                        {vid.size && (
                          <span
                            style={{
                              position: "absolute",
                              bottom: 4,
                              right: 4,
                              background: "rgba(16, 185, 129, 0.85)",
                              color: "#fff",
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "1px 4px",
                              borderRadius: 3,
                            }}
                          >
                            {formatFileSize(vid.size)}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadVideoFile(vid, data.nom_client, vidIdx + 1);
                        }}
                        style={{
                          width: "100%",
                          padding: "5px 0",
                          background: "#1e293b",
                          color: "#f8fafc",
                          border: "none",
                          borderTop: "1px solid #334155",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                        }}
                        title="Télécharger cette vidéo (.mp4) directement"
                      >
                        <span>⬇ Télécharger (.mp4)</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 2 : RAPPORT DE CONFORMITÉ                                          */}
      {/* ========================================================================= */}
      {reportType === "conformite" && (
        <div className="report-tab-panel">
          <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: 10, marginBottom: 14, border: "1px solid #e2e8f0" }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
              ⚖️ Rapport de Conformité & Audit Opérationnel
            </h4>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
              Synthèse technique de contrôle qualité pour le client <strong>{data.nom_client || "Client"}</strong>
            </p>
          </div>

          {/* Barre d'actions */}
          <div className="report-actions-bar">
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleCopyText(conformiteReport)}
              style={{ flex: "1 1 200px", background: "#2563eb", borderColor: "#2563eb", fontWeight: 700, padding: "10px 14px" }}
            >
              {copied ? "✓ Conformité copiée !" : "📋 Copier la Conformité"}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => openWhatsAppText(conformiteReport)}
              style={{ flex: "1 1 200px", background: "#16a34a", borderColor: "#16a34a", fontWeight: 700, padding: "10px 14px" }}
            >
              💬 Partager sur WhatsApp
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                downloadTextReportFile(
                  conformiteReport,
                  `Rapport_Conformite_${sanitizeClientFolderName(data.nom_client || "Client")}.txt`
                )
              }
              style={{ flex: "1 1 180px", padding: "10px 14px", fontWeight: 600 }}
              title="Télécharger le rapport de conformité au format .txt"
            >
              ⬇ Télécharger (.txt)
            </button>
          </div>

          {/* Zone de texte du rapport */}
          <div className="report-box-wrapper">
            <button
              type="button"
              className="report-copy-floating-btn"
              onClick={() => handleCopyText(conformiteReport)}
            >
              {copied ? "✓ Copié !" : "📋 Copier"}
            </button>
            <textarea
              className="whatsapp-report"
              readOnly
              value={conformiteReport}
              rows={16}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>

          {/* Récapitulatif technique rapide de conformité */}
          <div style={{ background: "#ffffff", padding: 16, borderRadius: 12, border: "1px solid #cbd5e1" }}>
            <h4 style={{ margin: "0 0 10px 0", fontSize: 13.5, fontWeight: 700, color: "#334155" }}>
              Points Clés de Contrôle Qualité
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>ONT S/N :</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{data.ont_sn || "—"}</div>
              </div>
              <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>Puissance Optique :</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: (data.puissance_pto_dbm || data.puissance_fat_dbm || data.puissance_signal) ? "#16a34a" : "#64748b" }}>
                  {(data.puissance_pto_dbm || data.puissance_fat_dbm || data.puissance_signal)
                    ? `${data.puissance_pto_dbm || data.puissance_fat_dbm || data.puissance_signal} dBm`
                    : "—"}
                </div>
              </div>
              <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>PTO :</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                  {data.pto_qte ?? data.materiel_pose?.pto ?? data.pto ?? "—"}
                </div>
              </div>
              <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>Câble / Linéaire :</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                  {data.type_cable || data.lineaire_m
                    ? `${data.type_cable || "Câble"}${data.lineaire_m ? ` (${data.lineaire_m} m)` : ""}`
                    : (data.jar || "—")}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 3 : RAPPORT DU JOUR (TOURNÉE CONSOLIDÉE & ARCHIVE DU JOUR)          */}
      {/* ========================================================================= */}
      {reportType === "jour" && (
        <div className="report-tab-panel">
          {/* Cartes KPI du jour */}
          <div className="report-kpi-grid">
            <div className="report-kpi-card">
              <span className="kpi-num">{compteurJour.recus}</span>
              <span className="kpi-label">Dossiers Reçus</span>
            </div>
            <div className="report-kpi-card">
              <span className="kpi-num" style={{ color: "#2563eb" }}>{compteurJour.realises}</span>
              <span className="kpi-label">Dossiers Traités</span>
            </div>
            <div className="report-kpi-card">
              <span className="kpi-num" style={{ color: "#16a34a" }}>{validesJour}</span>
              <span className="kpi-label">Dossiers Validés</span>
            </div>
            <div className="report-kpi-card">
              <span className="kpi-num" style={{ color: "#0891b2" }}>
                {Math.round((validesJour / (compteurJour.recus || 1)) * 100)}%
              </span>
              <span className="kpi-label">Taux de Réussite</span>
            </div>
          </div>

          {/* Barre d'actions Rapport du Jour */}
          <div className="report-actions-bar">
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleCopyText(rapportDuJour)}
              style={{ flex: "1 1 200px", background: "#2563eb", borderColor: "#2563eb", fontWeight: 700, padding: "10px 14px" }}
            >
              {copied ? "✓ Rapport du Jour copié !" : "📋 Copier le rapport du jour"}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => openWhatsAppText(rapportDuJour)}
              style={{ flex: "1 1 200px", background: "#16a34a", borderColor: "#16a34a", fontWeight: 700, padding: "10px 14px" }}
            >
              💬 Partager sur WhatsApp
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                downloadTextReportFile(
                  rapportDuJour,
                  `Rapport_du_Jour_${targetDate || "Aujourdhui"}.txt`
                )
              }
              style={{ flex: "1 1 180px", padding: "10px 14px", fontWeight: 600 }}
              title="Télécharger le rapport du jour au format .txt"
            >
              ⬇ Télécharger (.txt)
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleDownloadDayZip}
              disabled={loadingAction === "downloadDayZip" || todayDossiers.length === 0}
              style={{ flex: "2 1 260px", background: "#7c3aed", borderColor: "#7c3aed", fontWeight: 700, padding: "10px 14px" }}
              title="Télécharge un fichier ZIP unique contenant le rapport du jour et un sous-dossier ordonné pour chaque client avec ses photos et vidéos"
            >
              {loadingAction === "downloadDayZip" ? (
                <span>⏳ {downloadProgressText || "Création de l'archive de la journée…"}</span>
              ) : (
                <span>📁 Télécharger toutes les photos de la journée (ZIP)</span>
              )}
            </button>
          </div>

          {sendStatus && <p className="gps-status" style={{ marginBottom: 12 }}>{sendStatus}</p>}

          {/* Zone de texte du rapport du jour avec bouton flottant */}
          <div className="report-box-wrapper">
            <button
              type="button"
              className="report-copy-floating-btn"
              onClick={() => handleCopyText(rapportDuJour)}
            >
              {copied ? "✓ Copié !" : "📋 Copier"}
            </button>
            <textarea
              className="whatsapp-report"
              readOnly
              value={rapportDuJour}
              rows={14}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>

          {/* Liste détaillée des dossiers de la journée */}
          <div style={{ marginTop: 14, background: "#ffffff", padding: 16, borderRadius: 12, border: "1px solid #cbd5e1" }}>
            <h4 style={{ margin: "0 0 10px 0", fontSize: 14, fontWeight: 700, color: "#334155" }}>
              Dossiers de la tournée ({todayDossiers.length})
            </h4>
            {todayDossiers.map((intv, idx) => {
              const terminee = isInterventionTerminee(intv);
              const isCurrent = intv.id === data.id;
              const celprosCount = collectCelprosPhotos(intv, CELPROS_PHOTO_SLOTS).length;
              const addCount = (Array.isArray(intv.whatsapp_photos) ? intv.whatsapp_photos : []).filter(
                (p) => p && (p.additionnelle || p.is_additionnelle || p.slot === "additionnelle" || String(p.slot).startsWith("additionnelle_") || p.type === "additionnelle")
              ).length;
              const photosCount = celprosCount + addCount || (Array.isArray(intv.whatsapp_photos) ? intv.whatsapp_photos.length : 0);
              return (
                <div key={intv.id || idx} className="report-dossier-item" style={{ borderLeft: isCurrent ? "4px solid #2563eb" : undefined }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: "#64748b", minWidth: 24 }}>
                      {idx + 1}_
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>
                        {intv.nom_client || intv.nom_dossier || "Client sans nom"}
                        {isCurrent && (
                          <span style={{ marginLeft: 6, fontSize: 10.5, background: "#dbeafe", color: "#1e40af", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                            Actuel
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#64748b" }}>
                        📞 {intv.telephone_ligne || intv.mobile || intv.telephone || "—"} • 📍 {intv.adresse_zone || intv.ville || intv.commune || "Zone"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "#64748b" }}>
                      📷 {photosCount} photo{photosCount > 1 ? "s" : ""}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: terminee ? "#dcfce7" : "#fef9c3",
                        color: terminee ? "#15803d" : "#854d0e",
                      }}
                    >
                      {terminee ? "✓ Validé" : "En cours"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 4 : DOCUMENTS OFFICIELS PDF & SIGNATURES                            */}
      {/* ========================================================================= */}
      {reportType === "fiches" && (
        <div className="report-tab-panel">
          <div style={{ padding: 16, background: "#f8fafc", borderRadius: 14, border: "1px solid #cbd5e1" }}>
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

            <button type="button" className="btn-secondary btn-large" onClick={handleShare} disabled={loadingAction === "share"} style={{ marginTop: 14 }}>
              {loadingAction === "share" ? "Chargement…" : "📄 Partager la Fiche Intervention (PDF) sur WhatsApp"}
            </button>

            {satStatus && <p className="gps-status" style={{ marginTop: 8 }}>{satStatus}</p>}
            {pdfStatus && <p className="gps-status" style={{ marginTop: 8 }}>{pdfStatus}</p>}
            {shareStatus && <p className="gps-status" style={{ marginTop: 8 }}>{shareStatus}</p>}
          </div>
        </div>
      )}

      {/* Bouton secondaire modifier l'intervention en bas de page */}
      <button
        type="button"
        className="btn-secondary btn-large"
        onClick={() => onEdit(data)}
        style={{ marginTop: 16, marginBottom: 8 }}
      >
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
      {/* Modal Agrandissement Photo */}
      {viewingPhoto && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.85)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
          onClick={() => setViewingPhoto(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              maxWidth: 700,
              width: "100%",
              overflow: "hidden",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                {viewingPhoto.title || "Photo"}
              </h4>
              <button
                type="button"
                onClick={() => setViewingPhoto(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 18,
                  fontWeight: "bold",
                  cursor: "pointer",
                  color: "#64748b",
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: 12, display: "flex", justifyContent: "center", background: "#0f172a" }}>
              <img
                src={viewingPhoto.url}
                alt={viewingPhoto.title || "Photo"}
                style={{ maxWidth: "100%", maxHeight: "65vh", objectFit: "contain" }}
              />
            </div>
            {viewingPhoto.subtitle && (
              <div style={{ padding: "10px 16px", fontSize: 12, color: "#64748b", background: "#f8fafc" }}>
                📍 {viewingPhoto.subtitle}
              </div>
            )}
          </div>
        </div>
      )}

      {activeViewingVideo && (
        <VideoPlayerModal
          video={activeViewingVideo}
          clientName={data.nom_client || data.nom_dossier}
          onClose={() => setActiveViewingVideo(null)}
        />
      )}
    </div>
  );
}
