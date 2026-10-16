import { useState, useCallback, useEffect, useMemo } from "react";
import { generateGlobalReport, generateConformiteReport } from "../lib/whatsapp";
import { collectCelprosPhotos } from "../lib/slotPhotos";
import { buildShareFiles, shareReportWithPhotos, openWhatsAppText } from "../lib/reportShare";
import { CELPROS_PHOTO_SLOTS } from "./InterventionFormScreen";
import {
  downloadPhotoFile,
  downloadAllPhotosAsZip,
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

export default function ReportScreen({ intervention, onClose, onEdit }) {
  const [data, setData] = useState(ensureInterventionDefaults(intervention));
  const [refreshing, setRefreshing] = useState(false);
  const [downloadProgressText, setDownloadProgressText] = useState("");
  const [shareFiles, setShareFiles] = useState({ files: [], failed: [], ready: false });

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

  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState(() => new Set());

  // Par défaut, sélectionner toutes les photos
  useEffect(() => {
    if (allInterventionPhotos.length > 0) {
      setSelectedPhotoIds(new Set(allInterventionPhotos.map((p) => p.id)));
    }
  }, [allInterventionPhotos]);

  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [sendAddStatus, setSendAddStatus] = useState("");
  const [addShareFiles, setAddShareFiles] = useState({ files: [], failed: [], ready: false });

  // Pré-construction des fichiers photos CelPros
  useEffect(() => {
    let cancelled = false;
    setShareFiles((s) => ({ ...s, ready: false }));
    buildShareFiles(photoEntries).then((res) => {
      if (!cancelled) setShareFiles({ ...res, ready: true });
    });
    return () => {
      cancelled = true;
    };
  }, [photoEntries]);

  // Pré-construction des fichiers photos additionnelles
  useEffect(() => {
    let cancelled = false;
    setAddShareFiles((s) => ({ ...s, ready: false }));
    const entries = photosAdditionnelles.map((p, i) => ({
      key: `additionnelle_${i + 1}`,
      label: `Photo additionnelle ${i + 1}`,
      url: p.url,
      photo: p,
    }));
    buildShareFiles(entries).then((res) => {
      if (!cancelled) setAddShareFiles({ ...res, ready: true });
    });
    return () => {
      cancelled = true;
    };
  }, [photosAdditionnelles]);

  // Les listes en cache sont "légères" (sans photos) : charger la fiche complète à l'ouverture
  useEffect(() => {
    if (!intervention?.id || intervention._fully_loaded) return;
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
  }, [intervention?.id, intervention?._fully_loaded]);

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

  const compteurJour = {
    realises: realises !== "" ? Number(realises) : 0,
    recus: recus !== "" ? Number(recus) : 0,
  };
  const globalReport = generateGlobalReport(data, compteurJour);
  const conformiteReport = generateConformiteReport(data);
  const activeReport = reportType === "conformite" ? conformiteReport : globalReport;

  const selectedPhotos = useMemo(() => {
    return allInterventionPhotos.filter((p) => selectedPhotoIds.has(p.id));
  }, [allInterventionPhotos, selectedPhotoIds]);

  const fullReportWithPhotos = useMemo(() => {
    let msg = (activeReport || "").trim();
    if (selectedPhotos.length > 0) {
      msg += "\n\n━━━━━━━━━━━━━━━━━━━━\n📸 *PHOTOS DE L'INTERVENTION*\n";
      selectedPhotos.forEach((ph, idx) => {
        const label = ph.label || `Photo ${idx + 1}`;
        const url = ph.url || "";
        let coords = "";
        if (ph.lat != null && ph.lng != null) {
          coords = ` (GPS: ${Number(ph.lat).toFixed(5)}, ${Number(ph.lng).toFixed(5)})`;
        }
        msg += `\n${idx + 1}. *${label}*${coords}`;
        if (url) {
          const fullUrl = url.startsWith("http")
            ? url
            : `https://fibretrack.mantota.com${url.startsWith("/") ? "" : "/"}${url}`;
          msg += ` :\n${fullUrl}\n`;
        } else {
          msg += ` : (enregistrée)\n`;
        }
      });
    }
    return msg;
  }, [activeReport, selectedPhotos]);

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

  // 1. Envoi synchrone immédiat sur WhatsApp (Rapport + Liens directs photos)
  function handleOpenWhatsAppDirect(withPhotos = true) {
    const textToSend = withPhotos ? fullReportWithPhotos : activeReport;
    try {
      navigator.clipboard.writeText(textToSend);
    } catch {
      /* ignore */
    }
    const waUrl = `https://wa.me/?text=${encodeURIComponent(textToSend)}`;
    window.open(waUrl, "_blank");
    setSendStatus(
      withPhotos
        ? `✓ WhatsApp ouvert avec le rapport complet et les liens directs de ${selectedPhotos.length} photo(s).`
        : `✓ WhatsApp ouvert avec le texte du rapport.`
    );
  }

  // 2. Partage natif des fichiers images via Web Share API
  async function handleSharePhotoFiles() {
    if (selectedPhotos.length === 0) {
      setSendStatus("Aucune photo sélectionnée.");
      return;
    }
    setLoadingAction("shareFiles");
    try {
      try {
        await navigator.clipboard.writeText(activeReport);
      } catch {
        /* ignore */
      }

      // Android WebView avec pont natif
      if (window.AndroidBridge?.isWebView?.()) {
        const base64Photos = [];
        for (const p of selectedPhotos) {
          const raw = p.url || "";
          const b64 = raw.includes(",") ? raw.split(",")[1] : raw;
          if (b64) base64Photos.push(b64);
        }
        window.AndroidBridge.sharePhotos(JSON.stringify(base64Photos), activeReport);
        setSendStatus("✓ Ouverture de WhatsApp via l'application Android.");
        setLoadingAction(null);
        return;
      }

      const entries = selectedPhotos.map((p, i) => ({
        key: p.key || `ph_${i + 1}`,
        label: p.label || `Photo ${i + 1}`,
        url: p.url,
      }));
      const { files } = await buildShareFiles(entries);

      if (files.length > 0 && navigator.canShare && navigator.canShare({ files })) {
        try {
          await navigator.share({
            title: `Rapport - ${data.nom_client || "Intervention"}`,
            text: activeReport,
            files,
          });
          setSendStatus(`✓ ${files.length} photo(s) transmise(s) vers WhatsApp. Le rapport complet est également copié dans votre presse-papier.`);
          setLoadingAction(null);
          return;
        } catch (shareErr) {
          if (shareErr.name === "AbortError") {
            setLoadingAction(null);
            return;
          }
          console.warn("navigator.share échoué, repli vers wa.me:", shareErr);
        }
      }

      handleOpenWhatsAppDirect(true);
      setSendStatus(
        "Ce navigateur ne prend pas en charge l'envoi direct de fichiers bruts. WhatsApp a été ouvert avec le rapport et les liens directs de chaque photo !"
      );
    } catch (err) {
      setSendStatus(`Erreur : ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  }

  // 3. Téléchargement groupé de toutes les photos dans un dossier au nom du client (ZIP)
  async function handleDownloadAllPhotosZip(photosToDownload = null) {
    const targetList = Array.isArray(photosToDownload) && photosToDownload.length > 0
      ? photosToDownload
      : (selectedPhotos.length > 0 ? selectedPhotos : allInterventionPhotos);

    if (targetList.length === 0) {
      setSendStatus("Aucune photo disponible à télécharger.");
      return;
    }

    setLoadingAction("downloadZip");
    setDownloadProgressText("Préparation du dossier…");
    try {
      const res = await downloadAllPhotosAsZip(targetList, data.nom_client, {
        reportText: activeReport,
        interventionId: data.id,
        onProgress: (_curr, _tot, msg) => setDownloadProgressText(msg),
      });
      setSendStatus(`✓ Dossier '${res.folderName}' (${res.count} photos) téléchargé dans vos Téléchargements !`);
    } catch (err) {
      console.error("Erreur téléchargement zip:", err);
      setSendStatus(`Erreur lors du téléchargement du dossier : ${err.message}`);
    } finally {
      setLoadingAction(null);
      setDownloadProgressText("");
    }
  }

  // 4. Enregistrement direct dans un sous-dossier local (Desktop Chrome / Edge)
  async function handleSaveToLocalFolder(photosToDownload = null) {
    const targetList = Array.isArray(photosToDownload) && photosToDownload.length > 0
      ? photosToDownload
      : (selectedPhotos.length > 0 ? selectedPhotos : allInterventionPhotos);

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

  function handleSendReportWithPhotos() {
    setSelectedPhotoIds(new Set(allInterventionPhotos.map((p) => p.id)));
    setShowWhatsAppModal(true);
  }

  function handleSendAdditionnellesToWhatsapp() {
    setSelectedPhotoIds(new Set(photosAdditionnelles.map((ap) => String(ap.id))));
    setShowWhatsAppModal(true);
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

      {/* SECTION PHOTOS DE L'INTERVENTION */}
      <div style={{ marginTop: 14, padding: 16, background: "#f8fafc", borderRadius: 14, border: "1px solid #cbd5e1" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
              📸 Photos de l'intervention
            </h4>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#64748b" }}>
              {photoEntries.length} photo{photoEntries.length > 1 ? "s" : ""} CelPros • {photosAdditionnelles.length} photo{photosAdditionnelles.length > 1 ? "s" : ""} additionnelle{photosAdditionnelles.length > 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "3px 10px", borderRadius: 6, fontWeight: 700 }}>
              ✓ Enregistrées en BDD
            </span>
            <button
              type="button"
              className="btn-primary"
              style={{ background: "#2563eb", borderColor: "#2563eb", padding: "6px 14px", fontSize: 12.5, fontWeight: 700 }}
              onClick={() => handleDownloadAllPhotosZip(allInterventionPhotos)}
              disabled={loadingAction === "downloadZip" || allInterventionPhotos.length === 0}
              title="Télécharge toutes les photos regroupées dans un dossier au nom du client dans Téléchargements"
            >
              {loadingAction === "downloadZip" ? "⏳ Dossier en cours…" : `📁 Télécharger le dossier photos (${allInterventionPhotos.length})`}
            </button>
          </div>
        </div>

        {/* Galerie des photos additionnelles */}
        {photosAdditionnelles.length > 0 ? (
          <div style={{ marginBottom: 12, background: "#fff", padding: 12, borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
                Photos additionnelles ({photosAdditionnelles.length})
              </span>
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: 12, padding: "5px 12px", background: "#16a34a", borderColor: "#16a34a" }}
                onClick={handleSendAdditionnellesToWhatsapp}
              >
                📤 Envoyer ces photos ({photosAdditionnelles.length}) sur WhatsApp
              </button>
            </div>
            {sendAddStatus && <p className="gps-status" style={{ margin: "4px 0 8px" }}>{sendAddStatus}</p>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
              {photosAdditionnelles.map((ap, apIdx) => (
                <div key={ap.id || apIdx} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #cbd5e1", background: "#f1f5f9" }}>
                  <img
                    src={ap.url}
                    alt={`Photo additionnelle ${apIdx + 1}`}
                    style={{ width: "100%", height: 75, objectFit: "cover", display: "block", cursor: "pointer" }}
                    onClick={() => setViewingPhoto({
                      url: ap.url,
                      title: `Photo additionnelle #${apIdx + 1}`,
                      subtitle: ap.lieu || (ap.lat ? `${ap.lat.toFixed(5)}, ${ap.lng.toFixed(5)}` : ""),
                    })}
                  />
                  <div style={{ padding: "3px 4px", fontSize: 10.5, textAlign: "center", fontWeight: 700, color: "#475569" }}>
                    #{apIdx + 1} {ap.lat != null ? "📍" : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
            Aucune photo additionnelle enregistrée pour cette intervention.
          </p>
        )}
      </div>

      <button type="button" className="btn-secondary btn-large" onClick={handleShare} disabled={loadingAction === "share"} style={{ marginTop: 12 }}>
        {loadingAction === "share" ? "Chargement…" : "📄 Partager la Fiche Intervention (PDF) sur WhatsApp"}
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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button
          type="button"
          className="btn-primary btn-large"
          onClick={handleSendReportWithPhotos}
          style={{ flex: "2 1 280px", background: "#16a34a", borderColor: "#16a34a", fontSize: 15, fontWeight: 700 }}
        >
          💬 Envoyer sur WhatsApp avec les photos ({allInterventionPhotos.length})
        </button>
        <button
          type="button"
          className="btn-primary btn-large"
          onClick={() => handleDownloadAllPhotosZip(allInterventionPhotos)}
          disabled={loadingAction === "downloadZip" || allInterventionPhotos.length === 0}
          style={{ flex: "2 1 260px", background: "#2563eb", borderColor: "#2563eb", fontSize: 15, fontWeight: 700 }}
          title="Télécharge toutes les photos regroupées dans un dossier au nom du client dans Téléchargements"
        >
          {loadingAction === "downloadZip" ? (
            <span>⏳ {downloadProgressText || "Préparation du dossier…"}</span>
          ) : (
            <span>📁 Télécharger toutes les photos ({allInterventionPhotos.length})</span>
          )}
        </button>
        <button
          type="button"
          className="btn-primary btn-large"
          onClick={() => handleOpenWhatsAppDirect(true)}
          style={{ flex: "1 1 220px", background: "#059669", borderColor: "#059669" }}
          title="Ouvre directement WhatsApp avec le rapport et tous les liens photos cliquables"
        >
          🚀 Envoi direct WhatsApp
        </button>
        <button type="button" className="btn-secondary btn-large" onClick={handleCopy} style={{ flex: "1 1 160px" }}>
          {copied ? "✓ Rapport copié !" : `📋 Copier ${reportType === "conformite" ? "la Conformité" : "le Rapport"}`}
        </button>
        <button
          type="button"
          className="btn-secondary btn-large"
          onClick={() => handleOpenWhatsAppDirect(false)}
          title="Ouvre WhatsApp avec le texte seul (sans photos)"
          style={{ flex: "1 1 120px" }}
        >
          Texte seul
        </button>
      </div>
      {sendStatus && <p className="gps-status" style={{ marginTop: 8 }}>{sendStatus}</p>}

      <button type="button" className="btn-secondary btn-large" onClick={() => onEdit(intervention)} style={{ marginTop: 12 }}>
        ✏ Modifier cette intervention
      </button>

      {/* Modal Partage WhatsApp & Photos */}
      {showWhatsAppModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.75)",
            zIndex: 9995,
            overflowY: "auto",
            padding: "20px 10px",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
          }}
          onClick={() => setShowWhatsAppModal(false)}
        >
          <div
            style={{
              maxWidth: 680,
              width: "100%",
              background: "#ffffff",
              borderRadius: 16,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              overflow: "hidden",
              border: "1px solid #cbd5e1",
              margin: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ background: "#16a34a", padding: "16px 20px", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>💬</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#fff" }}>
                    Envoi WhatsApp : Rapport & Photos
                  </h3>
                  <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.9 }}>
                    Client : <strong>{data.nom_client || "Client"}</strong> • {reportType === "conformite" ? "Rapport de Conformité" : "Rapport Global"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWhatsAppModal(false)}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: "none",
                  color: "#fff",
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  cursor: "pointer",
                  fontSize: 16,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>

            {/* Corps */}
            <div style={{ padding: 20 }}>
              {/* Actions principales au sommet */}
              <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 12, padding: 14, marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#166534", marginBottom: 6 }}>
                  ⚡ Envoi Recommandé (100% Garanti sur Mobile & PC)
                </div>
                <p style={{ margin: "0 0 12px 0", fontSize: 12.5, color: "#1e3a8a", lineHeight: 1.4 }}>
                  Ouvre WhatsApp avec le <strong>rapport officiel complet</strong> ET les <strong>liens directs HD</strong> de toutes les photos sélectionnées ({selectedPhotos.length} photo{selectedPhotos.length > 1 ? "s" : ""}).
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ background: "#16a34a", borderColor: "#16a34a", fontSize: 14, padding: "10px 18px", fontWeight: 700, flex: "1 1 220px" }}
                    onClick={() => {
                      handleOpenWhatsAppDirect(true);
                      setShowWhatsAppModal(false);
                    }}
                  >
                    🚀 Ouvrir WhatsApp (Rapport + {selectedPhotos.length} photo{selectedPhotos.length > 1 ? "s" : ""})
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: 13, padding: "10px 14px", flex: "1 1 140px" }}
                    onClick={() => {
                      navigator.clipboard.writeText(fullReportWithPhotos);
                      setSendStatus("✓ Rapport complet et liens photos copiés dans le presse-papier !");
                    }}
                  >
                    📋 Copier Tout
                  </button>
                </div>
              </div>

              {/* Option Téléchargement en Dossier Groupé au nom du client */}
              <div style={{ background: "#eff6ff", border: "1.5px solid #93c5fd", borderRadius: 12, padding: 14, marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e40af", marginBottom: 6 }}>
                  📁 Télécharger toutes les photos dans un dossier ({selectedPhotos.length})
                </div>
                <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "#1e3a8a", lineHeight: 1.4 }}>
                  Télécharge un dossier zippé nommé <strong>{sanitizeClientFolderName(data.nom_client)}</strong> dans vos Téléchargements, contenant toutes les photos numérotées et ordonnées ainsi que le rapport texte. Vous pourrez ensuite envoyer directement le dossier ou son contenu sur WhatsApp.
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ background: "#2563eb", borderColor: "#2563eb", fontSize: 13, padding: "10px 16px", fontWeight: 700, flex: "2 1 220px" }}
                    onClick={() => handleDownloadAllPhotosZip(selectedPhotos)}
                    disabled={loadingAction === "downloadZip" || selectedPhotos.length === 0}
                  >
                    {loadingAction === "downloadZip" ? (
                      <span>⏳ {downloadProgressText || "Création du dossier…"}</span>
                    ) : (
                      <span>📁 Télécharger le dossier photos ({selectedPhotos.length})</span>
                    )}
                  </button>
                  {typeof window !== "undefined" && typeof window.showDirectoryPicker === "function" && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 13, padding: "10px 14px", flex: "1 1 180px" }}
                      onClick={() => handleSaveToLocalFolder(selectedPhotos)}
                      disabled={loadingAction === "saveFolder" || selectedPhotos.length === 0}
                      title="Enregistre directement dans un vrai sous-dossier sur votre PC"
                    >
                      {loadingAction === "saveFolder" ? "⏳ Écriture…" : "📂 Dossier local (PC)"}
                    </button>
                  )}
                </div>
              </div>

              {/* Autre option : partage natif des fichiers */}
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                  📱 Partage direct des Fichiers Images (Mobile)
                </div>
                <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "#64748b" }}>
                  Envoie directement les fichiers photos dans l'application WhatsApp (mobile). Le texte du rapport est automatiquement copié dans votre presse-papier pour pouvoir être collé si besoin.
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: 13, padding: "8px 14px", flex: "1 1 180px" }}
                    onClick={handleSharePhotoFiles}
                    disabled={loadingAction === "shareFiles" || selectedPhotos.length === 0}
                  >
                    {loadingAction === "shareFiles" ? "Préparation…" : "📤 Partager les fichiers photos"}
                  </button>
                </div>
              </div>

              {/* Sélection des photos */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                    Photos à inclure ({selectedPhotoIds.size} / {allInterventionPhotos.length})
                  </h4>
                  <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
                    <button
                      type="button"
                      style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontWeight: 600, padding: 0 }}
                      onClick={() => setSelectedPhotoIds(new Set(allInterventionPhotos.map((p) => p.id)))}
                    >
                      Tout cocher
                    </button>
                    <span style={{ color: "#cbd5e1" }}>|</span>
                    <button
                      type="button"
                      style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontWeight: 600, padding: 0 }}
                      onClick={() => setSelectedPhotoIds(new Set())}
                    >
                      Tout décocher
                    </button>
                  </div>
                </div>

                {allInterventionPhotos.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "#64748b", fontStyle: "italic" }}>
                    Aucune photo enregistrée sur cette intervention.
                  </p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, maxHeight: 280, overflowY: "auto", padding: 4 }}>
                    {allInterventionPhotos.map((ph) => {
                      const isChecked = selectedPhotoIds.has(ph.id);
                      return (
                        <div
                          key={ph.id}
                          onClick={() => {
                            setSelectedPhotoIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(ph.id)) next.delete(ph.id);
                              else next.add(ph.id);
                              return next;
                            });
                          }}
                          style={{
                            border: isChecked ? "2px solid #16a34a" : "1px solid #cbd5e1",
                            background: isChecked ? "#f0fdf4" : "#ffffff",
                            borderRadius: 10,
                            overflow: "hidden",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            display: "flex",
                            flexDirection: "column",
                          }}
                        >
                          <div style={{ position: "relative", height: 80, background: "#f1f5f9" }}>
                            <img
                              src={ph.url}
                              alt={ph.label}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              style={{
                                position: "absolute",
                                top: 6,
                                right: 6,
                                width: 18,
                                height: 18,
                                accentColor: "#16a34a",
                                cursor: "pointer",
                              }}
                            />
                            {ph.isAdditionnelle && (
                              <span style={{ position: "absolute", bottom: 4, left: 4, background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 9.5, padding: "2px 5px", borderRadius: 4, fontWeight: 700 }}>
                                Terrain
                              </span>
                            )}
                          </div>
                          <div style={{ padding: "6px 8px", fontSize: 11, fontWeight: 600, color: "#334155", lineHeight: 1.25 }}>
                            {ph.label}
                            {ph.lat != null && <div style={{ fontSize: 9.5, color: "#64748b", marginTop: 2 }}>📍 GPS ok</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Aperçu rapide du message */}
              <details style={{ marginTop: 12, background: "#f8fafc", borderRadius: 8, padding: "8px 12px", border: "1px solid #e2e8f0" }}>
                <summary style={{ fontSize: 12, fontWeight: 700, color: "#475569", cursor: "pointer" }}>
                  👁️ Voir l'aperçu du message qui sera transmis à WhatsApp
                </summary>
                <textarea
                  readOnly
                  rows={8}
                  value={fullReportWithPhotos}
                  style={{ width: "100%", marginTop: 8, fontSize: 11, fontFamily: "monospace", padding: 8, borderRadius: 6, border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                />
              </details>
            </div>

            {/* Footer */}
            <div style={{ background: "#f1f5f9", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowWhatsAppModal(false)}
              >
                Fermer
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ background: "#16a34a", borderColor: "#16a34a", fontWeight: 700 }}
                onClick={() => {
                  handleOpenWhatsAppDirect(true);
                  setShowWhatsAppModal(false);
                }}
              >
                🚀 Ouvrir WhatsApp maintenant
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
