import { useState, useEffect, useCallback } from "react";
import "./App.css";
import LoginScreen from "./screens/LoginScreen";
import AdminScreen from "./screens/AdminScreen";
import InterventionFormScreen from "./screens/InterventionFormScreen";
import ReportScreen from "./screens/ReportScreen";
import StockScreen from "./screens/StockScreen";
import { getCurrentAccount, clearCurrentAccount } from "./models/Account";
import {
  listInterventions,
  createEmptyIntervention,
  getIntervention,
  saveIntervention,
  saveInterventionLocally,
  getStoredIntervention,
  ensureInterventionDefaults,
  deleteIntervention,
  getSyncOutbox,
  flushSyncOutbox,
  onOutboxChange,
  createTourneeBatch,
} from "./models/Intervention";
import InstallPwaButton from "./components/InstallPwaButton";
import InterventionCard from "./components/InterventionCard";
import TourneeDuJourView from "./components/TourneeDuJourView";
import CentralReportsView from "./components/CentralReportsView";
import { filterAndOrganizeInterventions, isInterventionTerminee } from "./lib/interventionFilters";
import {
  IconTruck,
  IconRefresh,
  IconSearch,
  IconZap,
  IconFileText,
  IconPlus,
  IconCheckCircle,
  IconCalendar,
  IconXCircle,
} from "./components/Icons";

