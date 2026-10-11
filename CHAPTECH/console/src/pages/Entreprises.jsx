import { useState } from 'react';
import { api } from '../api.js';
import { Badge, Bouton, Champ, Select, Tableau, useCharge } from '../components/ui.jsx';

const ETATS = ['essai', 'actif', 'lecture_seule', 'suspendu'];

export default function Entreprises() {
  const entreprises = useCharge(() => api.get('/entreprises'));
  const [form, setForm] = useState({
    nom: '', admin_identifiant: '', admin_nom: '', admin_password: '',
    etat_abonnement: 'essai', limite_equipes: 5,
  });
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  async function creer(e) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/entreprises', {
        ...form,
        limite_equipes: Number(form.limite_equipes),
      });
      setForm({
        nom: '', admin_identifiant: '', admin_nom: '', admin_password: '',
        etat_abonnement: 'essai', limite_equipes: 5,
      });
      entreprises.recharger();
    } catch (err) {
      setErreur(err.corps?.errors
        ? Object.values(err.corps.errors).flat().join(' ')
        : err.corps?.message ?? 'Échec de la création.');
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer(ent) {
    if (!confirm(`Supprimer l'entreprise « ${ent.nom} » (soft delete) ?`)) return;
    await api.delete(`/entreprises/${ent.id}`);
    entreprises.recharger();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Entreprises</h1>

      <form onSubmit={creer}
        className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:grid-cols-3">
        <Champ label="Nom de l'entreprise" required value={form.nom}
          onChange={(e) => setForm({ ...form, nom: e.target.value })} />
        <Select label="État" value={form.etat_abonnement}
          onChange={(e) => setForm({ ...form, etat_abonnement: e.target.value })}>
          {ETATS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Champ label="Limite équipes" type="number" min={1} required
          value={form.limite_equipes}
          onChange={(e) => setForm({ ...form, limite_equipes: e.target.value })} />
        <Champ label="Admin — identifiant" required value={form.admin_identifiant}
          onChange={(e) => setForm({ ...form, admin_identifiant: e.target.value })} />
        <Champ label="Admin — nom" required value={form.admin_nom}
          onChange={(e) => setForm({ ...form, admin_nom: e.target.value })} />
        <Champ label="Admin — mot de passe" type="password" required minLength={8}
          value={form.admin_password}
          onChange={(e) => setForm({ ...form, admin_password: e.target.value })} />
        <div className="col-span-3 flex items-end">
          <Bouton type="submit" disabled={envoi}>Créer l'entreprise + admin</Bouton>
        </div>
        {erreur && <p className="col-span-3 text-sm text-red-400">{erreur}</p>}
      </form>

      {entreprises.chargement && <p className="text-slate-400">Chargement…</p>}
      {entreprises.data && (
        <Tableau
          lignes={entreprises.data.data ?? []}
          vide="Aucune entreprise."
          colonnes={[
            { cle: 'nom', label: 'Nom' },
            { cle: 'etat_abonnement', label: 'État', rendu: (e) => <Badge valeur={e.etat_abonnement} /> },
            { cle: 'fin_abonnement', label: 'Fin abo', rendu: (e) => e.fin_abonnement?.slice(0, 10) ?? '—' },
            { cle: 'limite_equipes', label: 'Max équipes' },
            { cle: 'equipes_count', label: 'Équipes' },
            { cle: 'comptes_count', label: 'Comptes' },
            {
              cle: 'actions', label: '',
              rendu: (e) => (
                <Bouton variante="danger" onClick={() => supprimer(e)}>Supprimer</Bouton>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
