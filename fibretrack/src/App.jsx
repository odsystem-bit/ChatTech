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
} from "./models/Intervention";
import { formatDateFR } from "./lib/date";
import InstallPwaButton from "./components/InstallPwaButton";

export default function App() {
  const [user, setUser] = useState(getCurrentAccount());
  const [screen, setScreen] = useState("home");
  const [interventions, setInterventions] = useState([]);
  const [activeIntervention, setActiveIntervention] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState(null);
  const [creatingNew, setCreatingNew] = useState(false);

  async function refreshInterventions() {
    setLoading(true);
    try {
      const list = await listInterventions();
      setInterventions(list);
    } catch (err) {
      console.error("refreshInterventions error:", err);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (user) {
      refreshInterventions();
    }
  }, [user]);

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

  const goToHome = useCallback(() => {
    refreshInterventions();
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
      saveIntervention(intervention).catch((e) => console.warn("Background new intervention sync:", e));
    } catch (err) {
      console.error("startNewIntervention error:", err);
    }
    setCreatingNew(false);
  }

  async function openIntervention(target) {
    const id = typeof target === "object" && target !== null ? target.id : target;
    if (!id || openingId) return;

    // 1. Si nous avons l'intervention complète en cache local (0 ms instantané)
    const localFull = getStoredIntervention(id);
    if (localFull) {
      setActiveIntervention(localFull);
      navigateTo(localFull.statut === "termine" ? "report" : "form");

      // Synchronisation transparente en arrière-plan
      getIntervention(id)
        .then((fresh) => {
          if (fresh && fresh.updated_at !== localFull.updated_at) {
            setActiveIntervention(fresh);
          }
        })
        .catch(() => {});
      return;
    }

    // 2. Si pas encore en cache complet, mais présent dans la liste chargée (0 ms instantané !)
    const listItem = typeof target === "object" && target !== null ? target : interventions.find((i) => i.id === id);
    if (listItem) {
      const initial = ensureInterventionDefaults(listItem);
      setActiveIntervention(initial);
      navigateTo(initial.statut === "termine" ? "report" : "form");

      // Charger les photos et détails complets en tâche de fond sans bloquer l'interface
      setOpeningId(id);
      getIntervention(id)
        .then((fresh) => {
          if (fresh) {
            setActiveIntervention(fresh);
          }
        })
        .catch((e) => console.warn("Background fetch failed:", e))
        .finally(() => setOpeningId(null));
      return;
    }

    // 3. Première ouverture inconnue : chargement réseau avec indicateur
    setOpeningId(id);
    try {
      const intervention = await getIntervention(id);
      if (intervention) {
        setActiveIntervention(intervention);
        navigateTo(intervention.statut === "termine" ? "report" : "form");
      }
    } catch (err) {
      console.error("openIntervention error:", err);
      alert("Erreur lors de l'ouverture de l'intervention : " + (err.message || "Erreur réseau"));
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDeleteIntervention(id, e) {
    e.stopPropagation();
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

  function handleCloseForm() {
    goToHome();
  }

  async function handleFinish(intervention) {
    await refreshInterventions();
    setActiveIntervention(intervention);
    navigateTo("report");
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (screen === "admin") {
    return <AdminScreen onClose={goToHome} />;
  }

  if (screen === "form" && activeIntervention) {
    return (
      <InterventionFormScreen
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
        intervention={activeIntervention}
        onClose={goToHome}
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
          <button type="button" className="btn-icon" onClick={handleLogout} aria-label="Déconnexion">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
        <p>Bonjour, <strong>{user.nom}</strong></p>
      </header>

      <main>
        <InstallPwaButton variant="banner" />
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

        <h3 className="section-title">
          Interventions ({interventions.length}){loading && " …"}
        </h3>
        {interventions.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize: 28, marginBottom: 8 }}>📋</p>
            Aucune intervention. Créez-en une pour commencer.
          </div>
        ) : (
          <ul className="intervention-list">
            {interventions.map((intv) => (
              <li key={intv.id}>
                <button
                  type="button"
                  onClick={() => openIntervention(intv)}
                  className="intv-card-btn"
                  disabled={openingId === intv.id}
                >
                  <div className="intv-row">
                    <strong>{intv.nom_client || "Nouveau client"}</strong>
                    <span className={`badge ${intv.statut === "termine" ? "badge-done" : "badge-progress"}`}>
                      {openingId === intv.id ? "Ouverture…" : (intv.statut === "termine" ? "Terminé" : "En cours")}
                    </span>
                  </div>
                  <div className="badge-meta">
                    {formatDateFR(intv.date)} · {intv.nom_technicien || "N/A"}
                  </div>
                </button>
                <button
                  type="button"
                  className="delete-intv-btn"
                  onClick={(e) => handleDeleteIntervention(intv.id, e)}
                  aria-label="Supprimer"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
