import { useState, useRef } from "react";
import { validateCode, setCurrentAccount } from "../models/Account";
import InstallPwaButton from "../components/InstallPwaButton";

const ADMIN_CODE = "9999";

export default function LoginScreen({ onLogin }) {
  const [code, setCode] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refs = useRef([]);

  function handleChange(idx, val) {
    if (!/^\d?$/.test(val)) return;
    const next = [...code];
    next[idx] = val;
    setCode(next);
    setError("");
    if (val && idx < 3) refs.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx, e) {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length !== 4) {
      setError("Veuillez saisir les 4 chiffres");
      return;
    }

    if (fullCode === ADMIN_CODE) {
      const admin = { nom: "ADMIN", id: "admin", isAdmin: true, code: ADMIN_CODE };
      setCurrentAccount(admin);
      onLogin(admin);
      return;
    }

    setLoading(true);
    setError("");
    const user = await validateCode(fullCode);
    setLoading(false);

    if (user) {
      const account = { ...user, code: fullCode };
      setCurrentAccount(account);
      onLogin(account);
    } else {
      setError("Code invalide");
      setCode(["", "", "", ""]);
      refs.current[0]?.focus();
    }
  }

  return (
    <div className="login-screen">
      <div className="login-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <h1>CHAPTECH</h1>
      <p className="subtitle">FibreTrack - Saisissez votre code</p>

      <div className="login-card">
        <form onSubmit={handleSubmit}>
          <div className="code-input-group">
            {code.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => (refs.current[idx] = el)}
                type="tel"
                inputMode="numeric"
                maxLength="1"
                className="code-digit"
                value={digit}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                autoFocus={idx === 0}
              />
            ))}
          </div>

          {error && (
            <p style={{ color: "var(--danger)", fontSize: 14, textAlign: "center", marginBottom: 12, fontWeight: 500 }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary btn-large" disabled={loading}>
            {loading ? (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "pulse 1s ease-in-out infinite" }}>
                  <circle cx="12" cy="12" r="10" />
                </svg>
                Vérification...
              </>
            ) : "Se connecter"}
          </button>
        </form>
      </div>

      <div style={{ marginTop: 16, width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
        <InstallPwaButton />

        <a href="/chaptech-v2.9.apk" download className="btn-secondary btn-large apk-download-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Télécharger l'application APK
        </a>
      </div>
    </div>
  );
}
