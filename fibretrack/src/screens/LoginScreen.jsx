import { useState, useRef } from "react";
import { validateCode, loginWithCredentials, registerTeam, setCurrentAccount } from "../models/Account";
import InstallPwaButton from "../components/InstallPwaButton";
import { IconLock, IconUser, IconUsers, IconBriefcase, IconPhone, IconCheck, IconShield } from "../components/Icons";

export default function LoginScreen({ onLogin }) {
  const [activeTab, setActiveTab] = useState("pin"); // 'pin' | 'credentials' | 'register'
  
  // Onglet 1: Code PIN à 4 chiffres (Technicien)
  const [code, setCode] = useState(["", "", "", ""]);
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const refs = useRef([]);

  // Onglet 2: Connexion Chef d'équipe / Super Admin
  const [loginIdentifiant, setLoginIdentifiant] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [credError, setCredError] = useState("");
  const [credLoading, setCredLoading] = useState(false);

  // Onglet 3: Inscription Chef d'équipe / Nouvelle équipe SaaS
  const [regNom, setRegNom] = useState("");
  const [regEquipe, setRegEquipe] = useState("");
  const [regTelephone, setRegTelephone] = useState("");
  const [regIdentifiant, setRegIdentifiant] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  function handleDigitChange(idx, val) {
    if (!/^\d?$/.test(val)) return;
    const next = [...code];
    next[idx] = val;
    setCode(next);
    setPinError("");
    if (val && idx < 3) refs.current[idx + 1]?.focus();
  }

  function handleDigitKeyDown(idx, e) {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  }

  async function handlePinSubmit(e) {
    e?.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length !== 4) {
      setPinError("Veuillez saisir les 4 chiffres de votre code.");
      return;
    }

    setPinLoading(true);
    setPinError("");
    try {
      const user = await validateCode(fullCode);
      if (user && (user.id || user.nom)) {
        const account = { ...user, code: fullCode };
        setCurrentAccount(account);
        onLogin(account);
      } else {
        setPinError("Code PIN invalide ou compte inactif.");
        setCode(["", "", "", ""]);
        refs.current[0]?.focus();
      }
    } catch (err) {
      setPinError(err.message || "Erreur de connexion au serveur.");
      setCode(["", "", "", ""]);
      refs.current[0]?.focus();
    } finally {
      setPinLoading(false);
    }
  }

  async function handleCredSubmit(e) {
    e?.preventDefault();
    if (!loginIdentifiant.trim() || !loginPassword.trim()) {
      setCredError("Veuillez saisir votre identifiant et votre mot de passe.");
      return;
    }

    setCredLoading(true);
    setCredError("");
    try {
      const user = await loginWithCredentials(loginIdentifiant.trim(), loginPassword);
      if (user && (user.id || user.nom)) {
        setCurrentAccount(user);
        onLogin(user);
      } else {
        setCredError("Identifiants incorrects.");
      }
    } catch (err) {
      setCredError(err.message || "Erreur lors de la connexion.");
    } finally {
      setCredLoading(false);
    }
  }

  async function handleRegisterSubmit(e) {
    e?.preventDefault();
    if (!regNom.trim() || !regEquipe.trim() || !regTelephone.trim() || !regIdentifiant.trim() || !regPassword.trim()) {
      setRegError("Tous les 5 champs sont obligatoires pour créer votre espace d'équipe.");
      return;
    }
    if (regPassword.length < 4) {
      setRegError("Le mot de passe doit comporter au moins 4 caractères.");
      return;
    }

    setRegLoading(true);
    setRegError("");
    try {
      const result = await registerTeam({
        nom: regNom.trim(),
        nom_equipe: regEquipe.trim(),
        telephone: regTelephone.trim(),
        identifiant: regIdentifiant.trim(),
        password: regPassword,
      });
      if (result && (result.id || result.nom)) {
        setCurrentAccount(result);
        onLogin(result);
      } else {
        setRegError("Erreur lors de la création de l'équipe.");
      }
    } catch (err) {
      setRegError(err.message || "Impossible de créer l'équipe.");
    } finally {
      setRegLoading(false);
    }
  }

  return (
    <div className="login-screen" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 16px", background: "var(--bg)" }}>
      <div className="login-header" style={{ textAlign: "center", marginBottom: 20 }}>
        <div className="login-logo" style={{ width: 56, height: 56, borderRadius: 16, background: "var(--nav-deep)", color: "#FFFFFF", display: "inline-flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", boxShadow: "var(--shadow)" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--nav-deep)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>CHAPTECH FIBRETRACK</h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0, fontWeight: 500 }}>Plateforme SaaS de gestion des interventions fibre terrain</p>
      </div>

      <div className="login-card" style={{ width: "100%", maxWidth: 440, background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)", padding: "24px 20px" }}>
        {/* Navigation par onglets ergonomique */}
        <div style={{ display: "flex", gap: 6, background: "var(--bg)", padding: 4, borderRadius: "var(--radius)", marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => { setActiveTab("pin"); setPinError(""); }}
            style={{
              flex: 1,
              padding: "9px 6px",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              fontWeight: 600,
              background: activeTab === "pin" ? "#FFFFFF" : "transparent",
              color: activeTab === "pin" ? "var(--nav-deep)" : "var(--text-muted)",
              boxShadow: activeTab === "pin" ? "var(--shadow-sm)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
            }}
          >
            <IconUser size={15} color={activeTab === "pin" ? "#2563EB" : "currentColor"} />
            <span>Technicien</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("credentials"); setCredError(""); }}
            style={{
              flex: 1,
              padding: "9px 6px",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              fontWeight: 600,
              background: activeTab === "credentials" ? "#FFFFFF" : "transparent",
              color: activeTab === "credentials" ? "var(--nav-deep)" : "var(--text-muted)",
              boxShadow: activeTab === "credentials" ? "var(--shadow-sm)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
            }}
          >
            <IconBriefcase size={15} color={activeTab === "credentials" ? "#2563EB" : "currentColor"} />
            <span>Chef d'équipe</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("register"); setRegError(""); }}
            style={{
              flex: 1,
              padding: "9px 6px",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              fontWeight: 600,
              background: activeTab === "register" ? "#FFFFFF" : "transparent",
              color: activeTab === "register" ? "var(--nav-deep)" : "var(--text-muted)",
              boxShadow: activeTab === "register" ? "var(--shadow-sm)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
            }}
          >
            <IconUsers size={15} color={activeTab === "register" ? "#2563EB" : "currentColor"} />
            <span>Créer équipe</span>
          </button>
        </div>

        {/* CONTENU ONGLET 1: CODE PIN TECHNICIEN */}
        {activeTab === "pin" && (
          <form onSubmit={handlePinSubmit}>
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", textAlign: "center", margin: "0 0 16px" }}>
              Saisissez votre <strong>code PIN à 4 chiffres</strong> pour accéder rapidement à vos interventions.
            </p>

            <div className="code-input-group" style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16 }}>
              {code.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (refs.current[idx] = el)}
                  type="tel"
                  inputMode="numeric"
                  maxLength="1"
                  className="code-digit"
                  style={{
                    width: 54,
                    height: 58,
                    fontSize: 24,
                    fontWeight: 700,
                    textAlign: "center",
                    borderRadius: "var(--radius)",
                    border: digit ? "2px solid #2563EB" : "1.5px solid var(--border)",
                    background: digit ? "#F0F7FF" : "var(--bg-input)",
                    color: "var(--nav-deep)",
                    outline: "none",
                  }}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                  autoFocus={idx === 0}
                />
              ))}
            </div>

            {pinError && (
              <div style={{ background: "var(--danger-bg)", border: "1px solid rgba(220, 38, 38, 0.2)", borderRadius: "var(--radius-sm)", padding: "10px 12px", marginBottom: 14, color: "var(--danger)", fontSize: 13, fontWeight: 500, textAlign: "center" }}>
                {pinError}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={pinLoading}
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: "var(--radius)",
                fontSize: 15,
                fontWeight: 600,
                background: "#2563EB",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {pinLoading ? "Vérification en cours…" : "Accéder à mon espace terrain"}
            </button>
          </form>
        )}

        {/* CONTENU ONGLET 2: CONNEXION CHEF D'ÉQUIPE */}
        {activeTab === "credentials" && (
          <form onSubmit={handleCredSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "0 0 4px" }}>
              Connectez-vous avec vos identifiants Chef d'équipe ou Administrateur général.
            </p>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 5 }}>
                Identifiant, Téléphone ou Nom
              </label>
              <input
                type="text"
                value={loginIdentifiant}
                onChange={(e) => setLoginIdentifiant(e.target.value)}
                placeholder="Ex: rodolfo, 4040 ou numéro"
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-input)",
                  fontSize: 14.5,
                  outline: "none",
                }}
                autoFocus
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 5 }}>
                Mot de passe sécurisé (ou code PIN)
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-input)",
                  fontSize: 14.5,
                  outline: "none",
                }}
              />
            </div>

            {credError && (
              <div style={{ background: "var(--danger-bg)", border: "1px solid rgba(220, 38, 38, 0.2)", borderRadius: "var(--radius-sm)", padding: "10px 12px", color: "var(--danger)", fontSize: 13, fontWeight: 500, textAlign: "center" }}>
                {credError}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={credLoading}
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: "var(--radius)",
                fontSize: 15,
                fontWeight: 600,
                background: "#2563EB",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginTop: 4,
              }}
            >
              {credLoading ? "Connexion…" : "Se connecter comme Chef d'équipe"}
            </button>
          </form>
        )}

        {/* CONTENU ONGLET 3: CRÉER UNE NOUVELLE ÉQUIPE (SAAS) */}
        {activeTab === "register" && (
          <form onSubmit={handleRegisterSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 4px" }}>
              Créez un espace de travail totalement privé pour votre équipe technique.
            </p>

            <div>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 4 }}>
                1. Nom et prénom du Chef d'équipe *
              </label>
              <input
                type="text"
                required
                value={regNom}
                onChange={(e) => setRegNom(e.target.value)}
                placeholder="Ex: Marcel Dossou"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 4 }}>
                2. Nom de votre équipe *
              </label>
              <input
                type="text"
                required
                value={regEquipe}
                onChange={(e) => setRegEquipe(e.target.value)}
                placeholder="Ex: ATLANTIQUE FIBRE PRO"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: 14 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 4 }}>
                3. Numéro de téléphone *
              </label>
              <input
                type="tel"
                required
                value={regTelephone}
                onChange={(e) => setRegTelephone(e.target.value)}
                placeholder="+229 97 00 00 00"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: 14 }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 4 }}>
                  4. Identifiant *
                </label>
                <input
                  type="text"
                  required
                  value={regIdentifiant}
                  onChange={(e) => setRegIdentifiant(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                  placeholder="marcel_chef"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: 14 }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 4 }}>
                  5. Mot de passe *
                </label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: 14 }}
                />
              </div>
            </div>

            {regError && (
              <div style={{ background: "var(--danger-bg)", border: "1px solid rgba(220, 38, 38, 0.2)", borderRadius: "var(--radius-sm)", padding: "10px 12px", color: "var(--danger)", fontSize: 13, fontWeight: 500, textAlign: "center" }}>
                {regError}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={regLoading}
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: "var(--radius)",
                fontSize: 15,
                fontWeight: 600,
                background: "#16A34A",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginTop: 6,
              }}
            >
              {regLoading ? "Création de votre espace en cours…" : "Créer mon espace d'équipe SaaS"}
            </button>
          </form>
        )}
      </div>

      <div style={{ marginTop: 20, width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 10 }}>
        <InstallPwaButton />

        <a href="/chaptech-v2.9.apk" download className="btn-secondary btn-large apk-download-btn" style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "#FFFFFF", color: "var(--nav-deep)", fontSize: 14, fontWeight: 600, boxShadow: "var(--shadow-sm)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Télécharger l'application APK Android
        </a>
      </div>
    </div>
  );
}
