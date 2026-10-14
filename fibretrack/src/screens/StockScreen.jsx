import { useState, useEffect, useMemo } from "react";
import {
  fetchStock,
  fetchStockMovements,
  findExistingDesignation,
  importStockExcel,
  moveStockItem,
  saveStockItem,
} from "../lib/stock";
import {
  getStockPdfUrl,
  getPointMaterielExcelUrl,
  getExcelHebdoUrl,
  getExcelMoisUrl,
  getHistoriqueUrl,
  getListeMoisUrl,
  getPdfMoisUrl,
} from "../lib/pdf";
import { formatDateTimeFR } from "../lib/date";

const SEUIL_ALERTE = 5;

// Dictionnaire de libellés humains pour le matériel télécom
const LABELS_MATERIEL = {
  ont: { label: "Box ONT", icon: "📟", cat: "Équipement actif" },
  pto: { label: "Prise PTO optique", icon: "🔌", cat: "Terminaison" },
  jarretiere: { label: "Jarretière optique", icon: "🧵", cat: "Raccordement" },
  piton: { label: "Piton d'ancrage", icon: "🔩", cat: "Fixation" },
  cheville: { label: "Cheville", icon: "🧱", cat: "Fixation" },
  connecteur: { label: "Connecteur mécanique", icon: "✨", cat: "Raccordement" },
  closer: { label: "Boîtier Closer", icon: "📦", cat: "Protection" },
  fibre_1fo: { label: "Câble Fibre 1FO", icon: "➰", cat: "Câblage" },
  cpc_50: { label: "Câble CPC 50m", icon: "➰", cat: "Câblage" },
  cpc_100: { label: "Câble CPC 100m", icon: "➰", cat: "Câblage" },
  cpc_150: { label: "Câble CPC 150m", icon: "➰", cat: "Câblage" },
  cpc_200: { label: "Câble CPC 200m", icon: "➰", cat: "Câblage" },
  cpc_250: { label: "Câble CPC 250m", icon: "➰", cat: "Câblage" },
  cpc_300: { label: "Câble CPC 300m", icon: "➰", cat: "Câblage" },
  cpc_350: { label: "Câble CPC 350m", icon: "➰", cat: "Câblage" },
  crochets: { label: "Crochets", icon: "🪝", cat: "Fixation" },
  pince: { label: "Pince d'ancrage", icon: "🗜️", cat: "Armement" },
  susp: { label: "Suspente (SUS)", icon: "📎", cat: "Armement" },
  traverse_13t: { label: "Traverse 13T", icon: "🪜", cat: "Poteaux" },
  traverse_15t: { label: "Traverse 15T", icon: "🪜", cat: "Poteaux" },
  semelle_eq: { label: "Semelle Eq", icon: "🛡️", cat: "Poteaux" },
  poteau_sbee_non_arme: { label: "Poteau SBEE non armé", icon: "🗼", cat: "Poteaux" },
  poteau_sbee_arme: { label: "Poteau SBEE armé", icon: "🗼", cat: "Poteaux" },
  repeteur_wifi: { label: "Répéteur Wi-Fi", icon: "📶", cat: "Équipement actif" },
};

function getItemMeta(designation) {
  const norm = String(designation || "").trim().toLowerCase();
  if (LABELS_MATERIEL[norm]) return LABELS_MATERIEL[norm];
  return {
    label: designation.charAt(0).toUpperCase() + designation.slice(1).replace(/_/g, " "),
    icon: "📦",
    cat: "Accessoire",
  };
}

