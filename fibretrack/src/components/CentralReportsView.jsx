import { useState, useEffect, useMemo, useCallback } from "react";
import {
  generateGlobalReport,
  generateConformiteReport,
  generateRapportDuJour,
  fmt2,
} from "../lib/whatsapp";
import { collectCelprosPhotos } from "../lib/slotPhotos";
import { CELPROS_PHOTO_SLOTS } from "../screens/InterventionFormScreen";
import {
  isInterventionTerminee,
  isInterventionEnCours,
  isInterventionNonTraitee,
  isInterventionSupprimee,
} from "../lib/interventionFilters";
import {
  getIntervention,
  getStoredIntervention,
  saveInterventionLocally,
  ensureInterventionDefaults,
} from "../models/Intervention";
import {
  downloadAllPhotosAsZip,
  downloadDayPhotosAsZip,
  downloadVideoFile,
  downloadTextReportFile,
  downloadPhotoFile,
  sanitizeClientFolderName,
} from "../lib/photoDownload";
import {
  generateSummaryReportPdf,
  previewSummaryReportPdf,
  generateFichesPdf,
  previewFichesPdf,
} from "../lib/pdf";
import { openWhatsAppText } from "../lib/reportShare";
import { formatDuration, formatFileSize } from "../lib/videoCompression";
import VideoPlayerModal from "./VideoPlayerModal";
import PhotoViewerModal from "./PhotoViewerModal";
import {
  IconFileText,
  IconCheckCircle,
  IconZap,
  IconSearch,
  IconRefresh,
  IconChart,
} from "./Icons";

