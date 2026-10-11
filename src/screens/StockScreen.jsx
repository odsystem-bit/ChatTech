import { useState, useEffect } from "react";
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

export default function StockScreen({ onClose, isAdmin = false }) {
  const [stock, setStock] = useState({});
  const [designationInput, setDesignationInput] = useState("");
  const [qteServie, setQteServie] = useState("");
  const [movementType, setMovementType] = useState("entree");
  const [importMode, setImportMode] = useState("add");
  const [importFile, setImportFile] = useState(null);
  const [editingDesignation, setEditingDesignation] = useState(null);
  const [editingQuantity, setEditingQuantity] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState([]);
  // Clôture mensuelle : mois choisi pour les exports
  const [moisExport, setMoisExport] = useState(new Date().toISOString().slice(0, 7));
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [movementsLoading, setMovementsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchStock().then((currentStock) => {
      if (cancelled) return;
      setStock(currentStock);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  async function handleAddBon(e) {
    e.preventDefault();
    const qte = Number(qteServie);
    if (!Number.isInteger(qte) || qte <= 0 || !designationInput.trim()) return;

    const existing = findExistingDesignation(designationInput);
    try {
      const updated = await moveStockItem(
        designationInput,
        movementType,
        qte,
        movementType === "entree" ? "Réception manuelle" : "Retrait manuel"
      );
      setStock({ ...updated });
      const label = existing || designationInput.trim();
      setFeedback(`${movementType === "entree" ? "Ajout de" : "Retrait de"} ${qte} pour "${label}".`);
      setDesignationInput("");
      setQteServie("");
    } catch (err) {
      setFeedback(`Erreur d'enregistrement : ${err.message}`);
    }
  }

  async function handleExcelImport(e) {
    e.preventDefault();
    if (!importFile) return;
    const form = e.currentTarget;
    try {
      const { result, stock: updated } = await importStockExcel(importFile, importMode);
      setStock(updated);
      setFeedback(
        `${importMode === "add" ? "Ajout" : "Inventaire mis à jour"} : ${result.count} articles traités.` +
          (result.not_found?.length ? ` Colonnes ignorées : ${result.not_found.join(", ")}.` : "")
      );
      setImportFile(null);
      form.reset();
    } catch (err) {
      setFeedback(`Erreur d'import : ${err.message}`);
    }
  }

  async function handleSetQuantity(designation) {
    const quantity = Number(editingQuantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setFeedback("La quantité doit être un entier positif ou zéro.");
      return;
    }
    try {
      const updated = await saveStockItem(designation, quantity);
      setStock({ ...updated });
      setFeedback(`Solde de "${designation}" défini à ${quantity}.`);
      setEditingDesignation(null);
    } catch (err) {
      setFeedback(`Erreur d'ajustement : ${err.message}`);
    }
  }

  async function loadMovements() {
    setMovementsLoading(true);
    try {
      setMovements(await fetchStockMovements(100));
    } catch (err) {
      setFeedback(`Erreur mouvements : ${err.message}`);
    }
    setMovementsLoading(false);
  }

  function toggleMovements() {
    if (!movementsOpen && movements.length === 0) loadMovements();
    setMovementsOpen(!movementsOpen);
  }

  const designations = Object.keys(stock).sort((a, b) => a.localeCompare(b));

  return (
    <div className="stock-screen">
      <header className="form-header">
        <h2>📦 Stock d'équipe</h2>
        <button type="button" className="btn-secondary" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
            <path d="M3 12l6 6 12-12" />
          </svg>
          Retour
        </button>
      </header>

      <form className="stock-form" onSubmit={handleAddBon}>
        <label className="form-field">
          <span>Désignation</span>
          <input
            type="text"
            list="designations-list"
            placeholder="Ex. Piton, ONT, Jarretière"
            value={designationInput}
            onChange={(e) => setDesignationInput(e.target.value)}
          />
          <datalist id="designations-list">
            {designations.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
        <label className="form-field">
          <span>Mouvement</span>
          <select value={movementType} onChange={(e) => setMovementType(e.target.value)}>
            <option value="entree">Ajouter au stock</option>
            <option value="sortie">Retirer du stock</option>
          </select>
        </label>
        <label className="form-field">
          <input
            type="number"
            min="1"
            step="1"
            aria-label="Quantité du mouvement"
            placeholder="Qté"
            value={qteServie}
            onChange={(e) => setQteServie(e.target.value)}
          />
        </label>
        <button type="submit" className="btn-primary">
          {movementType === "entree" ? "Ajouter" : "Retirer"}
        </button>
      </form>

      {feedback && <p className="gps-status">{feedback}</p>}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => window.open(getStockPdfUrl("pdf_stock_view"), "_blank")}
        >
          📄 Voir le PDF stock
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={toggleMovements}
        >
          {movementsOpen ? "Masquer les mouvements" : "🕘 Mouvements"}
        </button>
      </div>

      {movementsOpen && (
        <section className="stock-import-section">
          <h3>Historique des mouvements {movementsLoading && "…"}</h3>
          {movements.length === 0 && !movementsLoading ? (
            <p className="gps-status">Aucun mouvement enregistré.</p>
          ) : (
            <ul className="stock-list">
              {movements.map((m, i) => (
                <li key={m.id ?? i}>
                  <span className="stock-designation">
                    {m.type === "entree" ? "➕" : "➖"} {m.designation} × {m.quantite}
                  </span>
                  <div className="badge-meta">
                    {m.date_mouvement ? formatDateTimeFR(m.date_mouvement) : ""}
                    {m.motif ? ` · ${m.motif}` : ""}
                    {m.int_nom_client ? ` · ${m.int_nom_client}` : ""}
                    {m.nom_technicien ? ` · ${m.nom_technicien}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isAdmin && (
        <section className="stock-import-section">
          <h3>Import hebdomadaire Excel</h3>
          <form className="stock-import-form" onSubmit={handleExcelImport}>
            <label className="form-field">
              <span>Traitement des quantités du fichier</span>
              <select value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                <option value="add">Ajouter la livraison au stock actuel</option>
                <option value="set">Définir le stock restant exact</option>
              </select>
            </label>
            <label className="form-field">
              <span>Fichier d’inventaire</span>
              <input
                type="file"
                accept=".xlsx,.xls,.xlsm"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button type="submit" className="btn-secondary" disabled={!importFile}>
              Importer Excel
            </button>
          </form>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => window.open(getPointMaterielExcelUrl(), "_blank")}
            >
              📊 Télécharger le Point Excel (Admin)
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => window.open(getExcelHebdoUrl(), "_blank")}
            >
              📅 Télécharger le Rapport Hebdo (Admin)
            </button>
          </div>

          <h3 style={{ marginTop: 20 }}>Clôture mensuelle</h3>
          <label className="form-field">
            <span>Mois à exporter</span>
            <input
              type="month"
              value={moisExport}
              onChange={(e) => setMoisExport(e.target.value)}
            />
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => window.open(getListeMoisUrl(moisExport), "_blank")}
            >
              📋 Liste clients du mois (copiable)
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => window.open(getPdfMoisUrl(moisExport), "_blank")}
            >
              📄 Liste du mois en PDF
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => window.open(getExcelMoisUrl(moisExport), "_blank")}
            >
              📅 Rapport Excel du mois
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => window.open(getHistoriqueUrl(), "_blank")}
            >
              🗂 Tout l'historique (ZIP par mois)
            </button>
          </div>
        </section>
      )}

      <h3>Stock actuel {loading && "…"}</h3>
      {designations.length === 0 && !loading ? (
        <div className="empty-state">
          <p style={{ fontSize: 28, marginBottom: 8 }}>📦</p>
          Aucun stock enregistré.
        </div>
      ) : (
        <ul className="stock-list">
          {designations.map((d) => {
            const qte = stock[d] ?? 0;
            const low = qte < SEUIL_ALERTE;
            return (
              <li key={d} className={low ? "low" : ""}>
                <span className="stock-designation">{d}</span>
                {isAdmin && editingDesignation === d ? (
                  <div className="stock-edit-controls">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      aria-label={`Nouveau solde pour ${d}`}
                      value={editingQuantity}
                      onChange={(e) => setEditingQuantity(e.target.value)}
                    />
                    <button type="button" onClick={() => handleSetQuantity(d)}>Enregistrer</button>
                    <button type="button" onClick={() => setEditingDesignation(null)}>Annuler</button>
                  </div>
                ) : (
                  <div className="stock-item-actions">
                    <strong className="qty">{qte}</strong>
                    {isAdmin && (
                      <button
                        type="button"
                        className="stock-edit-btn"
                        onClick={() => {
                          setEditingDesignation(d);
                          setEditingQuantity(String(qte));
                        }}
                      >
                        Modifier
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
