import { useState, useEffect } from "react";

export default function InstallPwaButton({ variant = "button", className = "" }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    // Vérifier si déjà en mode autonome (PWA déjà installée)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Détecter iOS
    const userAgent = window.navigator.userAgent || "";
    const isIosDevice = /iPhone|iPad|iPod/.test(userAgent) && !window.MSStream;
    setIsIOS(isIosDevice);

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
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSModal(true);
    } else {
      // Fallback si le navigateur ne déclenche pas l'événement
      alert("Pour installer l'application sur cet appareil, ouvrez le menu de votre navigateur (les 3 points en haut à droite) et appuyez sur 'Installer l'application' ou 'Ajouter à l'écran d'accueil'.");
    }
  }

  // Ne rien afficher si l'app est déjà installée
  if (isInstalled) return null;

  // Si ni Android prompt ni iOS, on affiche quand même un bouton d'installation assistée
  return (
    <>
      {variant === "banner" ? (
        <div className="pwa-install-banner">
          <div className="pwa-install-info">
            <span className="pwa-install-icon">📲</span>
            <div>
              <strong>Installer CHAPTECH</strong>
              <p>Accédez à l'application directement depuis votre écran d'accueil.</p>
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
