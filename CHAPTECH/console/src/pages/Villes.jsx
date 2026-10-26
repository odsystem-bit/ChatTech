import { useState } from 'react';
import { api } from '../api.js';
import { Badge, Bouton, Champ, Tableau, useCharge } from '../components/ui.jsx';

export default function Villes() {
  const villes = useCharge(() => api.get('/villes'));
  const [form, setForm] = useState({ nom: '', code: '' });
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  async function creer(e) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/villes', form);
      setForm({ nom: '', code: '' });
      villes.recharger();
    } catch (err) {
      setErreur(err.corps?.error ?? err.corps?.message ?? 'Échec de la création.');
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer(id, nom) {
    if (!confirm(`Supprimer la ville ${nom} ?`)) return;
    try {
      await api.delete(`/villes/${id}`);
      villes.recharger();
    } catch (err) {
      alert(err.corps?.error ?? 'Erreur lors de la suppression.');
    }
  }

  const liste = villes.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Villes d'intervention</h1>
        <p className="text-xs text-slate-400">
          Configuration des secteurs géographiques et rattachement des équipes et acteurs locaux (§2, §3 PLAN.md)
        </p>
      </div>

      <form onSubmit={creer} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:grid-cols-3">
        <Champ
          label="Nom de la Ville *"
          required
          placeholder="ex: Cotonou, Parakou, Porto-Novo..."
          value={form.nom}
          onChange={(e) => setForm({ ...form, nom: e.target.value })}
        />
        <Champ
          label="Code (optionnel)"
          placeholder="ex: COT, PAR, PN"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
        <div className="flex items-end">
          <Bouton type="submit" disabled={envoi}>+ Ajouter la ville</Bouton>
        </div>
        {erreur && <p className="col-span-3 text-sm text-rose-400">{erreur}</p>}
      </form>

      {villes.chargement && <p className="text-slate-400">Chargement…</p>}
      {villes.data && (
        <Tableau
          lignes={liste}
          vide="Aucune ville configurée. Ajoutez Cotonou, Parakou, etc. ci-dessus."
          colonnes={[
            { cle: 'nom', label: 'Nom', rendu: (v) => <span className="font-semibold text-slate-100">{v.nom}</span> },
            { cle: 'code', label: 'Code', rendu: (v) => <span className="font-mono text-xs text-slate-400">{v.code || '—'}</span> },
            { cle: 'equipes_count', label: 'Équipes rattachées', rendu: (v) => (
              <span className="text-sky-400 font-medium">{v.equipes_count ?? 0}</span>
            )},
            { cle: 'interventions_count', label: 'Dossiers totaux', rendu: (v) => (
              <span className="text-slate-300">{v.interventions_count ?? 0}</span>
            )},
            { cle: 'actif', label: 'Statut', rendu: (v) => <Badge valeur={v.actif ? 'actif' : 'suspendu'} /> },
            { cle: 'actions', label: '', rendu: (v) => (
              <Bouton variante="danger" onClick={() => supprimer(v.id, v.nom)}>
                Supprimer
              </Bouton>
            )},
          ]}
        />
      )}
    </div>
  );
}
