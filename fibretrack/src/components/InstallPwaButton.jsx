import { useState, useEffect } from "react";

export default function InstallPwaButton({ variant = "button", className = "" }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showDesktopModal, setShowDesktopModal] = useState(false);

  useEffect(() => {
    // Vérifier si déjà en mode autonome (PWA déjà installée)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Détecter l'appareil
    const userAgent = window.navigator.userAgent || "";
    const isIosDevice = /iPhone|iPad|iPod/.test(userAgent) && !window.MSStream;
    const isMobileDevice = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    setIsIOS(isIosDevice);
    setIsDesktop(!isMobileDevice);

    // Écouter l'événement standard d'installation (Android / Chrome / Edge)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function handleInstallClick() {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          setIsInstalled(true);
        }
        setDeferredPrompt(null);
        return;
      } catch (err) {
        console.warn("PWA install error:", err);
      }
    }

    if (isIOS) {
      setShowIOSModal(true);
    } else if (isDesktop) {
      setShowDesktopModal(true);
    } else {
      setShowDesktopModal(true);
    }
  }

  // Ne rien afficher si l'app est déjà installée en mode autonome
  if (isInstalled) return null;

  return (
    <>
      {variant === "banner" ? (
        <div className="pwa-install-banner">
          <div className="pwa-install-info">
            <span className="pwa-install-icon">📲</span>
            <div>
              <strong>Installer CHAPTECH</strong>
              <p>Accédez à l'application directement depuis votre écran d'accueil ou votre PC.</p>
            </div>
          </div>
          <button type="button" onClick={handleInstallClick} className="btn-install-pwa">
            Installer
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`btn-pwa-install ${className}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Installer l'application (PWA)
        </button>
      )}

      {/* Modale d'instructions pour Desktop PC (Chrome / Edge) */}
      {showDesktopModal && (
        <div className="ios-install-backdrop" onClick={() => setShowDesktopModal(false)} role="dialog" aria-modal="true">
          <div className="ios-install-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="ios-install-header">
              <h3>Installer CHAPTECH sur PC</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setShowDesktopModal(false)}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.6 }}>
              <p style={{ margin: "0 0 12px" }}>
                Sur ordinateur (Google Chrome ou Microsoft Edge), l'installation est immédiate :
              </p>
              
              <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: 12, marginBottom: 10, border: "1px solid #e2e8f0", borderLeft: "4px solid #2563eb" }}>
                <strong style={{ color: "#1e293b", display: "block", marginBottom: 4 }}>
                  👉 Option 1 : Dans la barre d'adresse (recommandé)
                </strong>
                <span>
                  Regardez <strong>tout à droite</strong> de la barre d'adresse (où est affiché l'URL <code>https://fibretrack.mantota.com/</code>). Cliquez sur l'icône d'ordinateur avec une flèche vers le bas 📥 <strong>« Installer CHAPTECH »</strong>.
                </span>
              </div>

              <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: 12, marginBottom: 12, border: "1px solid #e2e8f0", borderLeft: "4px solid #10b981" }}>
                <strong style={{ color: "#1e293b", display: "block", marginBottom: 4 }}>
                  👉 Option 2 : Dans le menu du navigateur
                </strong>
                <span>
                  Cliquez sur les <strong>3 points verticaux ⋮</strong> (en haut à droite de Chrome/Edge) &rarr; Cliquez sur <strong>« Installer CHAPTECH… »</strong> (ou « Applications » &gt; « Installer ce site en tant qu'application »).
                </span>
              </div>

              <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
                💡 Une fois installée, CHAPTECH s'ouvre dans sa propre fenêtre sans barre d'adresse, et un raccourci est créé sur votre Bureau Windows.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%", marginTop: 16 }}
              onClick={() => setShowDesktopModal(false)}
            >
              J'ai compris
            </button>
          </div>
        </div>
      )}

      {/* Modale d'instructions pour iOS */}
      {showIOSModal && (
        <div className="ios-install-backdrop" onClick={() => setShowIOSModal(false)}>
          <div className="ios-install-card" onClick={(e) => e.stopPropagation()}>
            <div className="ios-install-header">
              <h3>Installer sur iPhone / iPad</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setShowIOSModal(false)}
              >
                ✕
              </button>
            </div>
            <ol className="ios-steps">
              <li>
                Appuyez sur le bouton <strong>Partager</strong> en bas de Safari (l'icône d'un carré avec une flèche vers le haut <span style={{ fontSize: 18 }}>⎋</span>).
              </li>
              <li>
                Faites défiler vers le bas et sélectionnez <strong>Sur l'écran d'accueil</strong> (<span style={{ fontSize: 18 }}>➕</span>).
              </li>
              <li>
                Appuyez sur <strong>Ajouter</strong> en haut à droite.
              </li>
            </ol>
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%", marginTop: 16 }}
              onClick={() => setShowIOSModal(false)}
            >
              J'ai compris
            </button>
          </div>
        </div>
      )}
    </>
  );
}
