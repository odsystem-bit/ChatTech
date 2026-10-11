import { useState } from 'react';
import { api } from '../api.js';
import { Badge, Select, Tableau, useCharge } from '../components/ui.jsx';

export default function Interventions() {
  const [statut, setStatut] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams();
  if (statut) params.set('statut', statut);
  params.set('page', page);

  const interventions = useCharge(
    () => api.get(`/interventions?${params}`),
    [statut, page],
  );

  const donnees = interventions.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Interventions</h1>

      <Select label="Statut" value={statut}
        onChange={(e) => { setStatut(e.target.value); setPage(1); }}
        className="max-w-xs">
        <option value="">Tous</option>
        <option value="en_cours">En cours</option>
        <option value="termine">Terminé</option>
      </Select>

      {interventions.chargement && <p className="text-slate-400">Chargement…</p>}
      {donnees && (
        <>
          <Tableau
            lignes={donnees.data ?? []}
            vide="Aucune intervention."
            colonnes={[
              { cle: 'date', label: 'Date', rendu: (i) => i.date?.slice(0, 10) ?? '—' },
              { cle: 'client_nom', label: 'Client', rendu: (i) => i.client_nom ?? '—' },
              { cle: 'adresse', label: 'Adresse', rendu: (i) => i.adresse ?? '—' },
              { cle: 'equipe', label: 'Équipe', rendu: (i) => i.equipe?.nom ?? '—' },
              { cle: 'chef_nom', label: 'Chef', rendu: (i) => i.chef_nom ?? '—' },
              { cle: 'statut', label: 'Statut', rendu: (i) => <Badge valeur={i.statut} /> },
              { cle: 'revision', label: 'Rév.' },
            ]}
          />
          {donnees.last_page > 1 && (
            <div className="flex items-center gap-3 text-sm">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                className="rounded-lg border border-slate-700 px-3 py-1 disabled:opacity-40">
                ← Précédent
              </button>
              <span className="text-slate-400">Page {donnees.current_page} / {donnees.last_page}</span>
              <button disabled={page >= donnees.last_page} onClick={() => setPage(page + 1)}
                className="rounded-lg border border-slate-700 px-3 py-1 disabled:opacity-40">
                Suivant →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
