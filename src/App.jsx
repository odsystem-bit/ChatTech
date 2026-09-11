import { useState, useEffect, useRef, useCallback } from "react";
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
  deleteIntervention,
} from "./models/Intervention";

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
      await saveIntervention(intervention);
      setActiveIntervention(intervention);
      navigateTo("form");
    } catch (err) {
      console.error("startNewIntervention error:", err);
    }
    setCreatingNew(false);
  }

  async function openIntervention(id) {
    if (openingId) return;
    setOpeningId(id);
    try {
      const intervention = await getIntervention(id);
      if (intervention) {
        setActiveIntervention(intervention);
        navigateTo(intervention.statut === "termine" ? "report" : "form");
      }
    } catch (err) {
      console.error("openIntervention error:", err);
    }
    setOpeningId(null);
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
    return <StockScreen onClose={goToHome} />;
  }

  return (
    <div className="app-home">
      <header>
        <div className="header-top">
          <h1>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        <p>Bonjour, {user.nom}</p>
      </header>

      <main>
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
          <p className="empty-state">Aucune intervention. Créez-en une pour commencer.</p>
        ) : (
          <ul className="intervention-list">
            {interventions.map((intv) => (
              <li key={intv.id}>
                <button type="button" onClick={() => openIntervention(intv.id)} disabled={openingId === intv.id}>
                  <div className="intv-row">
                    <strong>{intv.nom_client || "Nouveau client"}</strong>
                    <span className={`badge ${intv.statut === "termine" ? "badge-done" : "badge-progress"}`}>
                      {openingId === intv.id ? "Chargement…" : (intv.statut === "termine" ? "Terminé" : "En cours")}
                    </span>
                  </div>
                  <div className="badge-meta">
                    {new Date(intv.date).toLocaleDateString()} · {intv.nom_technicien || "N/A"}
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