export default function StockScreen({ onClose, isAdmin = false }) {
  const [stock, setStock] = useState({});
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'rupture' | 'low' | 'ok'

  // Modale mouvement manuel rapide
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [movementDesignation, setMovementDesignation] = useState("");
  const [movementType, setMovementType] = useState("entree");
  const [movementQty, setMovementQty] = useState("");
  const [movementMotif, setMovementMotif] = useState("");
  const [movementSaving, setMovementSaving] = useState(false);

  // Modale édition directe solde (Admin)
  const [editModalItem, setEditModalItem] = useState(null);
  const [editModalQty, setEditModalQty] = useState("");
  const [editModalSaving, setEditModalSaving] = useState(false);

  // Historique mouvements
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [movements, setMovements] = useState([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementFilterQuery, setMovementFilterQuery] = useState("");

  // Section Admin
  const [adminSectionOpen, setAdminSectionOpen] = useState(false);
  const [importMode, setImportMode] = useState("add");
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [moisExport, setMoisExport] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    let cancelled = false;
    fetchStock().then((currentStock) => {
      if (cancelled) return;
      setStock(currentStock);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function showToast(msg, type = "success") {
    setFeedback({ msg, type });
    setTimeout(() => {
      setFeedback(null);
    }, 4500);
  }

  // KPIs
  const allDesignations = useMemo(() => {
    return Object.keys(stock).sort((a, b) => a.localeCompare(b));
  }, [stock]);

  const kpis = useMemo(() => {
    let ok = 0;
    let low = 0;
    let rupture = 0;
    let totalItems = allDesignations.length;

    for (const d of allDesignations) {
      const q = stock[d] ?? 0;
      if (q <= 0) rupture++;
      else if (q < SEUIL_ALERTE) low++;
      else ok++;
    }

    return { total: totalItems, ok, low, rupture };
  }, [stock, allDesignations]);

  // Filtrage
  const filteredDesignations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allDesignations.filter((d) => {
      const meta = getItemMeta(d);
      const matchSearch =
        !q ||
        d.toLowerCase().includes(q) ||
        meta.label.toLowerCase().includes(q) ||
        meta.cat.toLowerCase().includes(q);

      if (!matchSearch) return false;

      const qty = stock[d] ?? 0;
      if (statusFilter === "rupture") return qty <= 0;
      if (statusFilter === "low") return qty > 0 && qty < SEUIL_ALERTE;
      if (statusFilter === "ok") return qty >= SEUIL_ALERTE;
      return true;
    });
  }, [allDesignations, stock, searchQuery, statusFilter]);

  async function handleQuickStep(designation, delta) {
    const current = stock[designation] ?? 0;
    const type = delta > 0 ? "entree" : "sortie";
    const motif = delta > 0 ? "Réception express (+1)" : "Sortie express (-1)";
    try {
      const updated = await moveStockItem(designation, type, Math.abs(delta), motif);
      setStock({ ...updated });
      showToast(`${delta > 0 ? "+1" : "-1"} sur "${getItemMeta(designation).label}" enregistré.`);
    } catch (err) {
      showToast(`Erreur : ${err.message}`, "error");
    }
  }

  async function handleSaveManualMovement(e) {
    e.preventDefault();
    const qte = Number(movementQty);
    if (!Number.isInteger(qte) || qte <= 0 || !movementDesignation.trim()) {
      showToast("Veuillez renseigner un article et une quantité valide.", "error");
      return;
    }

    setMovementSaving(true);
    try {
      const motif = movementMotif.trim() || (movementType === "entree" ? "Entrée manuelle magasin" : "Sortie manuelle");
      const updated = await moveStockItem(movementDesignation, movementType, qte, motif);
      setStock({ ...updated });
      showToast(`${movementType === "entree" ? "Ajout de" : "Retrait de"} ${qte} pour "${getItemMeta(movementDesignation).label}".`);
      setMovementModalOpen(false);
      setMovementDesignation("");
      setMovementQty("");
      setMovementMotif("");
    } catch (err) {
      showToast(`Erreur : ${err.message}`, "error");
    } finally {
      setMovementSaving(false);
    }
  }

  async function handleSaveAdminQuantity() {
    if (!editModalItem) return;
    const qty = Number(editModalQty);
    if (!Number.isInteger(qty) || qty < 0) {
      showToast("La quantité doit être un entier positif ou zéro.", "error");
      return;
    }

    setEditModalSaving(true);
    try {
      const updated = await saveStockItem(editModalItem, qty);
      setStock({ ...updated });
      showToast(`Solde de "${getItemMeta(editModalItem).label}" défini à ${qty}.`);
      setEditModalItem(null);
    } catch (err) {
      showToast(`Erreur : ${err.message}`, "error");
    } finally {
      setEditModalSaving(false);
    }
  }

  async function loadMovements() {
    setMovementsLoading(true);
    try {
      setMovements(await fetchStockMovements(150));
    } catch (err) {
      showToast(`Erreur historique : ${err.message}`, "error");
    } finally {
      setMovementsLoading(false);
    }
  }

  function toggleMovements() {
    if (!movementsOpen && movements.length === 0) loadMovements();
    setMovementsOpen(!movementsOpen);
  }

  async function handleExcelImport(e) {
    e.preventDefault();
    if (!importFile) return;
    setImportLoading(true);
    try {
      const { result, stock: updated } = await importStockExcel(importFile, importMode);
      setStock(updated);
      showToast(
        `${importMode === "add" ? "Livraison ajoutée" : "Inventaire mis à jour"} : ${result.count} articles traités.`
      );
      setImportFile(null);
      e.currentTarget.reset();
    } catch (err) {
      showToast(`Erreur d'import : ${err.message}`, "error");
    } finally {
      setImportLoading(false);
    }
  }

  const filteredMovements = useMemo(() => {
    const q = movementFilterQuery.trim().toLowerCase();
    if (!q) return movements;
    return movements.filter((m) => {
      const desig = (m.designation || "").toLowerCase();
      const client = (m.int_nom_client || m.nom_client || "").toLowerCase();
      const tech = (m.nom_technicien || "").toLowerCase();
      const motif = (m.motif || "").toLowerCase();
      return desig.includes(q) || client.includes(q) || tech.includes(q) || motif.includes(q);
    });
  }, [movements, movementFilterQuery]);

  return (
    <div className="stock-screen-container">
      {/* Toast Notification */}
      {feedback && (
        <div
          className={`stock-toast ${feedback.type === "error" ? "error" : "success"}`}
          style={{
            position: "fixed",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10000,
            padding: "10px 20px",
            borderRadius: 10,
            background: feedback.type === "error" ? "#ef4444" : "#10b981",
            color: "#fff",
            fontWeight: 600,
            boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>{feedback.type === "error" ? "⚠️" : "✓"}</span>
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* En-tête principal */}
      <header className="stock-main-header">
        <div className="stock-header-title-box">
          <div className="stock-header-icon">📦</div>
          <div>
            <h2>Gestion de Stock Fibre</h2>
            <p className="stock-subtitle">
              Suivi en temps réel des équipements et consommables • Zéro fuite
            </p>
          </div>
        </div>
        <div className="stock-header-actions">
          <button type="button" className="btn-secondary btn-stock-back" onClick={onClose}>
            ← Retour
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="stock-kpi-grid">
        <div className="stock-kpi-card">
          <div className="kpi-icon">📊</div>
          <div className="kpi-info">
            <span className="kpi-num">{kpis.total}</span>
            <span className="kpi-lbl">Références gérées</span>
          </div>
        </div>
        <div className="stock-kpi-card kpi-ok">
          <div className="kpi-icon">🟢</div>
          <div className="kpi-info">
            <span className="kpi-num">{kpis.ok}</span>
            <span className="kpi-lbl">Stock optimal (≥ 5)</span>
          </div>
        </div>
        <div className="stock-kpi-card kpi-warning">
          <div className="kpi-icon">🟠</div>
          <div className="kpi-info">
            <span className="kpi-num">{kpis.low}</span>
            <span className="kpi-lbl">Stock faible (&lt; 5)</span>
          </div>
        </div>
        <div className="stock-kpi-card kpi-danger">
          <div className="kpi-icon">🔴</div>
          <div className="kpi-info">
            <span className="kpi-num">{kpis.rupture}</span>
            <span className="kpi-lbl">Rupture ou dette (≤ 0)</span>
          </div>
        </div>
      </div>

      {/* Barre d'action rapide & Recherche */}
      <div className="stock-controls-bar">
        <div className="stock-search-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="stock-search-input"
            placeholder="Rechercher un matériel (ex: ONT, Jarretière, Piton...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>

        <div className="stock-action-buttons">
          <button
            type="button"
            className="btn-primary btn-movement-new"
            onClick={() => {
              setMovementDesignation(filteredDesignations[0] || "piton");
              setMovementModalOpen(true);
            }}
          >
            ➕ Mouvement manuel
          </button>
          <button
            type="button"
            className={`btn-secondary ${movementsOpen ? "active" : ""}`}
            onClick={toggleMovements}
          >
            🕘 Mouvements {movements.length > 0 && `(${movements.length})`}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => window.open(getStockPdfUrl("pdf_stock_view"), "_blank")}
          >
            📄 PDF Stock
          </button>
          {isAdmin && (
            <button
              type="button"
              className={`btn-secondary btn-admin-toggle ${adminSectionOpen ? "active" : ""}`}
              onClick={() => setAdminSectionOpen(!adminSectionOpen)}
            >
              ⚙️ Admin & Excel
            </button>
          )}
        </div>
      </div>

      {/* Filtres de statut */}
      <div className="stock-status-filters">
        <button
          type="button"
          className={`filter-pill ${statusFilter === "all" ? "active" : ""}`}
          onClick={() => setStatusFilter("all")}
        >
          Tous ({kpis.total})
        </button>
        <button
          type="button"
          className={`filter-pill pill-danger ${statusFilter === "rupture" ? "active" : ""}`}
          onClick={() => setStatusFilter("rupture")}
        >
          🔴 Rupture ({kpis.rupture})
        </button>
        <button
          type="button"
          className={`filter-pill pill-warning ${statusFilter === "low" ? "active" : ""}`}
          onClick={() => setStatusFilter("low")}
        >
          🟠 Stock faible ({kpis.low})
        </button>
        <button
          type="button"
          className={`filter-pill pill-ok ${statusFilter === "ok" ? "active" : ""}`}
          onClick={() => setStatusFilter("ok")}
        >
          🟢 En stock ({kpis.ok})
        </button>
      </div>

      {/* Panneau Admin repliable */}
      {isAdmin && adminSectionOpen && (
        <section className="stock-admin-panel">
          <div className="admin-panel-header">
            <h4>⚙️ Outils Administrateur & Inventaire Excel</h4>
            <span className="admin-badge">Réservé Admin</span>
          </div>

          <div className="admin-panel-grid">
            {/* Import Excel */}
            <div className="admin-card">
              <h5>📥 Import Fichier Inventaire Excel</h5>
              <p className="admin-sub">
                Importation directe depuis la feuille « POINT GENERAL » (bloc STOCK RESTANT)
              </p>
              <form onSubmit={handleExcelImport} className="admin-import-form">
                <label className="form-field">
                  <span>Mode de traitement des quantités</span>
                  <select value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                    <option value="add">➕ Ajouter la livraison au stock actuel</option>
                    <option value="set">🔄 Définir le stock restant exact (Inventaire)</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Fichier Excel (.xlsx, .xls)</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.xlsm"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!importFile || importLoading}
                  style={{ marginTop: 8 }}
                >
                  {importLoading ? "Import en cours…" : "🚀 Lancer l'import Excel"}
                </button>
              </form>
            </div>

            {/* Rapports & Exports */}
            <div className="admin-card">
              <h5>📊 Exports & Rapports de Gestion</h5>
              <div className="admin-links-stack">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => window.open(getPointMaterielExcelUrl(), "_blank")}
                >
                  📊 Point Matériel Excel (Consommation globale)
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => window.open(getExcelHebdoUrl(), "_blank")}
                >
                  📅 Rapport Hebdomadaire Excel
                </button>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
                  <label className="form-field" style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 12 }}>Mois de clôture</span>
                    <input
                      type="month"
                      value={moisExport}
                      onChange={(e) => setMoisExport(e.target.value)}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 12 }}
                      onClick={() => window.open(getExcelMoisUrl(moisExport), "_blank")}
                    >
                      Excel du mois
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 12 }}
                      onClick={() => window.open(getPdfMoisUrl(moisExport), "_blank")}
                    >
                      PDF du mois
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 12 }}
                      onClick={() => window.open(getHistoriqueUrl(), "_blank")}
                    >
                      ZIP Historique
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Panneau Historique des Mouvements */}
      {movementsOpen && (
        <section className="stock-movements-panel">
          <div className="movements-panel-header">
            <h4>
              🕘 Historique des Mouvements {movementsLoading && "..."}
            </h4>
            <input
              type="text"
              className="movements-filter-input"
              placeholder="Filtrer mouvements (article, client, technicien)..."
              value={movementFilterQuery}
              onChange={(e) => setMovementFilterQuery(e.target.value)}
            />
          </div>

          {filteredMovements.length === 0 ? (
            <p className="empty-movements-hint">
              {movementsLoading ? "Chargement des mouvements..." : "Aucun mouvement trouvé."}
            </p>
          ) : (
            <div className="movements-list-wrap">
              <table className="movements-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Article</th>
                    <th>Quantité</th>
                    <th>Date</th>
                    <th>Motif / Contexte</th>
                    <th>Intervenant</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.map((m, i) => {
                    const meta = getItemMeta(m.designation);
                    const isEntree = m.type === "entree";
                    return (
                      <tr key={m.id ?? i} className={isEntree ? "row-entree" : "row-sortie"}>
                        <td>
                          <span className={`badge-mv-type ${isEntree ? "in" : "out"}`}>
                            {isEntree ? "➕ ENTRÉE" : "➖ SORTIE"}
                          </span>
                        </td>
                        <td>
                          <strong>{meta.label}</strong>
                          <span className="mv-raw-desig"> ({m.designation})</span>
                        </td>
                        <td className="mv-qty">
                          <strong>{isEntree ? `+${m.quantite}` : `-${m.quantite}`}</strong>
                        </td>
                        <td className="mv-date">
                          {m.date_mouvement ? formatDateTimeFR(m.date_mouvement) : "—"}
                        </td>
                        <td className="mv-context">
                          <span>{m.motif || "Mouvement de stock"}</span>
                          {m.int_nom_client && (
                            <span className="mv-client-tag"> · {m.int_nom_client}</span>
                          )}
                        </td>
                        <td className="mv-tech">{m.nom_technicien || "Système"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Grille principale des Articles en Stock */}
      <section className="stock-grid-section">
        {loading ? (
          <div className="stock-loading-state">
            <span className="loading-spinner">⏳</span>
            <p>Chargement du stock en cours...</p>
          </div>
        ) : filteredDesignations.length === 0 ? (
          <div className="stock-empty-state">
            <span style={{ fontSize: 40 }}>📦</span>
            <h4>Aucun matériel correspondant</h4>
            <p>Modifiez vos critères de recherche ou réinitialisez les filtres.</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          <div className="stock-cards-grid">
            {filteredDesignations.map((d) => {
              const qty = stock[d] ?? 0;
              const meta = getItemMeta(d);
              const isRupture = qty <= 0;
              const isLow = qty > 0 && qty < SEUIL_ALERTE;

              let statusClass = "status-ok";
              let statusLabel = "En stock";
              if (qty < 0) {
                statusClass = "status-negative";
                statusLabel = `Déficit (${qty})`;
              } else if (qty === 0) {
                statusClass = "status-rupture";
                statusLabel = "Rupture";
              } else if (isLow) {
                statusClass = "status-low";
                statusLabel = "Stock bas";
              }

              return (
                <div key={d} className={`stock-item-card ${statusClass}`}>
                  <div className="card-top">
                    <div className="card-icon-title">
                      <span className="card-icon">{meta.icon}</span>
                      <div>
                        <h4 className="card-item-title">{meta.label}</h4>
                        <span className="card-item-category">{meta.cat} · {d}</span>
                      </div>
                    </div>
                    <span className={`stock-status-badge ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="card-body-qty">
                    <span className="card-qty-number">{qty}</span>
                    <span className="card-qty-unit">unités</span>
                  </div>

                  <div className="card-actions">
                    <div className="quick-step-group">
                      <button
                        type="button"
                        className="btn-step-stock step-minus"
                        title="Sortie express 1 unité"
                        onClick={() => handleQuickStep(d, -1)}
                      >
                        - 1
                      </button>
                      <button
                        type="button"
                        className="btn-step-stock step-plus"
                        title="Entrée express 1 unité"
                        onClick={() => handleQuickStep(d, 1)}
                      >
                        + 1
                      </button>
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        className="btn-edit-solde"
                        onClick={() => {
                          setEditModalItem(d);
                          setEditModalQty(String(qty));
                        }}
                      >
                        ✏️ Définir solde
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modale Mouvement Manuel Rapide */}
      {movementModalOpen && (
        <div className="modal-overlay" onClick={() => setMovementModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>➕ Enregistrer un mouvement de stock</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setMovementModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveManualMovement} className="modal-form">
              <label className="form-field">
                <span>Article / Désignation</span>
                <select
                  value={movementDesignation}
                  onChange={(e) => setMovementDesignation(e.target.value)}
                  required
                >
                  {allDesignations.map((d) => (
                    <option key={d} value={d}>
                      {getItemMeta(d).label} ({d}) — Actuel: {stock[d] ?? 0}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Type d'opération</span>
                <div className="segmented-control" style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    className={`btn-segment ${movementType === "entree" ? "active" : ""}`}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: 8,
                      border: "1.5px solid",
                      borderColor: movementType === "entree" ? "#10b981" : "#cbd5e1",
                      background: movementType === "entree" ? "#ecfdf5" : "#fff",
                      color: movementType === "entree" ? "#065f46" : "#64748b",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    onClick={() => setMovementType("entree")}
                  >
                    ➕ Entrée (+ stock)
                  </button>
                  <button
                    type="button"
                    className={`btn-segment ${movementType === "sortie" ? "active" : ""}`}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: 8,
                      border: "1.5px solid",
                      borderColor: movementType === "sortie" ? "#ef4444" : "#cbd5e1",
                      background: movementType === "sortie" ? "#fef2f2" : "#fff",
                      color: movementType === "sortie" ? "#991b1b" : "#64748b",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    onClick={() => setMovementType("sortie")}
                  >
                    ➖ Sortie (- stock)
                  </button>
                </div>
              </label>

              <label className="form-field">
                <span>Quantité à {movementType === "entree" ? "ajouter" : "retirer"}</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Ex: 5"
                  value={movementQty}
                  onChange={(e) => setMovementQty(e.target.value)}
                  required
                  autoFocus
                />
              </label>

              <label className="form-field">
                <span>Motif / Justification (optionnel)</span>
                <input
                  type="text"
                  placeholder="Ex: Réception magasin, Retour véhicule, Dotation..."
                  value={movementMotif}
                  onChange={(e) => setMovementMotif(e.target.value)}
                />
              </label>

              <div className="modal-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setMovementModalOpen(false)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={movementSaving}
                >
                  {movementSaving ? "Enregistrement..." : "Valider le mouvement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Définir Solde Direct (Admin) */}
      {editModalItem && (
        <div className="modal-overlay" onClick={() => setEditModalItem(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✏️ Définir le solde exact (Admin)</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setEditModalItem(null)}
              >
                ✕
              </button>
            </div>
            <div style={{ margin: "14px 0" }}>
              <p style={{ margin: 0, fontSize: 14 }}>
                Article : <strong>{getItemMeta(editModalItem).label}</strong> ({editModalItem})
              </p>
              <p style={{ margin: "4px 0 14px", fontSize: 13, color: "#64748b" }}>
                Solde actuel : <strong>{stock[editModalItem] ?? 0} unités</strong>
              </p>
              <label className="form-field">
                <span>Nouveau solde d'inventaire</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editModalQty}
                  onChange={(e) => setEditModalQty(e.target.value)}
                  autoFocus
                />
              </label>
            </div>
            <div className="modal-actions" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditModalItem(null)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={editModalSaving}
                onClick={handleSaveAdminQuantity}
              >
                {editModalSaving ? "Mise à jour..." : "Enregistrer le solde"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
