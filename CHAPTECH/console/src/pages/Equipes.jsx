import { useState } from 'react';
import { api } from '../api.js';
import { Badge, Bouton, Champ, Select, Tableau, useCharge } from '../components/ui.jsx';

const ROLES_CHEF = ['admin', 'gestionnaire', 'chef'];

export default function Equipes() {
  const equipes = useCharge(() => api.get('/equipes'));
  const comptes = useCharge(() => api.get('/comptes'));
  const [form, setForm] = useState({ nom: '', chef_compte_id: '' });
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const membres = comptes.data?.data ?? [];
  const eligibles = membres.filter((c) => ROLES_CHEF.includes(c.role));

  async function creer(e) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/equipes', {
        nom: form.nom,
        chef_compte_id: form.chef_compte_id ? Number(form.chef_compte_id) : null,
      });
      setForm({ nom: '', chef_compte_id: '' });
      equipes.recharger();
    } catch (err) {
      setErreur(err.corps?.error ?? err.corps?.message ?? 'Échec de la création.');
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer(id) {
    if (!confirm('Supprimer cette équipe ?')) return;
    await api.delete(`/equipes/${id}`);
    equipes.recharger();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Équipes</h1>

      <form onSubmit={creer}
        className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:grid-cols-3">
        <Champ label="Nom" required value={form.nom}
          onChange={(e) => setForm({ ...form, nom: e.target.value })} />
        <Select label="Chef d'équipe (optionnel)" value={form.chef_compte_id}
          onChange={(e) => setForm({ ...form, chef_compte_id: e.target.value })}>
          <option value="">— Aucun —</option>
          {eligibles.map((c) => (
            <option key={c.id} value={c.id}>{c.nom} ({c.role})</option>
          ))}
        </Select>
        <div className="flex items-end">
          <Bouton type="submit" disabled={envoi}>Créer l'équipe</Bouton>
        </div>
        {erreur && <p className="col-span-3 text-sm text-red-400">{erreur}</p>}
      </form>

      {equipes.chargement && <p className="text-slate-400">Chargement…</p>}
      {equipes.data && (
        <Tableau
          lignes={equipes.data}
          vide="Aucune équipe — créez la première ci-dessus."
          colonnes={[
            { cle: 'nom', label: 'Nom' },
            { cle: 'chef', label: 'Chef', rendu: (e) => e.chef?.nom ?? '—' },
            { cle: 'comptes_count', label: 'Membres' },
            { cle: 'actif', label: 'Statut', rendu: (e) => <Badge valeur={e.actif ? 'actif' : 'suspendu'} /> },
            {
              cle: 'actions', label: '',
              rendu: (e) => (
                <Bouton variante="danger" onClick={() => supprimer(e.id)}>Supprimer</Bouton>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
