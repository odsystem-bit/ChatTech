import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Bouton, Champ, Select, Tableau, useCharge } from '../components/ui.jsx';

const ROLES = ['admin', 'gestionnaire', 'chef', 'technicien'];

export default function Comptes() {
  const { compte: moi } = useAuth();
  const comptes = useCharge(() => api.get('/comptes'));
  const equipes = useCharge(() => api.get('/equipes'));
  const [form, setForm] = useState({
    identifiant: '', nom: '', password: '', role: 'technicien', equipe_id: '',
  });
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  async function creer(e) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/comptes', {
        ...form,
        equipe_id: form.equipe_id ? Number(form.equipe_id) : null,
      });
      setForm({ identifiant: '', nom: '', password: '', role: 'technicien', equipe_id: '' });
      comptes.recharger();
    } catch (err) {
      setErreur(err.corps?.errors
        ? Object.values(err.corps.errors).flat().join(' ')
        : err.corps?.message ?? 'Échec de la création.');
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer(c) {
    if (c.id === moi.id) return; // le backend le refuse aussi
    if (!confirm(`Supprimer le compte ${c.identifiant} ?`)) return;
    await api.delete(`/comptes/${c.id}`);
    comptes.recharger();
  }

  const lignes = comptes.data?.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Comptes</h1>

      <form onSubmit={creer}
        className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Champ label="Identifiant" required value={form.identifiant}
          onChange={(e) => setForm({ ...form, identifiant: e.target.value })} />
        <Champ label="Nom" required value={form.nom}
          onChange={(e) => setForm({ ...form, nom: e.target.value })} />
        <Champ label="Mot de passe" type="password" required minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Select label="Rôle" value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
        <Select label="Équipe" value={form.equipe_id}
          onChange={(e) => setForm({ ...form, equipe_id: e.target.value })}>
          <option value="">— Aucune —</option>
          {(equipes.data ?? []).map((eq) => (
            <option key={eq.id} value={eq.id}>{eq.nom}</option>
          ))}
        </Select>
        <div className="flex items-end">
          <Bouton type="submit" disabled={envoi}>Créer</Bouton>
        </div>
        {erreur && <p className="col-span-full text-sm text-red-400">{erreur}</p>}
      </form>

      {comptes.chargement && <p className="text-slate-400">Chargement…</p>}
      {comptes.data && (
        <Tableau
          lignes={lignes}
          vide="Aucun compte."
          colonnes={[
            { cle: 'identifiant', label: 'Identifiant' },
            { cle: 'nom', label: 'Nom' },
            { cle: 'role', label: 'Rôle', rendu: (c) => <Badge valeur={c.role} /> },
            { cle: 'equipe', label: 'Équipe', rendu: (c) => c.equipe?.nom ?? '—' },
            {
              cle: 'actions', label: '',
              rendu: (c) => c.id !== moi.id && (
                <Bouton variante="danger" onClick={() => supprimer(c)}>Supprimer</Bouton>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
