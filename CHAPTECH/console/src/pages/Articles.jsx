import { useState } from 'react';
import { api } from '../api.js';
import { Bouton, Champ, Tableau, useCharge } from '../components/ui.jsx';

export default function Articles() {
  const [q, setQ] = useState('');
  const articles = useCharge(() => api.get(`/articles${q ? `?q=${encodeURIComponent(q)}` : ''}`), [q]);
  const [form, setForm] = useState({ code: '', libelle: '', unite: '' });
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  async function creer(e) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/articles', { ...form, unite: form.unite || null });
      setForm({ code: '', libelle: '', unite: '' });
      articles.recharger();
    } catch (err) {
      setErreur(err.corps?.errors
        ? Object.values(err.corps.errors).flat().join(' ')
        : err.corps?.message ?? 'Échec de la création.');
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimer(a) {
    if (!confirm(`Supprimer l'article ${a.code} ?`)) return;
    await api.delete(`/articles/${a.id}`);
    articles.recharger();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Articles</h1>

      <form onSubmit={creer}
        className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:grid-cols-4">
        <Champ label="Code" required value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })} />
        <Champ label="Libellé" required value={form.libelle}
          onChange={(e) => setForm({ ...form, libelle: e.target.value })} />
        <Champ label="Unité (m, u…)" value={form.unite}
          onChange={(e) => setForm({ ...form, unite: e.target.value })} />
        <div className="flex items-end">
          <Bouton type="submit" disabled={envoi}>Créer</Bouton>
        </div>
        {erreur && <p className="col-span-4 text-sm text-red-400">{erreur}</p>}
      </form>

      <Champ label="Rechercher (code ou libellé)" value={q}
        onChange={(e) => setQ(e.target.value)} />

      {articles.chargement && <p className="text-slate-400">Chargement…</p>}
      {articles.data && (
        <Tableau
          lignes={articles.data.data ?? []}
          vide="Aucun article."
          colonnes={[
            { cle: 'code', label: 'Code' },
            { cle: 'libelle', label: 'Libellé' },
            { cle: 'unite', label: 'Unité', rendu: (a) => a.unite ?? '—' },
            {
              cle: 'actions', label: '',
              rendu: (a) => (
                <Bouton variante="danger" onClick={() => supprimer(a)}>Supprimer</Bouton>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
