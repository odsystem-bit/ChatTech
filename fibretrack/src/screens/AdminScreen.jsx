import { useState, useEffect } from "react";
import {
  fetchAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  fetchTeamInfo,
  updateTeamInfo,
  fetchAllTeams,
  getCurrentAccount,
} from "../models/Account";
import {
  IconUser,
  IconUsers,
  IconBriefcase,
  IconShield,
  IconCheck,
  IconAlertTriangle,
  IconTrash,
  IconEdit,
  IconPhone,
  IconArrowLeft,
  IconPlus,
} from "../components/Icons";

export default function AdminScreen({ onClose }) {
  const currentUser = getCurrentAccount();
  const [teamInfo, setTeamInfo] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [allTeams, setAllTeams] = useState([]);

  // Formulaire d'ajout de membre
  const [showAddModal, setShowAddModal] = useState(false);
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [telephone, setTelephone] = useState("");
  const [identifiant, setIdentifiant] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("technicien");

  // Formulaire de modification d'équipe
  const [isEditingTeam, setIsEditingTeam] = useState(false);
  const [teamNameInput, setTeamNameInput] = useState("");
  const [teamPhoneInput, setTeamPhoneInput] = useState("");

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [tInfo, accList] = await Promise.all([
        fetchTeamInfo().catch(() => null),
        fetchAccounts().catch(() => []),
      ]);
      if (tInfo) {
        setTeamInfo(tInfo);
        setTeamNameInput(tInfo.nom_equipe || "");
        setTeamPhoneInput(tInfo.telephone || "");
      }
      setAccounts(accList || []);

      if (currentUser?.is_super_admin) {
        fetchAllTeams()
          .then((teams) => setAllTeams(teams || []))
          .catch(() => {});
      }
    } catch (err) {
      setError("Erreur chargement: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateTeamSubmit(e) {
    e.preventDefault();
    if (!teamNameInput.trim()) {
      setError("Le nom de l'équipe ne peut pas être vide.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await updateTeamInfo({
        nom_equipe: teamNameInput.trim(),
        telephone: teamPhoneInput.trim(),
        sync_interventions: true,
      });
      setFeedback("Informations de l'équipe mises à jour avec succès.");
      setIsEditingTeam(false);
      await loadData();
    } catch (err) {
      setError(err.message || "Erreur lors de la mise à jour de l'équipe.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMemberSubmit(e) {
    e.preventDefault();
    if (!nom.trim()) {
      setError("Le nom complet est obligatoire.");
      return;
    }
    if (!code || code.length !== 4 || !/^\d{4}$/.test(code)) {
      setError("Un code PIN à 4 chiffres est obligatoire pour le travail sur le terrain.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await addAccount(nom.trim(), code, {
        telephone: telephone.trim(),
        identifiant: identifiant.trim(),
        password: password,
        role: role,
      });
      setFeedback(`Membre « ${nom.trim()} » ajouté avec succès.`);
      setNom("");
      setCode("");
      setTelephone("");
      setIdentifiant("");
      setPassword("");
      setRole("technicien");
      setShowAddModal(false);
      await loadData();
    } catch (err) {
      setError(err.message || "Erreur lors de l'ajout du membre.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteMember(acc) {
    if (acc.id === currentUser?.id) {
      alert("Vous ne pouvez pas supprimer votre propre compte chef d'équipe actif.");
      return;
    }
    if (!confirm(`Supprimer définitivement le compte de « ${acc.nom} » (${acc.code}) ?`)) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      await deleteAccount(acc.id);
      setFeedback(`Compte de « ${acc.nom} » supprimé.`);
      await loadData();
    } catch (err) {
      setError(err.message || "Impossible de supprimer ce compte.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-screen" style={{ minHeight: "100vh", background: "var(--bg)", padding: "16px", maxWidth: 900, margin: "0 auto" }}>
      {/* Barre de navigation supérieure */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={onClose}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: "var(--radius-sm)",
            background: "#FFFFFF",
            border: "1px solid var(--border)",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--nav-deep)",
          }}
        >
          <IconArrowLeft size={16} />
          <span>Retour à l'accueil</span>
        </button>

        <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 500 }}>
          Connecté : <strong>{currentUser?.nom}</strong> ({currentUser?.role || "Chef"})
        </span>
      </div>

      {feedback && (
        <div style={{ background: "var(--success-bg)", border: "1px solid rgba(22, 163, 74, 0.3)", borderRadius: "var(--radius)", padding: "12px 16px", color: "var(--success)", fontSize: 14, fontWeight: 500, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <IconCheck size={18} />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div style={{ background: "var(--danger-bg)", border: "1px solid rgba(220, 38, 38, 0.3)", borderRadius: "var(--radius)", padding: "12px 16px", color: "var(--danger)", fontSize: 14, fontWeight: 500, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <IconAlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* CARTE 1: ESPACE DE TRAVAIL DE L'ÉQUIPE */}
      <div style={{ background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "20px", marginBottom: 20, boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(37, 99, 235, 0.1)", color: "#2563EB", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              <IconBriefcase size={14} /> Espace d'équipe privé
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--nav-deep)", margin: "0 0 4px" }}>
              {teamInfo?.nom_equipe || currentUser?.nom_equipe || "Mon Équipe"}
            </h2>
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: 0 }}>
              Chef d'équipe : <strong>{teamInfo?.chef_nom || currentUser?.nom}</strong> • ID : <code>{teamInfo?.id || currentUser?.team_id}</code>
            </p>
          </div>

          {!isEditingTeam ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsEditingTeam(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 600 }}
            >
              <IconEdit size={14} /> Modifier informations
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsEditingTeam(false)}
              style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", fontSize: 13 }}
            >
              Annuler
            </button>
          )}
        </div>

        {isEditingTeam && (
          <form onSubmit={handleUpdateTeamSubmit} style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 4 }}>Nom de l'équipe</label>
                <input
                  type="text"
                  required
                  value={teamNameInput}
                  onChange={(e) => setTeamNameInput(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: 14 }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 4 }}>Téléphone de contact</label>
                <input
                  type="tel"
                  value={teamPhoneInput}
                  onChange={(e) => setTeamPhoneInput(e.target.value)}
                  placeholder="+229 ..."
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: 14 }}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={loading} style={{ padding: "9px 18px", borderRadius: "var(--radius-sm)", fontSize: 13.5, fontWeight: 600, background: "#2563EB", color: "#FFFFFF" }}>
              Enregistrer les modifications
            </button>
          </form>
        )}
      </div>

      {/* CARTE 2: GESTION DES MEMBRES DE L'ÉQUIPE */}
      <div style={{ background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "20px", marginBottom: 20, boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--nav-deep)", margin: "0 0 2px" }}>
              Membres de l'équipe ({accounts.length})
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              Techniciens rattachés exclusivement à votre équipe
            </p>
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowAddModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 14px",
              borderRadius: "var(--radius-sm)",
              fontSize: 13.5,
              fontWeight: 600,
              background: "#2563EB",
              color: "#FFFFFF",
            }}
          >
            <IconPlus size={16} /> Ajouter un technicien
          </button>
        </div>

        {accounts.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "24px 0" }}>
            Aucun membre enregistré dans cette équipe.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {accounts.map((acc) => {
              const isChef = acc.role === "chef_equipe" || acc.code === "9999" || acc.id === "admin";
              const isCurrent = acc.id === currentUser?.id;
              return (
                <div
                  key={acc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: isCurrent ? "#F0F7FF" : "#FFFFFF",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: isChef ? "var(--nav-deep)" : "#E2E8F0",
                        color: isChef ? "#FFFFFF" : "#475569",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 15,
                      }}
                    >
                      {acc.nom.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--nav-deep)" }}>{acc.nom}</span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 12,
                            background: isChef ? "rgba(20, 45, 78, 0.1)" : "rgba(37, 99, 235, 0.1)",
                            color: isChef ? "var(--nav-deep)" : "#2563EB",
                          }}
                        >
                          {isChef ? "Chef d'équipe" : "Technicien"}
                        </span>
                        {isCurrent && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#16A34A" }}>• Vous</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>
                        Code PIN : <strong style={{ color: "var(--nav-deep)", fontFamily: "var(--mono)" }}>{acc.code}</strong>
                        {acc.identifiant ? ` • Login : ${acc.identifiant}` : ""}
                        {acc.telephone ? ` • Tél : ${acc.telephone}` : ""}
                      </div>
                    </div>
                  </div>

                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMember(acc)}
                      style={{
                        padding: "7px 10px",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--danger-bg)",
                        color: "var(--danger)",
                        fontSize: 12.5,
                        fontWeight: 600,
                        border: "1px solid rgba(220, 38, 38, 0.2)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title="Supprimer ce membre"
                    >
                      <IconTrash size={14} /> Supprimer
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CARTE 3 (SI SUPER_ADMIN) : SUPERVISION GLOBALE DES ÉQUIPES SAAS */}
      {currentUser?.is_super_admin && (
        <div style={{ background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "20px", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <IconShield size={20} color="#DC2626" />
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--nav-deep)", margin: 0 }}>
              Supervision Générale de la Plateforme (Super Admin)
            </h3>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
            Toutes les équipes créées sur Fibtrack avec isolation absolue des données.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {allTeams.map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "#FFFFFF" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--nav-deep)" }}>{t.nom_equipe}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                    Chef : <strong>{t.chef_nom}</strong> • Tél : {t.telephone || "N/A"} • ID : <code>{t.id}</code>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 13, fontWeight: 600, color: "var(--nav-deep)" }}>
                  <span>{t.nb_membres || 0} membres</span>
                  <span>{t.nb_interventions || 0} interventions</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL AJOUT DE MEMBRE */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(14, 32, 56, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
          <div style={{ background: "#FFFFFF", borderRadius: "var(--radius-lg)", width: "100%", maxWidth: 460, padding: "24px", boxShadow: "var(--shadow-xl)" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--nav-deep)", margin: "0 0 6px" }}>
              Ajouter un membre à l'équipe
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 16px" }}>
              Renseignez les informations du technicien. Le code PIN lui permettra de se connecter sur le terrain.
            </p>

            <form onSubmit={handleAddMemberSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 4 }}>
                  Nom complet du technicien *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Jean Paul"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: 14 }}
                  autoFocus
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 4 }}>
                    Code PIN terrain (4 chiffres) *
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={4}
                    required
                    placeholder="Ex: 5050"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: 15, fontWeight: 700, letterSpacing: "0.1em" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 4 }}>
                    Rôle
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: 14 }}
                  >
                    <option value="technicien">Technicien</option>
                    <option value="chef_equipe">Chef d'équipe</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 4 }}>
                  Numéro de téléphone (optionnel)
                </label>
                <input
                  type="tel"
                  placeholder="+229 ..."
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: 14 }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 4 }}>
                    Identifiant (optionnel)
                  </label>
                  <input
                    type="text"
                    placeholder="jean_paul"
                    value={identifiant}
                    onChange={(e) => setIdentifiant(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--nav-deep)", marginBottom: 4 }}>
                    Mot de passe (optionnel)
                  </label>
                  <input
                    type="password"
                    placeholder="Par défaut: code PIN"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-input)", fontSize: 14 }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddModal(false)}
                  style={{ flex: 1, padding: "10px", borderRadius: "var(--radius-sm)", fontSize: 14, fontWeight: 600 }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                  style={{ flex: 2, padding: "10px", borderRadius: "var(--radius-sm)", fontSize: 14, fontWeight: 600, background: "#2563EB", color: "#FFFFFF" }}
                >
                  {loading ? "Ajout..." : "Créer le membre"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
