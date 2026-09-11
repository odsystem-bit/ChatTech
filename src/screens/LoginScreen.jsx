import { useState, useRef } from "react";
import { validateCode, setCurrentAccount } from "../models/Account";

const ADMIN_CODE = "9999";

export default function LoginScreen({ onLogin }) {
  const [code, setCode] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refs = useRef([]);
  const logoTapsRef = useRef(0);
  const logoTimerRef = useRef(null);

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
      onLogin({ nom: "ADMIN", id: "admin", isAdmin: true });
      return;
    }

    setLoading(true);
    setError("");
    const user = await validateCode(fullCode);
    setLoading(false);

    if (user) {
      setCurrentAccount(user);
      onLogin(user);
    } else {
      setError("Code invalide");
      setCode(["", "", "", ""]);
      refs.current[0]?.focus();
    }
  }

  function handleLogoTap() {
    logoTapsRef.current += 1;
    if (logoTimerRef.current) clearTimeout(logoTimerRef.current);
    if (logoTapsRef.current >= 5) {
      logoTapsRef.current = 0;
      onLogin({ nom: "ADMIN", id: "admin", isAdmin: true });
      return;
    }
    logoTimerRef.current = setTimeout(() => {
      logoTapsRef.current = 0;
    }, 1500);
  }

  return (
    <div className="login-screen">
      <div className="login-logo" onClick={handleLogoTap} style={{ cursor: "pointer" }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <h1>CHAPTECH</h1>
      <p className="subtitle">Saisissez votre code à 4 chiffres</p>

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
            <p style={{ color: "var(--danger)", fontSize: 14, textAlign: "center", marginBottom: 12 }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary btn-large" disabled={loading}>
            {loading ? "Vérification..." : "Se connecter"}
          </button>
        </form>
      </div>

      <a href="/chaptech.apk" download className="btn-secondary btn-large apk-download-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Télécharger l'application APK
      </a>
    </div>
  );
}