export default function App() {
  const [user, setUser] = useState(getCurrentAccount());
  const [screen, setScreen] = useState("home");
  const [interventions, setInterventions] = useState([]);
  const [activeIntervention, setActiveIntervention] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState(null);
  const [creatingNew, setCreatingNew] = useState(false);

  // Synchronisation et état hors-ligne / outbox
  const [outboxCount, setOutboxCount] = useState(() => getSyncOutbox().length);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [isSyncingOutbox, setIsSyncingOutbox] = useState(false);

  // Filtres, recherche, pagination accueil
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return localStorage.getItem("chaptech_active_tab") || "tournee";
    } catch {
      return "tournee";
    }
  });
  const [historySubFilter, setHistorySubFilter] = useState("terminees"); // 'terminees' | 'non_traitees' | 'all'
  const [periodFilter, setPeriodFilter] = useState("all"); // 'today' | 'week' | 'month' | 'all'
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTabFilter, setSearchTabFilter] = useState("all"); // 'all' | 'en_cours' | 'terminees' | 'non_traitees'
  const [technicienFilter, setTechnicienFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");
  const [page, setPage] = useState(1);

  async function refreshInterventions(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const list = await listInterventions();
      setInterventions(list);
    } catch (err) {
      console.error("refreshInterventions error:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  // Écoute de l'outbox et de l'état de connexion réseau
  useEffect(() => {
    const unsub = onOutboxChange((count) => {
      setOutboxCount(count);
    });
    function handleOnline() {
      setIsOnline(true);
      flushSyncOutbox().then(() => refreshInterventions(false));
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      unsub();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Polling automatique en arrière-plan toutes les 8 secondes sur l'écran d'accueil
  // Permet à l'Admin et aux techniciens de voir instantanément les nouvelles interventions créées par les autres
  useEffect(() => {
    if (!user || screen !== "home") return;
    const timer = setInterval(() => {
      refreshInterventions(false);
      flushSyncOutbox();
    }, 8000);
    return () => clearInterval(timer);
  }, [user, screen]);

  useEffect(() => {
    if (user) {
      refreshInterventions();
    }
  }, [user]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible" && user && screen === "home") {
        refreshInterventions(false);
        flushSyncOutbox();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [user, screen]);

  // ===== Back button handler for Android WebView =====
  useEffect(() => {
    window.chaptechBack = () => {
      if (screen === "form" || screen === "report" || screen === "stock" || screen === "admin") {
        goToHome();
        return true;
      }
      if (screen === "home") {
        return false;
      }
      return false;
    };
    return () => { delete window.chaptechBack; };
  }, [screen]);

  const goToHome = useCallback((targetTab = null) => {
    refreshInterventions();
    if (
      targetTab === "terminees" ||
      targetTab === "non_traitees" ||
      targetTab === "en_cours" ||
      targetTab === "tournee" ||
      targetTab === "rapport"
    ) {
      setActiveTab(targetTab);
    }
    setScreen("home");
  }, []);

  function handleLogin(account) {
    setUser(account);
  }

  function handleLogout() {
    clearCurrentAccount();
    setUser(null);
    setScreen("home");
  }

  function navigateTo(newScreen) {
    setScreen(newScreen);
  }

  async function handleManualSyncOutbox() {
    setIsSyncingOutbox(true);
    try {
      await flushSyncOutbox();
      await refreshInterventions(true);
    } finally {
      setIsSyncingOutbox(false);
    }
  }

  const [newDossierModalOpen, setNewDossierModalOpen] = useState(false);
  const [newDossierName, setNewDossierName] = useState("");

  async function handleCreateDossierSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const name = (newDossierName || "").trim();
    setNewDossierModalOpen(false);
    setNewDossierName("");
    await startNewIntervention(name, { tournee: true });
  }

  async function startNewIntervention(initialNom = "", options = {}) {
    if (creatingNew) return;
    setCreatingNew(true);
    try {
      const isTournee = options.tournee === true;
      const todayStr = new Date().toISOString().slice(0, 10);
      const intervention = createEmptyIntervention(user?.nom || "", initialNom);
      if (isTournee) {
        intervention.statut = "en_attente";
        intervention.tournee_du_jour = todayStr;
        intervention.tournee_verrouille = true;
      }
      intervention._fully_loaded = true;
      // 1. Sauvegarde locale instantanée (0 ms) & mise à jour d'état immédiate
      saveInterventionLocally(intervention);
      setInterventions((prev) => [intervention, ...prev.filter((i) => i.id !== intervention.id)]);

      if (isTournee) {
        setActiveTab("tournee");
      } else {
        setActiveIntervention(intervention);
        navigateTo("form");
      }

      // 2. Synchronisation serveur en arrière-plan sans bloquer l'écran
      saveIntervention(intervention)
        .then((saved) => {
          if (saved) {
            setInterventions((prev) => prev.map((i) => (i.id === saved.id ? { ...i, ...saved } : i)));
            if (!isTournee) {
              setActiveIntervention((prev) => (prev?.id === saved.id ? { ...prev, updated_at: saved.updated_at } : prev));
            }
          }
        })
        .catch((e) => console.warn("Background new intervention sync:", e));
    } catch (err) {
      console.error("startNewIntervention error:", err);
    } finally {
      setCreatingNew(false);
    }
  }

  async function openInterventionReport(target) {
    const id = typeof target === "object" && target !== null ? target.id : target;
    if (!id || openingId === id) return;

    const targetObj = typeof target === "object" && target !== null ? target : null;
    const stored = getStoredIntervention(id);
    const initial = stored || (targetObj ? ensureInterventionDefaults(targetObj) : null);
    if (initial) {
      setActiveIntervention(initial);
      navigateTo("report");
      getIntervention(id)
        .then((fresh) => {
          if (!fresh) return;
          const full = { ...fresh, _fully_loaded: true };
          saveInterventionLocally(full);
          setActiveIntervention((prev) => (prev?.id === fresh.id ? { ...prev, ...full } : prev));
        })
        .catch(() => {});
      return;
    }

    setOpeningId(id);
    try {
      const fresh = await getIntervention(id);
      if (fresh) {
        const full = { ...fresh, _fully_loaded: true };
        saveInterventionLocally(full);
        setActiveIntervention(full);
        navigateTo("report");
      }
    } catch (err) {
      console.error("openInterventionReport error:", err);
    } finally {
      setOpeningId(null);
    }
  }

  async function handleReactivateIntervention(intv) {
    if (!intv?.id) return;
    const updated = {
      ...intv,
      statut: "en_cours",
      motif_non_traite: "",
      modifie_le: new Date().toISOString(),
      modifie_par: user?.nom || "",
      _fully_loaded: true,
    };
    setInterventions((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
    saveInterventionLocally(updated);
    saveIntervention(updated).catch((e) => console.warn("Reactivate sync error:", e));
    openIntervention(updated);
  }

  async function openIntervention(target) {
    const id = typeof target === "object" && target !== null ? target.id : target;
    if (!id || openingId === id) return;

    // 1. Si nous avons l'intervention en cache local ou passée en direct : ouverture instantanée 0 ms garantie
    const targetObj = typeof target === "object" && target !== null ? target : null;
    const storedFull = getStoredIntervention(id);
    const localFull = storedFull || (targetObj ? ensureInterventionDefaults(targetObj) : null);
    if (localFull) {
      if (storedFull || targetObj?._fully_loaded) {
        localFull._fully_loaded = true;
        saveInterventionLocally(localFull);
      } else {
        localFull._fully_loaded = false;
      }
      setActiveIntervention(localFull);
      navigateTo(isInterventionTerminee(localFull) ? "report" : "form");

      // Synchronisation transparente en arrière-plan pour récupérer les photos, vidéos et champs complets des coéquipiers
      getIntervention(id)
        .then((fresh) => {
          if (!fresh) return;
          const fullFresh = { ...fresh, _fully_loaded: true };
          saveInterventionLocally(fullFresh);
          setActiveIntervention((prev) => (prev?.id === fresh.id ? { ...prev, ...fullFresh } : prev));
        })
        .catch(() => {});
      return;
    }

    // 2. Première ouverture (non encore en cache local) : chargement sécurisé depuis le serveur
    setOpeningId(id);
    try {
      const intervention = await getIntervention(id);
      if (intervention) {
        const fullIntervention = { ...intervention, _fully_loaded: true };
        saveInterventionLocally(fullIntervention);
        setActiveIntervention(fullIntervention);
        navigateTo(isInterventionTerminee(fullIntervention) ? "report" : "form");
      } else {
        throw new Error("Intervention introuvable");
      }
    } catch (err) {
      console.error("openIntervention error:", err);
      // Fallback hors-ligne si présent dans la liste chargée
      const listItem = interventions.find((i) => i.id === id);
      if (listItem) {
        const initial = ensureInterventionDefaults(listItem);
        initial._fully_loaded = false;
        saveInterventionLocally(initial);
        setActiveIntervention(initial);
        navigateTo(isInterventionTerminee(initial) ? "report" : "form");
      } else {
        alert("Erreur lors de l'ouverture de l'intervention : " + (err.message || "Erreur réseau"));
      }
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDeleteIntervention(id, e, skipConfirm = false) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!id) return;

    if (!skipConfirm && !confirm("Supprimer cette intervention ?")) {
      return;
    }

    // 1. Suppression visuelle instantanée (0 ms) de la liste active en mémoire
    setInterventions((prev) => prev.filter((i) => i.id !== id));

    // 2. Nettoyage local immédiat (0 ms)
    try {
      localStorage.removeItem("fibretrack_intv_" + id);
      localStorage.removeItem("chaptech_intv_" + id);
    } catch {}

    // 3. Suppression serveur et outbox en arrière-plan
    try {
      await deleteIntervention(id);
      await refreshInterventions(false);
    } catch (err) {
      console.error("handleDeleteIntervention error:", err);
    }
  }

  function handleSearchChange(e) {
    setSearchQuery(e.target.value);
    setSearchTabFilter("all");
    setPage(1);
  }

  function handleClearSearch() {
    setSearchQuery("");
    setSearchTabFilter("all");
    setPage(1);
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    try {
      localStorage.setItem("chaptech_active_tab", tab);
    } catch {}
    setPage(1);
  }

  function handleSearchTabChange(tabFilter) {
    setSearchTabFilter(tabFilter);
    setPage(1);
  }

  function handleTechnicienChange(e) {
    setTechnicienFilter(e.target.value);
    setPage(1);
  }

  function handleSortChange(e) {
    setSortBy(e.target.value);
    setPage(1);
  }

  function handleResetFilters() {
    setTechnicienFilter("all");
    setSortBy("date_desc");
    setPage(1);
  }

  function handlePeriodFilterChange(p) {
    setPeriodFilter(p);
    setPage(1);
  }

  function handleCloseForm(targetTab = null) {
    if (targetTab === "terminees" || targetTab === "termine") {
      goToHome("terminees");
    } else if (targetTab === "non_traitees" || targetTab === "non_traite") {
      goToHome("non_traitees");
    } else {
      goToHome();
    }
  }

  async function handleFinish(intervention) {
    await refreshInterventions();
    setActiveIntervention(intervention);
    navigateTo("report");
  }

  // Filtrage, recherche, tri et pagination des interventions pour l'accueil
  const filteredData = filterAndOrganizeInterventions(interventions, {
    activeTab,
    historySubFilter,
    periodFilter,
    searchQuery,
    searchTabFilter,
    technicienFilter,
    sortBy,
    page,
    pageSize: 12,
  });

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (screen === "admin") {
    return <AdminScreen onClose={goToHome} />;
  }

  if (screen === "form" && activeIntervention) {
    return (
      <InterventionFormScreen
        key={activeIntervention.id}
        intervention={activeIntervention}
        onClose={handleCloseForm}
        onFinish={handleFinish}
        onOpenReport={openInterventionReport}
        currentUser={user.nom}
      />
    );
  }

  if (screen === "report" && activeIntervention) {
    return (
      <ReportScreen
        key={activeIntervention.id}
        intervention={activeIntervention}
        allInterventions={interventions}
        onClose={() => goToHome(activeTab)}
        onEdit={(intv) => {
          setActiveIntervention(intv);
          navigateTo("form");
        }}
      />
    );
  }

  if (screen === "stock") {
    return <StockScreen onClose={goToHome} isAdmin={user?.isAdmin === true} />;
  }

  return (
    <div className="app-home">
      <header>
        <div className="header-top">
          <h1>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            CHAPTECH
          </h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              className="btn-header-refresh"
              onClick={refreshInterventions}
              disabled={loading}
              aria-label="Actualiser les interventions"
              title="Actualiser les interventions en direct"
            >
              <IconRefresh size={16} className={loading ? "spin-icon" : ""} style={{ verticalAlign: "middle" }} />
              <span className="btn-refresh-label">{loading ? "…" : "Actualiser"}</span>
            </button>
            <button type="button" className="btn-icon" onClick={handleLogout} aria-label="Déconnexion">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
        <p>Bonjour, <strong>{user.nom}</strong></p>
      </header>

      <main>
        <InstallPwaButton variant="banner" />

        {/* ===== BANDEAU DE STATUT DE SYNCHRONISATION ===== */}
        <div className="sync-status-bar">
          <div className="sync-status-left">
            {!isOnline ? (
              <span className="sync-pill sync-pill-offline" title="Connexion internet indisponible">
                <span className="sync-dot offline" /> Hors-ligne (données sauvegardées en local)
              </span>
            ) : outboxCount > 0 ? (
              <span className="sync-pill sync-pill-pending" title="Modifications en attente d'envoi vers le serveur">
                <span className="sync-dot pending" /> {outboxCount} en attente de synchronisation
              </span>
            ) : (
              <span className="sync-pill sync-pill-synced" title="Toutes les données sont synchronisées avec le serveur">
                <span className="sync-dot synced" /> Synchronisé avec le serveur
              </span>
            )}
          </div>
          {outboxCount > 0 && isOnline && (
            <button
              type="button"
              className="sync-now-btn"
              onClick={handleManualSyncOutbox}
              disabled={isSyncingOutbox}
              title="Envoyer immédiatement les données vers le serveur"
            >
              {isSyncingOutbox ? "Synchronisation…" : "Synchroniser maintenant"}
            </button>
          )}
        </div>

        <div className="home-actions">
          <button type="button" className="home-action-card" onClick={() => setNewDossierModalOpen(true)} disabled={creatingNew}>
            <div className="icon primary">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <div>
              <div className="label">{creatingNew ? "Création…" : "Nouvelle intervention"}</div>
              <div className="sub">Créer un nouveau dossier / raccordement</div>
            </div>
            <svg className="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          <button type="button" className="home-action-card" onClick={() => navigateTo("stock")}>
            <div className="icon accent">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <div className="label">Stock d'équipe</div>
              <div className="sub">Gérer l'inventaire matériel</div>
            </div>
            <svg className="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {user.isAdmin && (
            <button type="button" className="home-action-card" onClick={() => navigateTo("admin")}>
              <div className="icon success">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </div>
              <div>
                <div className="label">Administration</div>
                <div className="sub">Gérer les utilisateurs</div>
              </div>
              <svg className="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>

        {/* ===== RECHERCHE GLOBALE ===== */}
        <section className="home-search-section" aria-label="Recherche d'interventions">
          <div className="home-search-box">
            <span className="search-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="search"
              className="home-search-input"
              placeholder="Rechercher par numéro, client, téléphone, technicien…"
              value={searchQuery}
              onChange={handleSearchChange}
              aria-label="Recherche par numéro, client, téléphone, technicien"
            />
            {searchQuery && (
              <button
                type="button"
                className="home-search-clear-btn"
                onClick={handleClearSearch}
                title="Effacer la recherche"
                aria-label="Effacer la recherche"
              >
                ✕
              </button>
            )}
          </div>
        </section>

        {/* ===== CATÉGORIES PRINCIPALES (TOURNÉE DU JOUR, EN COURS, TERMINÉES, RAPPORT) OU RÉSULTATS DE RECHERCHE ===== */}
        {!filteredData.hasSearch ? (
          <nav className="home-category-tabs" aria-label="Catégories d'interventions">
            <button
              type="button"
              className={`home-tab-btn ${activeTab === "tournee" ? "is-active" : ""}`}
              onClick={() => handleTabChange("tournee")}
              aria-selected={activeTab === "tournee"}
            >
              <span className="tab-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <IconTruck size={15} />
                <span>Tournée du jour</span>
              </span>
              {filteredData.tourneeTodayCount > 0 && (
                <span className="tab-counter tab-counter-tournee">{filteredData.tourneeTodayCount}</span>
              )}
            </button>
            <button
              type="button"
              className={`home-tab-btn ${activeTab === "en_cours" ? "is-active" : ""}`}
              onClick={() => handleTabChange("en_cours")}
              aria-selected={activeTab === "en_cours"}
            >
              <span className="tab-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <IconZap size={15} />
                <span>En cours</span>
              </span>
              <span className="tab-counter tab-counter-progress">{filteredData.enCoursCount}</span>
            </button>
            <button
              type="button"
              className={`home-tab-btn ${activeTab === "terminees" ? "is-active" : ""}`}
              onClick={() => handleTabChange("terminees")}
              aria-selected={activeTab === "terminees"}
            >
              <span className="tab-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <IconCheckCircle size={15} />
                <span>Terminées</span>
              </span>
              <span className="tab-counter tab-counter-done">{filteredData.termineesCount}</span>
            </button>
            <button
              type="button"
              className={`home-tab-btn home-tab-danger ${activeTab === "non_traitees" ? "is-active" : ""}`}
              onClick={() => handleTabChange("non_traitees")}
              aria-selected={activeTab === "non_traitees"}
            >
              <span className="tab-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <IconXCircle size={15} />
                <span>Non traitées</span>
              </span>
              <span className="tab-counter tab-counter-danger">{filteredData.nonTraiteesCount}</span>
            </button>
            <button
              type="button"
              className={`home-tab-btn ${activeTab === "rapport" ? "is-active" : ""}`}
              onClick={() => handleTabChange("rapport")}
              aria-selected={activeTab === "rapport"}
            >
              <span className="tab-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <IconFileText size={15} />
                <span>Rapport</span>
              </span>
              <span className="tab-counter tab-counter-rapport">{filteredData.rapportCount}</span>
            </button>
          </nav>
        ) : (
          <div className="home-search-summary">
            <div className="search-summary-text">
              <strong>{filteredData.totalItems}</strong> résultat{filteredData.totalItems > 1 ? "s" : ""} trouvé{filteredData.totalItems > 1 ? "s" : ""} pour « <span className="query-highlight">{searchQuery}</span> »
            </div>
            <div className="search-filter-pills">
              <button
                type="button"
                className={`search-pill ${searchTabFilter === "all" ? "is-active" : ""}`}
                onClick={() => handleSearchTabChange("all")}
              >
                Tous ({filteredData.totalItems})
              </button>
              <button
                type="button"
                className={`search-pill ${searchTabFilter === "en_cours" ? "is-active" : ""}`}
                onClick={() => handleSearchTabChange("en_cours")}
              >
                En cours ({filteredData.searchEnCoursCount})
              </button>
              <button
                type="button"
                className={`search-pill ${searchTabFilter === "terminees" ? "is-active" : ""}`}
                onClick={() => handleSearchTabChange("terminees")}
              >
                Terminées ({filteredData.searchTermineesCount})
              </button>
              <button
                type="button"
                className={`search-pill ${searchTabFilter === "non_traitees" ? "is-active" : ""}`}
                onClick={() => handleSearchTabChange("non_traitees")}
              >
                Non traitées ({filteredData.searchNonTraiteesCount || 0})
              </button>
              <button
                type="button"
                className="search-pill-clear"
                onClick={handleClearSearch}
              >
                Effacer
              </button>
            </div>
          </div>
        )}

        {/* ===== CONTENU PRINCIPAL : TOURNÉE DU JOUR, RAPPORT OU LISTE CLASSIQUE ===== */}
        {!filteredData.hasSearch && activeTab === "tournee" ? (
          <TourneeDuJourView
            interventions={interventions}
            currentUser={user?.nom || ""}
            techniciens={filteredData.techniciens}
            onOpenIntervention={openIntervention}
            onAddNewIntervention={() => setNewDossierModalOpen(true)}
            onSaveIntervention={(updated) => {
              if (!updated?.id) return;
              // 1. Mise à jour d'état instantanée 0 ms (pour que la carte passe en cours / non traité immédiatement)
              setInterventions((prev) =>
                prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i))
              );
              // 2. Sauvegarde locale 0 ms
              saveInterventionLocally(updated);
              // 3. Sauvegarde serveur en tâche de fond
              saveIntervention(updated)
                .catch((e) => console.warn("Save intervention offline:", e));
            }}
            onDeleteIntervention={(id) => handleDeleteIntervention(id, null, true)}
            onCreateTourneeBatch={async (date, items, tech) => {
              const res = await createTourneeBatch(date, items, tech);
              await refreshInterventions(true);
              return res;
            }}
            onRefresh={() => refreshInterventions(true)}
          />
        ) : !filteredData.hasSearch && activeTab === "rapport" ? (
          <CentralReportsView
            interventions={interventions}
            techniciens={filteredData.techniciens}
            onOpenIntervention={openIntervention}
            onOpenReport={openInterventionReport}
            currentUser={user?.nom || ""}
          />
        ) : (
          <>
            {/* Filtre de période quand l'onglet Terminées est actif */}
            {activeTab === "terminees" && !filteredData.hasSearch && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  margin: "8px 0 14px",
                  flexWrap: "wrap",
                  alignItems: "center",
                  background: "#f8fafc",
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#475569", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <IconCalendar size={14} color="#3b82f6" /> Période :
                </span>
                <button
                  type="button"
                  className={`search-pill ${periodFilter === "today" ? "is-active" : ""}`}
                  onClick={() => handlePeriodFilterChange("today")}
                  style={periodFilter === "today" ? { background: "#16a34a", borderColor: "#16a34a", color: "#fff" } : {}}
                >
                  Aujourd'hui ({filteredData.termineesTodayCount})
                </button>
                <button
                  type="button"
                  className={`search-pill ${periodFilter === "week" ? "is-active" : ""}`}
                  onClick={() => handlePeriodFilterChange("week")}
                  style={periodFilter === "week" ? { background: "#16a34a", borderColor: "#16a34a", color: "#fff" } : {}}
                >
                  Cette semaine ({filteredData.termineesWeekCount})
                </button>
                <button
                  type="button"
                  className={`search-pill ${periodFilter === "month" ? "is-active" : ""}`}
                  onClick={() => handlePeriodFilterChange("month")}
                  style={periodFilter === "month" ? { background: "#16a34a", borderColor: "#16a34a", color: "#fff" } : {}}
                >
                  Ce mois ({filteredData.termineesMonthCount})
                </button>
                <button
                  type="button"
                  className={`search-pill ${periodFilter === "all" ? "is-active" : ""}`}
                  onClick={() => handlePeriodFilterChange("all")}
                  style={periodFilter === "all" ? { background: "#16a34a", borderColor: "#16a34a", color: "#fff" } : {}}
                >
                  Toutes ({filteredData.termineesCount})
                </button>
              </div>
            )}

            {/* Bannière explicative quand l'onglet Non traitées est actif */}
            {activeTab === "non_traitees" && !filteredData.hasSearch && (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  margin: "8px 0 14px",
                  alignItems: "center",
                  background: "#fff7ed",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #fed7aa",
                  fontSize: 13,
                  color: "#9a3412",
                }}
              >
                <IconXCircle size={18} color="#ea580c" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, lineHeight: 1.45 }}>
                  <strong>Dossiers non traités / inachevés :</strong> ces interventions n'ont pas abouti (client absent, tuyau SBEE bouché, non éligible…). <strong>Aucun matériel n'est déduit du stock.</strong> Cliquez sur <em>Reprendre</em> pour reprendre le raccordement.
                </div>
              </div>
            )}
            {/* ===== BARRE D'OUTILS : TRI & FILTRE TECHNICIEN ===== */}
            <div className="home-filter-toolbar">
          <div className="filter-group">
            <label htmlFor="filter-sort" className="filter-label">Tri</label>
            <select
              id="filter-sort"
              className="filter-select"
              value={sortBy}
              onChange={handleSortChange}
            >
              <option value="date_desc">Date récente</option>
              <option value="date_asc">Date ancienne</option>
              <option value="client_asc">Client (A-Z)</option>
              <option value="client_desc">Client (Z-A)</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="filter-tech" className="filter-label">Technicien</label>
            <select
              id="filter-tech"
              className="filter-select"
              value={technicienFilter}
              onChange={handleTechnicienChange}
            >
              <option value="all">Tous ({filteredData.techniciens.length})</option>
              {filteredData.techniciens.map((tech) => (
                <option key={tech} value={tech}>
                  {tech}
                </option>
              ))}
            </select>
          </div>

          {(technicienFilter !== "all" || sortBy !== "date_desc") && (
            <button
              type="button"
              className="filter-reset-btn"
              onClick={handleResetFilters}
              title="Réinitialiser le tri et les filtres"
            >
              Réinitialiser
            </button>
          )}

          {loading && (
            <span className="home-loading-chip" title="Actualisation en cours…">
              <span className="loading-spinner-dot" />
              Actualisation…
            </span>
          )}
        </div>

        {/* ===== LISTE DES INTERVENTIONS OU ÉTAT VIDE ===== */}
        {filteredData.items.length === 0 ? (
          <div className="empty-state">
            {filteredData.hasSearch ? (
              <>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, color: "var(--text-muted)" }}>
                  <IconSearch size={38} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 4 }}>
                  Aucun résultat trouvé
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                  Aucune intervention ne correspond à votre recherche « {searchQuery} ».
                </div>
                <button type="button" className="btn-secondary" onClick={handleClearSearch}>
                  Effacer la recherche
                </button>
              </>
            ) : activeTab === "en_cours" ? (
              <>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, color: "var(--primary)" }}>
                  <IconZap size={38} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 4 }}>
                  Aucune intervention en cours
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                  Toutes vos interventions sont terminées ou vous n&apos;en avez pas encore créé.
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={startNewIntervention}
                  disabled={creatingNew}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <IconPlus size={16} />
                  <span>Créer une intervention</span>
                </button>
              </>
            ) : activeTab === "non_traitees" ? (
              <>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, color: "#ea580c" }}>
                  <IconXCircle size={38} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 4 }}>
                  Aucun dossier non traité
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Toutes les interventions ont été menées à terme avec succès ou sont en cours.
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, color: "var(--text-muted)" }}>
                  <IconFileText size={38} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 4 }}>
                  Aucune intervention terminée {periodFilter !== "all" ? "pour cette période" : ""}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: periodFilter !== "all" ? 12 : 0 }}>
                  {periodFilter !== "all"
                    ? "Aucune intervention terminée ne correspond à la période sélectionnée."
                    : "Les interventions clôturées avec succès apparaîtront automatiquement ici."}
                </div>
                {periodFilter !== "all" && (
                  <button type="button" className="btn-secondary" onClick={() => handlePeriodFilterChange("all")}>
                    Afficher toutes les terminées ({filteredData.termineesCount})
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="intervention-grid">
            {filteredData.items.map((intv) => (
              <InterventionCard
                key={intv.id}
                intervention={intv}
                onOpen={openIntervention}
                onDelete={handleDeleteIntervention}
                onOpenReport={openInterventionReport}
                onReactivate={handleReactivateIntervention}
                isOpening={openingId === intv.id}
              />
            ))}
          </div>
        )}

        {/* ===== PAGINATION ===== */}
        {filteredData.totalPages > 1 && (
          <div className="home-pagination" aria-label="Pagination des interventions">
            <button
              type="button"
              className="pagination-btn"
              disabled={filteredData.currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Page précédente"
            >
              ← Précédent
            </button>
            <div className="pagination-info">
              Page <strong>{filteredData.currentPage}</strong> sur <strong>{filteredData.totalPages}</strong>
              <span className="pagination-count">({filteredData.totalItems} interventions)</span>
            </div>
            <button
              type="button"
              className="pagination-btn"
              disabled={filteredData.currentPage >= filteredData.totalPages}
              onClick={() => setPage((p) => Math.min(filteredData.totalPages, p + 1))}
              aria-label="Page suivante"
            >
              Suivant →
            </button>
          </div>
        )}
          </>
        )}
        {/* Modal Création Nouveau Dossier */}
        {newDossierModalOpen && (
          <div className="modal-overlay" style={{ zIndex: 9999 }}>
            <div className="modal-card" style={{ maxWidth: 480, width: "92%", padding: 24, borderRadius: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ background: "#e0f2fe", color: "#0284c7", width: 42, height: 42, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconPlus size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Nouveau Dossier / Raccordement</h3>
                  <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Création d'une fiche d'intervention synchronisée</p>
                </div>
              </div>

              <form onSubmit={handleCreateDossierSubmit}>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                    Nom du dossier ou Nom du client
                  </label>
                  <input
                    type="text"
                    placeholder="Ex : Clinique Mahouna, Entreprise Mantota..."
                    value={newDossierName}
                    onChange={(e) => setNewDossierName(e.target.value)}
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1.5px solid #cbd5e1",
                      fontSize: 15,
                      boxSizing: "border-box"
                    }}
                  />
                  <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 5 }}>
                    Le nom de l'intervention et du dossier seront automatiquement liés et synchronisés.
                  </span>
                </div>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => { setNewDossierModalOpen(false); setNewDossierName(""); }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={creatingNew}
                    onClick={() => {
                      const name = (newDossierName || "").trim();
                      setNewDossierModalOpen(false);
                      setNewDossierName("");
                      startNewIntervention(name, { tournee: true });
                    }}
                    style={{ background: "#0284c7", borderColor: "#0284c7" }}
                    title="Ajouter à la feuille de route Tournée du jour"
                  >
                    {creatingNew ? "Création…" : "📅 Tournée du jour"}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={creatingNew}
                    onClick={() => {
                      const name = (newDossierName || "").trim();
                      setNewDossierModalOpen(false);
                      setNewDossierName("");
                      startNewIntervention(name, { tournee: false });
                    }}
                    style={{ background: "#16a34a", borderColor: "#16a34a" }}
                    title="Démarrer directement l'intervention dans 'En cours'"
                  >
                    {creatingNew ? "Création…" : "⚡ Démarrer (En cours)"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
