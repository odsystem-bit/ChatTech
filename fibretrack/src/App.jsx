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
} from "./models/Intervention";
import InstallPwaButton from "./components/InstallPwaButton";
import InterventionCard from "./components/InterventionCard";
import { filterAndOrganizeInterventions, isInterventionTerminee } from "./lib/interventionFilters";

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
  const [activeTab, setActiveTab] = useState("en_cours"); // 'en_cours' | 'terminees'
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTabFilter, setSearchTabFilter] = useState("all"); // 'all' | 'en_cours' | 'terminees'
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
    if (targetTab === "terminees" || targetTab === "en_cours") {
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

  async function startNewIntervention() {
    if (creatingNew) return;
    setCreatingNew(true);
    try {
      const intervention = createEmptyIntervention(user?.nom || "");
      // 1. Sauvegarde locale instantanée (0 ms) & ouverture immédiate
      saveInterventionLocally(intervention);
      setActiveIntervention(intervention);
      navigateTo("form");

      // 2. Synchronisation serveur en arrière-plan sans bloquer l'écran
      saveIntervention(intervention)
        .then((saved) => {
          if (saved) {
            setActiveIntervention((prev) => (prev?.id === saved.id ? { ...prev, updated_at: saved.updated_at } : prev));
          }
        })
        .catch((e) => console.warn("Background new intervention sync:", e));
    } catch (err) {
      console.error("startNewIntervention error:", err);
    } finally {
      setCreatingNew(false);
    }
  }

  async function openIntervention(target) {
    const id = typeof target === "object" && target !== null ? target.id : target;
    if (!id || openingId) return;

    // 1. Si nous avons l'intervention complète en cache local (avec photos ou statut complet) : ouverture instantanée 0 ms
    const localFull = getStoredIntervention(id);
    const hasFullLocalData = localFull && (
      localFull._fully_loaded === true ||
      (Array.isArray(localFull.whatsapp_photos) && localFull.whatsapp_photos.length > 0) ||
      (Array.isArray(localFull.points_gps) && localFull.points_gps.length > 0)
    );

    if (hasFullLocalData) {
      setActiveIntervention(localFull);
      navigateTo(isInterventionTerminee(localFull) ? "report" : "form");

      // Synchronisation transparente en arrière-plan
      getIntervention(id)
        .then((fresh) => {
          if (!fresh) return;
          const freshTime = fresh.updated_at || fresh.modifie_le || "";
          const localTime = localFull.updated_at || localFull.modifie_le || "";
          const freshPhotos = Array.isArray(fresh.whatsapp_photos) ? fresh.whatsapp_photos : [];
          const localPhotos = Array.isArray(localFull.whatsapp_photos) ? localFull.whatsapp_photos : [];
          const freshGps = Array.isArray(fresh.points_gps) ? fresh.points_gps : [];
          const localGps = Array.isArray(localFull.points_gps) ? localFull.points_gps : [];

          const hasPhotoDiff = freshPhotos.length !== localPhotos.length ||
            freshPhotos.some((fp) => !localPhotos.some((lp) => (lp.id && lp.id === fp.id) || (lp.slot && lp.slot === fp.slot && lp.url === fp.url)));
          const hasGpsDiff = freshGps.length !== localGps.length;
          const hasTimeDiff = freshTime && localTime && freshTime !== localTime;
          const hasStatusDiff = (fresh.statut || "") !== (localFull.statut || "");

          if (hasTimeDiff || hasPhotoDiff || hasGpsDiff || hasStatusDiff) {
            const merged = { ...localFull, ...fresh, _fully_loaded: true };
            saveInterventionLocally(merged);
            setActiveIntervention(merged);
          }
        })
        .catch(() => {});
      return;
    }

    // 2. Première ouverture ou cache partiel : chargement complet sécurisé depuis le serveur avec indicateur
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
      const listItem = typeof target === "object" && target !== null ? target : interventions.find((i) => i.id === id);
      if (listItem) {
        const initial = ensureInterventionDefaults(listItem);
        setActiveIntervention(initial);
        navigateTo(isInterventionTerminee(initial) ? "report" : "form");
      } else {
        alert("Erreur lors de l'ouverture de l'intervention : " + (err.message || "Erreur réseau"));
      }
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDeleteIntervention(id, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (openingId) return;
    if (confirm("Supprimer cette intervention ?")) {
      setOpeningId(id);
      try {
        await deleteIntervention(id);
        await refreshInterventions();
      } catch (err) {
        console.error("handleDeleteIntervention error:", err);
      }
      setOpeningId(null);
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

  function handleCloseForm(targetTab = null) {
    if (targetTab === "terminees" || targetTab === "termine") {
      goToHome("terminees");
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
        currentUser={user.nom}
      />
    );
  }

  if (screen === "report" && activeIntervention) {
    return (
      <ReportScreen
        key={activeIntervention.id}
        intervention={activeIntervention}
        onClose={() => goToHome("terminees")}
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
              <span className={loading ? "spin-icon" : ""}>🔄</span>
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
          <button type="button" className="home-action-card" onClick={startNewIntervention} disabled={creatingNew}>
            <div className="icon primary">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <div>
              <div className="label">{creatingNew ? "Création…" : "Nouvelle intervention"}</div>
              <div className="sub">Créer une fiche de raccordement</div>
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

        {/* ===== CATÉGORIES PRINCIPALES (2 SEULEMENT) OU RÉSULTATS DE RECHERCHE ===== */}
        {!filteredData.hasSearch ? (
          <nav className="home-category-tabs" aria-label="Catégories d'interventions">
            <button
              type="button"
              className={`home-tab-btn ${activeTab === "en_cours" ? "is-active" : ""}`}
              onClick={() => handleTabChange("en_cours")}
              aria-selected={activeTab === "en_cours"}
            >
              <span className="tab-label">En cours</span>
              <span className="tab-counter tab-counter-progress">{filteredData.enCoursCount}</span>
            </button>
            <button
              type="button"
              className={`home-tab-btn ${activeTab === "terminees" ? "is-active" : ""}`}
              onClick={() => handleTabChange("terminees")}
              aria-selected={activeTab === "terminees"}
            >
              <span className="tab-label">Terminées</span>
              <span className="tab-counter tab-counter-done">{filteredData.termineesCount}</span>
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
                Tous ({filteredData.searchEnCoursCount + filteredData.searchTermineesCount})
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
                className="search-pill-clear"
                onClick={handleClearSearch}
              >
                Effacer
              </button>
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
                <p style={{ fontSize: 32, marginBottom: 8 }}>🔍</p>
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
                <p style={{ fontSize: 32, marginBottom: 8 }}>⚡</p>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 4 }}>
                  Aucune intervention en cours
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                  Toutes vos interventions sont terminées ou vous n'en avez pas encore créé.
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={startNewIntervention}
                  disabled={creatingNew}
                >
                  + Créer une intervention
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 32, marginBottom: 8 }}>📁</p>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 4 }}>
                  Aucune intervention terminée
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Les interventions clôturées apparaîtront automatiquement ici.
                </div>
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
      </main>
    </div>
  );
}