export default function CentralReportsView({
  interventions = [],
  techniciens = [],
  onOpenIntervention,
  onOpenReport,
  currentUser = "",
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'terminees' | 'en_cours' | 'non_traitees'
  const [technicienFilter, setTechnicienFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [activeReportTabByIntv, setActiveReportTabByIntv] = useState({}); // { [intvId]: 'global' | 'conformite' | 'jour' }
  const [expandedIntvId, setExpandedIntvId] = useState(null);
  const [loadingAction, setLoadingAction] = useState(null);
  const [progressMsg, setProgressMsg] = useState("");
  const [feedback, setFeedback] = useState("");
  const [activeViewingVideo, setActiveViewingVideo] = useState(null);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 8;

  // Filtrer les interventions non supprimées
  const activeInterventions = useMemo(() => {
    return (interventions || []).filter((i) => i && !isInterventionSupprimee(i));
  }, [interventions]);

  // Compteurs par statut pour les onglets filtres
  const counts = useMemo(() => {
    let terminees = 0;
    let enCours = 0;
    let nonTraitees = 0;
    for (const intv of activeInterventions) {
      if (isInterventionTerminee(intv)) terminees++;
      else if (isInterventionNonTraitee(intv)) nonTraitees++;
      else if (isInterventionEnCours(intv)) enCours++;
    }
    return {
      all: activeInterventions.length,
      terminees,
      enCours,
      nonTraitees,
    };
  }, [activeInterventions]);

  // Filtrage combiné : recherche, statut, technicien, date
  const filteredInterventions = useMemo(() => {
    const q = (searchQuery || "").trim().toLowerCase();
    return activeInterventions.filter((intv) => {
      // 1. Statut
      if (statusFilter === "terminees" && !isInterventionTerminee(intv)) return false;
      if (statusFilter === "en_cours" && !isInterventionEnCours(intv)) return false;
      if (statusFilter === "non_traitees" && !isInterventionNonTraitee(intv)) return false;

      // 2. Technicien
      if (technicienFilter !== "all") {
        const t = (intv.nom_technicien || "").trim().toLowerCase();
        if (t !== technicienFilter.toLowerCase()) return false;
      }

      // 3. Date
      if (dateFilter) {
        const intvDate = intv.tournee_du_jour || (intv.date ? String(intv.date).slice(0, 10) : "");
        if (intvDate !== dateFilter) return false;
      }

      // 4. Recherche textuelle multi-critères
      if (q) {
        const matchName = (intv.nom_client || "").toLowerCase().includes(q);
        const matchDossier = (intv.nom_dossier || "").toLowerCase().includes(q);
        const matchTel = (intv.telephone_ligne || "").toLowerCase().includes(q);
        const matchMob = (intv.mobile || "").toLowerCase().includes(q);
        const matchId = (intv.id || "").toLowerCase().includes(q);
        const matchTech = (intv.nom_technicien || "").toLowerCase().includes(q);
        const matchZone = (intv.adresse_zone || "").toLowerCase().includes(q);
        const matchMsan = (intv.msan || "").toLowerCase().includes(q);
        const matchFat = (intv.fat_ref || "").toLowerCase().includes(q);
        if (
          !matchName &&
          !matchDossier &&
          !matchTel &&
          !matchMob &&
          !matchId &&
          !matchTech &&
          !matchZone &&
          !matchMsan &&
          !matchFat
        ) {
          return false;
        }
      }

      return true;
    });
  }, [activeInterventions, statusFilter, technicienFilter, dateFilter, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredInterventions.length / pageSize) || 1;
  const paginatedInterventions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredInterventions.slice(start, start + pageSize);
  }, [filteredInterventions, page, pageSize]);

  // Par défaut développer la première intervention si aucune n'est sélectionnée
  useEffect(() => {
    if (!expandedIntvId && paginatedInterventions.length > 0) {
      setExpandedIntvId(paginatedInterventions[0].id);
    }
  }, [paginatedInterventions, expandedIntvId]);

  function handleCopyReport(text, keyId) {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedId(keyId);
      setTimeout(() => setCopiedId(null), 2500);
    } catch (e) {
      console.warn("Copy error:", e);
    }
  }

  // Téléchargement archive ZIP complète (Rapports .txt & .pdf + Photos + Vidéos) pour une intervention
  async function handleDownloadInterventionZip(intv) {
    if (loadingAction || !intv?.id) return;
    const actionKey = `zip_${intv.id}`;
    setLoadingAction(actionKey);
    setProgressMsg("Récupération complète des données et médias…");
    try {
      // 1. Récupérer l'intervention complète (BDD + cache local)
      let full = await getIntervention(intv.id);
      if (!full) full = getStoredIntervention(intv.id) || intv;
      const defaulted = ensureInterventionDefaults(full);

      // 2. Extraire toutes les photos
      const photoEntries = collectCelprosPhotos(defaulted, CELPROS_PHOTO_SLOTS);
      const additionnelles = (defaulted.whatsapp_photos || []).filter(
        (p) => p && (p.additionnelle || p.is_additionnelle || p.slot === "additionnelle" || String(p.slot).startsWith("additionnelle_") || p.type === "additionnelle")
      );
      const photosToDownload = [];
      const seen = new Set();
      for (const pe of photoEntries) {
        const url = pe.url || pe.photo?.url || pe.photo?.photo || "";
        if (url && !seen.has(url)) {
          seen.add(url);
          photosToDownload.push({
            id: String(pe.photo?.id || pe.key),
            key: pe.key,
            label: pe.label,
            url,
            lat: pe.photo?.lat,
            lng: pe.photo?.lng,
            lieu: pe.photo?.lieu,
          });
        }
      }
      additionnelles.forEach((ap, idx) => {
        const url = ap.url || ap.photo || "";
        if (url && !seen.has(url)) {
          seen.add(url);
          photosToDownload.push({
            id: String(ap.id || `additionnelle_${idx + 1}`),
            key: `additionnelle_${idx + 1}`,
            label: ap.label || ap.name || `Photo additionnelle #${idx + 1}`,
            url,
            lat: ap.lat,
            lng: ap.lng,
            lieu: ap.lieu,
          });
        }
      });

      // 3. Générer les 3 rapports texte
      const targetDate = defaulted.tournee_du_jour || (defaulted.date ? String(defaulted.date).slice(0, 10) : new Date().toISOString().slice(0, 10));
      const sameDayDossiers = activeInterventions.filter((d) => {
        const dDate = d.tournee_du_jour || (d.date ? String(d.date).slice(0, 10) : "");
        return dDate === targetDate;
      });
      const validesCount = sameDayDossiers.filter((d) => isInterventionTerminee(d) || d.id === defaulted.id).length;
      const compteur = { realises: validesCount, recus: sameDayDossiers.length || 1 };

      const globalReport = generateGlobalReport(defaulted, compteur);
      const conformiteReport = generateConformiteReport(defaulted);
      const rapportDuJour = generateRapportDuJour(sameDayDossiers, defaulted, {
        date: targetDate,
        totalRecus: compteur.recus,
        countTraites: compteur.realises,
        countValides: validesCount,
      });

      // 4. Télécharger le ZIP complet
      const res = await downloadAllPhotosAsZip(photosToDownload, defaulted.nom_client || "Client", {
        reportText: globalReport,
        reports: {
          globalReport,
          conformiteReport,
          rapportDuJour,
        },
        interventionId: defaulted.id,
        videos: defaulted.videos_terrain || [],
        onProgress: (_curr, _tot, msg) => setProgressMsg(msg),
      });

      setFeedback(`✓ Dossier complet '${res.folderName}' (${res.count} photos, ${res.videoCount || 0} vidéos) téléchargé avec succès !`);
      setTimeout(() => setFeedback(""), 8000);
    } catch (err) {
      console.error("Erreur téléchargement archive:", err);
      setFeedback(`Erreur de téléchargement : ${err.message}`);
    } finally {
      setLoadingAction(null);
      setProgressMsg("");
    }
  }

  // Téléchargement groupé de toutes les interventions de la journée
  async function handleDownloadDayArchive() {
    if (loadingAction) return;
    const targetDate = dateFilter || new Date().toISOString().slice(0, 10);
    const dayDossiers = activeInterventions.filter((d) => {
      const dDate = d.tournee_du_jour || (d.date ? String(d.date).slice(0, 10) : "");
      return dDate === targetDate;
    });

    if (dayDossiers.length === 0) {
      alert(`Aucune intervention trouvée pour la date du ${targetDate}.`);
      return;
    }

    setLoadingAction("day_zip");
    setProgressMsg(`Synchronisation des interventions du ${targetDate}…`);
    try {
      const hydrated = await Promise.all(
        dayDossiers.map(async (d) => {
          if (!d?.id) return d;
          try {
            const fresh = await getIntervention(d.id);
            if (fresh) return ensureInterventionDefaults(fresh);
          } catch {}
          return getStoredIntervention(d.id) || ensureInterventionDefaults(d);
        })
      );

      const valides = hydrated.filter((d) => isInterventionTerminee(d)).length;
      const dayReportText = generateRapportDuJour(hydrated, hydrated[0] || {}, {
        date: targetDate,
        totalRecus: hydrated.length,
        countTraites: valides,
        countValides: valides,
      });

      const res = await downloadDayPhotosAsZip(hydrated, {
        date: targetDate,
        reportText: dayReportText,
        onProgress: (_curr, _tot, msg) => setProgressMsg(msg),
      });

      setFeedback(`✓ Archive journalière '${res.zipName}' (${res.totalPhotos} photos, ${res.totalVideos} vidéos) téléchargée avec succès !`);
      setTimeout(() => setFeedback(""), 8000);
    } catch (err) {
      console.error("Erreur téléchargement archive journée:", err);
      setFeedback(`Erreur archive journée : ${err.message}`);
    } finally {
      setLoadingAction(null);
      setProgressMsg("");
    }
  }

  return (
    <div className="central-reports-view" style={{ maxWidth: 1200, margin: "0 auto", padding: "12px 14px" }}>
      {/* ===== EN-TÊTE PRINCIPAL ===== */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
          background: "#ffffff",
          padding: "16px 20px",
          borderRadius: 14,
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <IconFileText size={22} style={{ color: "#2563eb" }} />
            <span>Gestion des Rapports d'Intervention</span>
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Consultation, recherche et export des 3 catégories de rapports (Global, Conformité, Jour) avec photos et vidéos HD.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className="btn-primary"
            onClick={handleDownloadDayArchive}
            disabled={loadingAction === "day_zip"}
            style={{
              background: "#7c3aed",
              borderColor: "#7c3aed",
              fontWeight: 700,
              padding: "9px 14px",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
            }}
            title="Télécharge un fichier ZIP complet contenant tous les dossiers, rapports, photos et vidéos de la journée"
          >
            {loadingAction === "day_zip" ? (
              <span>⏳ {progressMsg || "Création de l'archive…"}</span>
            ) : (
              <>
                <span>📦 Télécharger l'archive du jour (ZIP)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Message de notification / feedback */}
      {feedback && (
        <div
          style={{
            padding: "10px 16px",
            marginBottom: 14,
            borderRadius: 10,
            background: feedback.startsWith("Erreur") ? "#fee2e2" : "#dcfce7",
            color: feedback.startsWith("Erreur") ? "#b91c1c" : "#166534",
            border: feedback.startsWith("Erreur") ? "1px solid #fca5a5" : "1px solid #86efac",
            fontWeight: 600,
            fontSize: 13.5,
          }}
        >
          {feedback}
        </div>
      )}

      {/* ===== BARRE DE RECHERCHE ET FILTRES ===== */}
      <div
        style={{
          background: "#ffffff",
          padding: "14px 18px",
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          marginBottom: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}
      >
        {/* Recherche multi-critères */}
        <div className="home-search-box" style={{ marginBottom: 12 }}>
          <span className="search-icon" aria-hidden="true">
            <IconSearch size={18} />
          </span>
          <input
            type="search"
            className="home-search-input"
            placeholder="Rechercher par client, téléphone, mobile, technicien, zone, MSAN, FAT ou ID…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            aria-label="Rechercher des rapports d'intervention"
          />
          {searchQuery && (
            <button
              type="button"
              className="home-search-clear-btn"
              onClick={() => {
                setSearchQuery("");
                setPage(1);
              }}
              title="Effacer la recherche"
            >
              ✕
            </button>
          )}
        </div>

        {/* Ligne des filtres statut, technicien et date */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          {/* Onglets Filtres Statut */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className={`search-pill ${statusFilter === "all" ? "is-active" : ""}`}
              onClick={() => {
                setStatusFilter("all");
                setPage(1);
              }}
            >
              Tous ({counts.all})
            </button>
            <button
              type="button"
              className={`search-pill ${statusFilter === "terminees" ? "is-active" : ""}`}
              onClick={() => {
                setStatusFilter("terminees");
                setPage(1);
              }}
              style={statusFilter === "terminees" ? { background: "#16a34a", borderColor: "#16a34a", color: "#fff" } : {}}
            >
              Terminées ({counts.terminees})
            </button>
            <button
              type="button"
              className={`search-pill ${statusFilter === "en_cours" ? "is-active" : ""}`}
              onClick={() => {
                setStatusFilter("en_cours");
                setPage(1);
              }}
              style={statusFilter === "en_cours" ? { background: "#0284c7", borderColor: "#0284c7", color: "#fff" } : {}}
            >
              En cours ({counts.enCours})
            </button>
            <button
              type="button"
              className={`search-pill ${statusFilter === "non_traitees" ? "is-active" : ""}`}
              onClick={() => {
                setStatusFilter("non_traitees");
                setPage(1);
              }}
              style={statusFilter === "non_traitees" ? { background: "#ea580c", borderColor: "#ea580c", color: "#fff" } : {}}
            >
              Non traitées ({counts.nonTraitees})
            </button>
          </div>

          {/* Filtres secondaires : Technicien & Date */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <label htmlFor="report-tech-filter" style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>
                Tech:
              </label>
              <select
                id="report-tech-filter"
                className="filter-select"
                value={technicienFilter}
                onChange={(e) => {
                  setTechnicienFilter(e.target.value);
                  setPage(1);
                }}
                style={{ padding: "5px 8px", fontSize: 12.5 }}
              >
                <option value="all">Tous ({techniciens.length})</option>
                {techniciens.map((tech) => (
                  <option key={tech} value={tech}>
                    {tech}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <label htmlFor="report-date-filter" style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>
                Date:
              </label>
              <input
                id="report-date-filter"
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setPage(1);
                }}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  fontSize: 12.5,
                  background: "#fff",
                }}
              />
            </div>

            {(searchQuery || statusFilter !== "all" || technicienFilter !== "all" || dateFilter) && (
              <button
                type="button"
                className="filter-reset-btn"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setTechnicienFilter("all");
                  setDateFilter("");
                  setPage(1);
                }}
                style={{ padding: "4px 8px", fontSize: 12 }}
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===== LISTE DES RAPPORTS D'INTERVENTION ===== */}
      {paginatedInterventions.length === 0 ? (
        <div className="empty-state" style={{ background: "#ffffff", padding: 32, borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, color: "#94a3b8" }}>
            <IconSearch size={38} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#1e293b", marginBottom: 4 }}>
            Aucun rapport trouvé
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
            Aucune intervention ne correspond à vos critères de recherche.
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
              setTechnicienFilter("all");
              setDateFilter("");
              setPage(1);
            }}
          >
            Effacer les filtres
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {paginatedInterventions.map((intv) => {
            const isExpanded = expandedIntvId === intv.id;
            const terminee = isInterventionTerminee(intv);
            const enCours = isInterventionEnCours(intv);
            const nonTraite = isInterventionNonTraitee(intv);

            // Données de base
            const clientName = intv.nom_client || intv.nom_dossier || "Client sans nom";
            const dateStr = intv.tournee_du_jour || (intv.date ? String(intv.date).slice(0, 10) : "");
            const nbPhotos = (intv.whatsapp_photos || []).length;
            const nbVideos = (intv.videos_terrain || []).length;
            const activeTab = activeReportTabByIntv[intv.id] || "global";

            // Calcul du rapport pour cette intervention spécifique
            const targetDate = intv.tournee_du_jour || (intv.date ? String(intv.date).slice(0, 10) : new Date().toISOString().slice(0, 10));
            const sameDayList = activeInterventions.filter((d) => {
              const dDate = d.tournee_du_jour || (d.date ? String(d.date).slice(0, 10) : "");
              return dDate === targetDate;
            });
            const countTraites = sameDayList.filter((d) => isInterventionTerminee(d) || d.id === intv.id).length;
            const compteurJour = { realises: countTraites, recus: sameDayList.length || 1 };

            const fullIntv = getStoredIntervention(intv.id) || intv;
            const globalReport = generateGlobalReport(fullIntv, compteurJour);
            const conformiteReport = generateConformiteReport(fullIntv);
            const rapportDuJour = generateRapportDuJour(sameDayList, fullIntv, {
              date: targetDate,
              totalRecus: compteurJour.recus,
              countTraites: compteurJour.realises,
              countValides: countTraites,
            });

            const currentReportText =
              activeTab === "conformite" ? conformiteReport : activeTab === "jour" ? rapportDuJour : globalReport;

            return (
              <div
                key={intv.id}
                style={{
                  background: "#ffffff",
                  borderRadius: 14,
                  border: isExpanded ? "2px solid #3b82f6" : "1px solid #e2e8f0",
                  overflow: "hidden",
                  boxShadow: isExpanded ? "0 4px 12px rgba(59, 130, 246, 0.08)" : "0 1px 3px rgba(0,0,0,0.03)",
                  transition: "all 0.2s ease",
                }}
              >
                {/* En-tête de carte intervention cliquable pour déplier */}
                <div
                  style={{
                    padding: "14px 18px",
                    background: isExpanded ? "#f8fafc" : "#ffffff",
                    borderBottom: isExpanded ? "1px solid #e2e8f0" : "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 10,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandedIntvId(isExpanded ? null : intv.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 700,
                        background: terminee
                          ? "#f0fdf4"
                          : nonTraite
                          ? "#fff7ed"
                          : "#f0f9ff",
                        color: terminee
                          ? "#16a34a"
                          : nonTraite
                          ? "#ea580c"
                          : "#0284c7",
                        border: terminee
                          ? "1px solid #bbf7d0"
                          : nonTraite
                          ? "1px solid #fed7aa"
                          : "1px solid #bae6fd",
                      }}
                    >
                      {terminee ? "✓ Terminée" : nonTraite ? "✕ Non traitée" : "⚡ En cours"}
                    </span>

                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                        {clientName}
                      </h3>
                      <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#64748b" }}>
                        {dateStr && <span>📅 {dateStr} • </span>}
                        {intv.nom_technicien && <span>👤 {intv.nom_technicien} • </span>}
                        {(intv.telephone_ligne || intv.mobile) && (
                          <span>📞 {intv.telephone_ligne || intv.mobile} • </span>
                        )}
                        {(intv.msan || intv.fat_ref) && (
                          <span>🏷️ {intv.msan || ""} {intv.fat_ref ? `FAT ${intv.fat_ref}` : ""} • </span>
                        )}
                        <span>📸 {nbPhotos} photo{nbPhotos > 1 ? "s" : ""}</span>
                        {nbVideos > 0 && <span> • 📹 {nbVideos} vidéo{nbVideos > 1 ? "s" : ""}</span>}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (typeof onOpenReport === "function") {
                          onOpenReport(intv);
                        } else if (typeof onOpenIntervention === "function") {
                          onOpenIntervention(intv);
                        }
                      }}
                      style={{ padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}
                      title="Ouvrir l'écran complet du rapport pour cette intervention"
                    >
                      👁️ Vue complète
                    </button>

                    <button
                      type="button"
                      className="btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadInterventionZip(intv);
                      }}
                      disabled={loadingAction === `zip_${intv.id}`}
                      style={{
                        padding: "6px 12px",
                        fontSize: 12.5,
                        fontWeight: 700,
                        background: "#2563eb",
                        borderColor: "#2563eb",
                      }}
                      title="Télécharger l'archive ZIP complète avec tous les rapports, photos et vidéos de cette intervention"
                    >
                      {loadingAction === `zip_${intv.id}` ? (
                        <span>⏳ Préparation…</span>
                      ) : (
                        <span>📁 Télécharger tout (ZIP)</span>
                      )}
                    </button>

                    <span style={{ fontSize: 16, color: "#64748b", transform: isExpanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s ease" }}>
                      ▼
                    </span>
                  </div>
                </div>

                {/* Contenu détaillé du rapport lorsque déplié */}
                {isExpanded && (
                  <div style={{ padding: "16px 20px", background: "#ffffff" }}>
                    {/* Bannière motif non traité si applicable */}
                    {nonTraite && intv.motif_non_traite && (
                      <div
                        style={{
                          background: "#fff7ed",
                          border: "1px solid #fed7aa",
                          borderRadius: 8,
                          padding: "8px 12px",
                          marginBottom: 14,
                          fontSize: 13,
                          color: "#9a3412",
                          fontWeight: 600,
                        }}
                      >
                        ⚠️ Motif d'inachèvement / non traité : {intv.motif_non_traite}
                      </div>
                    )}

                    {/* Onglets des 3 formats de rapports */}
                    <div className="report-segmented-tabs" style={{ marginBottom: 14 }}>
                      <button
                        type="button"
                        className={`report-tab-btn ${activeTab === "global" ? "active" : ""}`}
                        onClick={() =>
                          setActiveReportTabByIntv((prev) => ({ ...prev, [intv.id]: "global" }))
                        }
                      >
                        <span className="tab-icon">📊</span>
                        <div className="tab-text-block">
                          <span className="tab-title">Rapport Global</span>
                          <span className="tab-sub">Client & Photos ({nbPhotos})</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        className={`report-tab-btn ${activeTab === "conformite" ? "active" : ""}`}
                        onClick={() =>
                          setActiveReportTabByIntv((prev) => ({ ...prev, [intv.id]: "conformite" }))
                        }
                      >
                        <span className="tab-icon">⚖️</span>
                        <div className="tab-text-block">
                          <span className="tab-title">Rapport Conformité</span>
                          <span className="tab-sub">Audit & Mesures</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        className={`report-tab-btn ${activeTab === "jour" ? "active" : ""}`}
                        onClick={() =>
                          setActiveReportTabByIntv((prev) => ({ ...prev, [intv.id]: "jour" }))
                        }
                      >
                        <span className="tab-icon">📅</span>
                        <div className="tab-text-block">
                          <span className="tab-title">Rapport du Jour</span>
                          <span className="tab-sub">Tournée ({compteurJour.realises}/{compteurJour.recus})</span>
                        </div>
                      </button>
                    </div>

                    {/* Barre d'actions rapides pour ce rapport */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 10,
                      }}
                    >
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleCopyReport(currentReportText, `${intv.id}_${activeTab}`)}
                        style={{
                          background: "#2563eb",
                          borderColor: "#2563eb",
                          padding: "7px 12px",
                          fontSize: 12.5,
                          fontWeight: 700,
                        }}
                      >
                        {copiedId === `${intv.id}_${activeTab}` ? "✓ Copié !" : "📋 Copier le rapport"}
                      </button>

                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => openWhatsAppText(currentReportText)}
                        style={{
                          background: "#16a34a",
                          borderColor: "#16a34a",
                          padding: "7px 12px",
                          fontSize: 12.5,
                          fontWeight: 700,
                        }}
                      >
                        💬 Partager sur WhatsApp
                      </button>

                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          const prefix =
                            activeTab === "conformite"
                              ? "Rapport_Conformite"
                              : activeTab === "jour"
                              ? "Rapport_du_Jour"
                              : "Rapport_Global";
                          downloadTextReportFile(
                            currentReportText,
                            `${prefix}_${sanitizeClientFolderName(clientName)}.txt`
                          );
                        }}
                        style={{ padding: "7px 12px", fontSize: 12.5, fontWeight: 600 }}
                        title="Télécharger le texte de ce rapport au format .txt"
                      >
                        ⬇ Télécharger (.txt)
                      </button>

                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => previewSummaryReportPdf(fullIntv)}
                        style={{ padding: "7px 12px", fontSize: 12.5, fontWeight: 600 }}
                        title="Aperçu ou téléchargement du rapport de synthèse PDF"
                      >
                        📑 PDF Synthèse
                      </button>

                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => previewFichesPdf(fullIntv)}
                        style={{ padding: "7px 12px", fontSize: 12.5, fontWeight: 600 }}
                        title="Aperçu ou téléchargement des fiches officielles SBIN & Satisfaction signées"
                      >
                        📋 PDF Fiches SBIN
                      </button>
                    </div>

                    {/* Zone de texte du rapport */}
                    <div className="report-box-wrapper" style={{ marginBottom: 14 }}>
                      <button
                        type="button"
                        className="report-copy-floating-btn"
                        onClick={() => handleCopyReport(currentReportText, `${intv.id}_${activeTab}`)}
                      >
                        {copiedId === `${intv.id}_${activeTab}` ? "✓ Copié" : "📋 Copier"}
                      </button>
                      <textarea
                        className="whatsapp-report"
                        readOnly
                        value={currentReportText}
                        rows={12}
                        style={{ width: "100%", boxSizing: "border-box" }}
                      />
                    </div>

                    {/* Section Médias (Photos & Vidéos) rattachés à cette intervention */}
                    {(nbPhotos > 0 || nbVideos > 0) && (
                      <div
                        style={{
                          padding: "12px 14px",
                          background: "#f8fafc",
                          borderRadius: 10,
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                            📸 Pièces jointes de l'intervention ({nbPhotos} photos, {nbVideos} vidéos)
                          </span>
                          <span style={{ fontSize: 11, color: "#64748b" }}>
                            Rattachées exclusivement au dossier {clientName}
                          </span>
                        </div>

                        {/* Vidéos Terrain avec téléchargement direct .mp4 */}
                        {Array.isArray(fullIntv.videos_terrain) && fullIntv.videos_terrain.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
                              📹 Vidéos terrain ({fullIntv.videos_terrain.length}) :
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
                              {fullIntv.videos_terrain.map((vid, vidIdx) => (
                                <div
                                  key={vid.id || vidIdx}
                                  style={{
                                    border: "1px solid #cbd5e1",
                                    borderRadius: 8,
                                    overflow: "hidden",
                                    background: "#0f172a",
                                    position: "relative",
                                  }}
                                >
                                  <div
                                    style={{
                                      aspectRatio: "16 / 10",
                                      cursor: "pointer",
                                      position: "relative",
                                    }}
                                    onClick={() => setActiveViewingVideo(vid)}
                                    title="Cliquer pour visionner la vidéo"
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
                                    <div
                                      style={{
                                        position: "absolute",
                                        top: "50%",
                                        left: "50%",
                                        transform: "translate(-50%, -50%)",
                                        width: 28,
                                        height: 28,
                                        borderRadius: "50%",
                                        background: "rgba(0,0,0,0.65)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "#fff",
                                        fontSize: 12,
                                      }}
                                    >
                                      ▶
                                    </div>
                                    {vid.duration && (
                                      <span
                                        style={{
                                          position: "absolute",
                                          bottom: 3,
                                          left: 3,
                                          background: "rgba(0,0,0,0.75)",
                                          color: "#fff",
                                          fontSize: 9,
                                          fontWeight: 600,
                                          padding: "1px 4px",
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
                                          bottom: 3,
                                          right: 3,
                                          background: "rgba(16, 185, 129, 0.85)",
                                          color: "#fff",
                                          fontSize: 8.5,
                                          fontWeight: 700,
                                          padding: "1px 3px",
                                          borderRadius: 3,
                                        }}
                                      >
                                        {formatFileSize(vid.size)}
                                      </span>
                                    )}
                                  </div>

                                  {/* Bouton de téléchargement individuel .mp4 */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadVideoFile(vid, clientName, vidIdx + 1);
                                    }}
                                    style={{
                                      width: "100%",
                                      padding: "4px 0",
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
                                    title="Télécharger cette vidéo au format réel .mp4"
                                  >
                                    <span>⬇ Télécharger (.mp4)</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Aperçu des photos avec téléchargement individuel */}
                        {Array.isArray(fullIntv.whatsapp_photos) && fullIntv.whatsapp_photos.length > 0 && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
                              📸 Photos terrain ({fullIntv.whatsapp_photos.length}) :
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 6 }}>
                              {fullIntv.whatsapp_photos.slice(0, 12).map((ph, phIdx) => {
                                const url = ph.url || ph.photo || "";
                                if (!url) return null;
                                return (
                                  <div
                                    key={ph.id || phIdx}
                                    style={{
                                      border: "1px solid #cbd5e1",
                                      borderRadius: 6,
                                      overflow: "hidden",
                                      background: "#fff",
                                      position: "relative",
                                    }}
                                  >
                                    <img
                                      src={url}
                                      alt={ph.label || `Photo ${phIdx + 1}`}
                                      style={{ width: "100%", height: 55, objectFit: "cover", display: "block", cursor: "pointer" }}
                                      onClick={() =>
                                        setViewingPhoto({
                                          url,
                                          title: ph.label || `Photo #${phIdx + 1}`,
                                          subtitle: ph.lieu || (ph.lat ? `${ph.lat.toFixed(5)}, ${ph.lng.toFixed(5)}` : ""),
                                        })
                                      }
                                      title="Cliquer pour agrandir"
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        downloadPhotoFile(ph, clientName);
                                      }}
                                      style={{
                                        width: "100%",
                                        padding: "2px 0",
                                        background: "#f1f5f9",
                                        color: "#334155",
                                        border: "none",
                                        borderTop: "1px solid #e2e8f0",
                                        fontSize: 9.5,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                      }}
                                      title="Télécharger cette photo"
                                    >
                                      ⬇ .jpg
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                            {fullIntv.whatsapp_photos.length > 12 && (
                              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                                + {fullIntv.whatsapp_photos.length - 12} autre{fullIntv.whatsapp_photos.length - 12 > 1 ? "s" : ""} photo{fullIntv.whatsapp_photos.length - 12 > 1 ? "s" : ""} disponible{fullIntv.whatsapp_photos.length - 12 > 1 ? "s" : ""} dans l'archive ZIP
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== PAGINATION ===== */}
      {totalPages > 1 && (
        <div className="home-pagination" style={{ marginTop: 20 }}>
          <button
            type="button"
            className="pagination-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Précédent
          </button>
          <div className="pagination-info">
            Page <strong>{page}</strong> sur <strong>{totalPages}</strong>
            <span className="pagination-count">({filteredInterventions.length} rapports)</span>
          </div>
          <button
            type="button"
            className="pagination-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Suivant →
          </button>
        </div>
      )}

      {/* Modal lecteur vidéo si une vidéo est cliquée */}
      {activeViewingVideo && (
        <VideoPlayerModal
          video={activeViewingVideo}
          onClose={() => setActiveViewingVideo(null)}
        />
      )}

      {/* Modal visionneuse photo si une photo est cliquée */}
      {viewingPhoto && (
        <PhotoViewerModal
          photoUrl={viewingPhoto.url}
          title={viewingPhoto.title}
          subtitle={viewingPhoto.subtitle}
          onClose={() => setViewingPhoto(null)}
        />
      )}
    </div>
  );
}
