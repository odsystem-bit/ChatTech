import React, { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px 20px', maxWidth: 480, margin: '40px auto', background: '#fff', borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
          <h2 style={{ color: '#ef4444', margin: '0 0 12px' }}>⚠️ Une erreur est survenue</h2>
          <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.5 }}>
            Une anomalie temporaire s'est produite lors de l'affichage. Vous pouvez recharger l'application ou réinitialiser le cache local.
          </p>
          {this.state.error && (
            <details style={{ marginTop: 12, textAlign: 'left', fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: 8, borderRadius: 6, overflowX: 'auto' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Détails techniques</summary>
              <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
                {this.state.error.toString()}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            <button
              onClick={() => window.location.reload()}
              style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
            >
              Actualiser la page
            </button>
            <button
              onClick={() => {
                if (confirm('Voulez-vous vider le cache et vous reconnecter ? Vos interventions enregistrées sur le serveur restent intactes.')) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
              style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '10px 18px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
            >
              Réinitialiser
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Enregistrement du Service Worker pour la PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=2.9.9').then(
      (registration) => {
        registration.update();
        console.log('[PWA] ServiceWorker enregistré avec succès:', registration.scope);
      },
      (error) => {
        console.error('[PWA] Échec de l enregistrement du ServiceWorker:', error);
      }
    );
  });
}


