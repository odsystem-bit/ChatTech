import { useState, useEffect } from "react";
import { fetchAccounts, addAccount, deleteAccount } from "../models/Account";

export default function AdminScreen({ onClose }) {
  const [accounts, setAccounts] = useState([]);
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      const list = await fetchAccounts();
      setAccounts(list);
    } catch (err) {
      setError("Erreur: " + err.message);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!nom.trim()) {
      setError("Nom requis");
      return;
    }
    if (!code || code.length !== 4 || !/^\d{4}$/.test(code)) {
      setError("Code à 4 chiffres requis");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await addAccount(nom.trim(), code);
      setFeedback(`Utilisateur "${nom.trim()}" ajouté avec le code ${code}`);
      setNom("");
      setCode("");
      await loadAccounts();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id, nom) {
    if (!confirm(`Supprimer l'utilisateur "${nom}" ?`)) return;
    try {
      await deleteAccount(id);
      setFeedback(`Utilisateur "${nom}" supprimé`);
      await loadAccounts();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin-screen">
      <div className="admin-header">
        <h1>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          Administration
        </h1>
        <p>Gestion des utilisateurs CHAPTECH</p>
      </div>

      <button type="button" className="btn-secondary btn-large" onClick={onClose} style={{ marginBottom: 16 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
          <path d="M3 12l6 6 12-12" />
        </svg>
        Retour à l'accueil
      </button>

      {feedback && <p className="gps-status">{feedback}</p>}
      {error && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }}>{error}</p>}

      <div className="admin-card">
        <h3 style={{ marginBottom: 16 }}>Ajouter un utilisateur</h3>
        <form className="admin-add-form" onSubmit={handleAdd}>
          <div className="row">
            <label className="form-field" style={{ flex: 2 }}>
              <span>Nom complet</span>
              <input
                type="text"
                placeholder="Ex: Jean Dupont"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
            </label>
            <label className="form-field" style={{ flex: 1 }}>
              <span>Code (4 chiffres)</span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength="4"
                placeholder="0000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </label>
          </div>
          <button type="submit" className="btn-primary btn-large" disabled={loading}>
            {loading ? "Ajout..." : "+ Ajouter l'utilisateur"}
          </button>
        </form>
      </div>

      <div className="admin-card">
        <h3 style={{ marginBottom: 16 }}>
          Utilisateurs ({accounts.length})
        </h3>
        {accounts.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Aucun utilisateur enregistré.</p>
        ) : (
          accounts.map((acc) => (
            <div key={acc.id} className="admin-user-row">
              <div className="info">
                <div className="avatar">
                  {acc.nom.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="name">{acc.nom}</div>
                  <span className="code">{acc.code}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "8px 12px", fontSize: 13, color: "var(--danger)" }}
                onClick={() => handleDelete(acc.id, acc.nom)}
              >
                Supprimer
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
