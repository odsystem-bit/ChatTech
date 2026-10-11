import { useState } from 'react';
import { api } from '../api.js';
import { Badge, Bouton, Champ, Select, Tableau, useCharge } from '../components/ui.jsx';

// Libellé lisible d'un propriétaire de stock
function proprietaire(s, equipes) {
  if (s.proprietaire_type === 'central') return 'Central';
  if (s.proprietaire_type === 'intervention') return 'Posé sur chantiers';
  const eq = equipes.find((e) => e.id === s.proprietaire_id);
  return eq ? `Équipe ${eq.nom}` : `Équipe #${s.proprietaire_id}`;
}

export default function Stock() {
  const equipes = useCharge(() => api.get('/equipes'));
  const [filtre, setFiltre] = useState({ central: '1', equipe: '' });
  const chemin = filtre.equipe
    ? `/stock?equipe=${filtre.equipe}`
    : `/stock?central=1`;
  const stocks = useCharge(() => api.get(chemin), [chemin]);

  const [mvt, setMvt] = useState({
    article_id: '', de_type: 'central', vers_type: 'equipe',
    vers_id: '', quantite: 1, motif: 'attribution',
  });
  const [articles, setArticles] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  // Charge le catalogue articles une fois (pour le select du mouvement)
  useCharge(async () => {
    const page = await api.get('/articles');
    setArticles(page.data ?? []);
    return page;
  }, []);

  async function mouvement(e) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const versId = mvt.vers_type === 'equipe' ? Number(mvt.vers_id) : 0;
      await api.post('/stock/mouvements', {
        uuid: crypto.randomUUID(),
        article_id: Number(mvt.article_id),
        de_type: mvt.de_type,
        de_id: mvt.de_type === 'equipe' ? Number(mvt.vers_id) || 0 : 0,
        vers_type: mvt.vers_type,
        vers_id: versId,
        quantite: Number(mvt.quantite),
        motif: mvt.motif,
      });
      stocks.recharger();
    } catch (err) {
      setErreur(err.corps?.errors
        ? Object.values(err.corps.errors).flat().join(' ')
        : err.corps?.message ?? 'Mouvement refusé.');
    } finally {
      setEnvoi(false);
    }
  }

  const listeEquipes = equipes.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Stock</h1>

      <div className="flex flex-wrap items-end gap-3">
        <Select label="Vue" value={filtre.equipe || 'central'}
          onChange={(e) => setFiltre({
            central: e.target.value === 'central' ? '1' : '',
            equipe: e.target.value === 'central' ? '' : e.target.value,
          })}>
          <option value="central">Stock central</option>
          {listeEquipes.map((eq) => (
            <option key={eq.id} value={eq.id}>Équipe {eq.nom}</option>
          ))}
        </Select>
      </div>

      <form onSubmit={mouvement}
        className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:grid-cols-3 lg:grid-cols-7">
        <Select label="Article" required value={mvt.article_id}
          onChange={(e) => setMvt({ ...mvt, article_id: e.target.value })}>
          <option value="">— Choisir —</option>
          {articles.map((a) => (
            <option key={a.id} value={a.id}>{a.code} — {a.libelle}</option>
          ))}
        </Select>
        <Select label="Depuis" value={mvt.de_type}
          onChange={(e) => setMvt({ ...mvt, de_type: e.target.value })}>
          <option value="central">Central</option>
          <option value="exterieur">Extérieur (achat)</option>
          <option value="equipe">Équipe (vers équipe = retour)</option>
        </Select>
        <Select label="Vers" value={mvt.vers_type}
          onChange={(e) => setMvt({ ...mvt, vers_type: e.target.value })}>
          <option value="central">Central</option>
          <option value="equipe">Équipe</option>
        </Select>
        <Select label="Équipe" required={mvt.de_type === 'equipe' || mvt.vers_type === 'equipe'}
          value={mvt.vers_id}
          onChange={(e) => setMvt({ ...mvt, vers_id: e.target.value })}>
          <option value="">— Choisir —</option>
          {listeEquipes.map((eq) => (
            <option key={eq.id} value={eq.id}>{eq.nom}</option>
          ))}
        </Select>
        <Champ label="Quantité" type="number" min={1} required value={mvt.quantite}
          onChange={(e) => setMvt({ ...mvt, quantite: e.target.value })} />
        <Select label="Motif" value={mvt.motif}
          onChange={(e) => setMvt({ ...mvt, motif: e.target.value })}>
          {['attribution', 'retour', 'import'].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>
        <div className="flex items-end">
          <Bouton type="submit" disabled={envoi}>Valider</Bouton>
        </div>
        {erreur && <p className="col-span-full text-sm text-red-400">{erreur}</p>}
      </form>

      {stocks.chargement && <p className="text-slate-400">Chargement…</p>}
      {stocks.data && (
        <Tableau
          lignes={stocks.data}
          vide="Aucune ligne de stock."
          colonnes={[
            { cle: 'article', label: 'Article', rendu: (s) => `${s.article?.code} — ${s.article?.libelle}` },
            { cle: 'proprietaire', label: 'Propriétaire', rendu: (s) => proprietaire(s, listeEquipes) },
            {
              cle: 'quantite', label: 'Quantité',
              rendu: (s) => (
                <span className={s.quantite < 0 ? 'text-red-400 font-medium' : ''}>
                  {s.quantite}
                </span>
              ),
            },
            { cle: 'unite', label: 'Unité', rendu: (s) => s.article?.unite ?? '—' },
          ]}
        />
      )}
      {stocks.data?.some((s) => s.quantite < 0) && (
        <p className="text-sm text-amber-400">
          <Badge valeur="en_cours" /> Des soldes sont négatifs — terrain non bloqué (§5),
          mais à régulariser.
        </p>
      )}
    </div>
  );
}
