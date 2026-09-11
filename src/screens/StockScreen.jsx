import { useState, useEffect } from "react";
import {
  fetchStock,
  getDesignations,
  incrementStock,
  findExistingDesignation,
} from "../lib/stock";

const SEUIL_ALERTE = 5;

export default function StockScreen({ onClose }) {
  const [stock, setStock] = useState({});
  const [designationInput, setDesignationInput] = useState("");
  const [qteServie, setQteServie] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStock();
  }, []);

  async function loadStock() {
    setLoading(true);
    const s = await fetchStock();
    setStock(s);
    setLoading(false);
  }

  async function handleAddBon(e) {
    e.preventDefault();
    const qte = Number(qteServie);
    if (!qte || !designationInput.trim()) return;

    const existing = findExistingDesignation(designationInput);
    const updated = await incrementStock(designationInput, qte);
    setStock({ ...updated });
    setFeedback(
      existing
        ? `Ajouté à "${existing}" (désignation existante reconnue).`
        : `Nouvelle désignation "${designationInput.trim()}" créée.`
    );
    setDesignationInput("");
    setQteServie(0);
  }

  const designations = Object.keys(stock).sort((a, b) => a.localeCompare(b));

  return (
    <div className="stock-screen">
      <header className="form-header">
        <h2>Stock d'équipe</h2>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Retour
        </button>
      </header>

      <form className="stock-form" onSubmit={handleAddBon}>
        <label className="form-field">
          <span>Désignation (bon reçu)</span>
          <input
            type="text"
            list="designations-list"
            placeholder="Ex: Piton, ONT, Jarretière..."
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
          <span>Qté servie</span>
          <input
            type="number"
            value={qteServie}
            onChange={(e) => setQteServie(e.target.value)}
          />
        </label>
        <button type="submit" className="btn-primary">
          + Ajouter au stock
        </button>
      </form>

      {feedback && <p className="gps-status">{feedback}</p>}

      <h3>Stock actuel {loading && "…"}</h3>
      <ul className="stock-list">
        {designations.map((d) => {
          const qte = stock[d] ?? 0;
          const low = qte < SEUIL_ALERTE;
          return (
            <li key={d} className={low ? "low" : ""}>
              <span>{d}</span>
              <strong>{qte}</strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
