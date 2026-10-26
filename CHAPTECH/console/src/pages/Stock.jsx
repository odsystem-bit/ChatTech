import { useState } from 'react';
import { api } from '../api.js';
import { Badge, Bouton, Champ, Select, Tableau, useCharge } from '../components/ui.jsx';

// Libellé lisible d'un propriétaire de stock
function proprietaire(s, equipes, villes) {
  if (s.proprietaire_type === 'central') return 'Stock Central';
  if (s.proprietaire_type === 'intervention') return 'Posé sur chantiers';
  if (s.proprietaire_type === 'ville') {
    const v = villes.find((x) => x.id === s.proprietaire_id);
    return v ? `Dépôt Ville (${v.nom})` : `Dépôt Ville #${s.proprietaire_id}`;
  }
  const eq = equipes.find((e) => e.id === s.proprietaire_id);
  return eq ? `Équipe ${eq.nom}` : `Équipe #${s.proprietaire_id}`;
}

export default function Stock() {
  const equipes = useCharge(() => api.get('/equipes'));
  const villes = useCharge(() => api.get('/villes'));

  const [filtre, setFiltre] = useState({ type: 'central', id: '' });
  let chemin = '/stock?central=1';
  if (filtre.type === 'equipe' && filtre.id) {
    chemin = `/stock?equipe=${filtre.id}`;
  } else if (filtre.type === 'ville' && filtre.id) {
    chemin = `/stock?ville=${filtre.id}`;
  }

  const stocks = useCharge(() => api.get(chemin), [chemin]);
  const alertes = useCharge(() => api.get('/stock/alertes'));

  const [mvt, setMvt] = useState({
    article_id: '',
    de_type: 'central',
    de_id: '0',
    vers_type: 'ville',
    vers_id: '',
    quantite: 1,
    motif: 'alimentation_ville',
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
      const deId = mvt.de_type === 'central' || mvt.de_type === 'exterieur' ? 0 : Number(mvt.de_id);
      const versId = mvt.vers_type === 'central' || mvt.vers_type === 'exterieur' ? 0 : Number(mvt.vers_id);

      await api.post('/stock/mouvements', {
        uuid: crypto.randomUUID(),
        article_id: Number(mvt.article_id),
        de_type: mvt.de_type,
        de_id: deId,
        vers_type: mvt.vers_type,
        vers_id: versId,
        quantite: Number(mvt.quantite),
        motif: mvt.motif,
      });
      stocks.recharger();
      alertes.recharger();
    } catch (err) {
      setErreur(err.corps?.errors
        ? Object.values(err.corps.errors).flat().join(' ')
        : err.corps?.error ?? err.corps?.message ?? 'Mouvement refusé.');
    } finally {
      setEnvoi(false);
    }
  }

  const listeEquipes = equipes.data ?? [];
  const listeVilles = villes.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Gestion du Stock</h1>
        <p className="text-xs text-slate-400">
          Stock Central $\rightarrow$ Dépôts par Ville $\rightarrow$ Dotations d'Équipes terrain (§3, §5 PLAN.md)
        </p>
      </div>

      {alertes.data?.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="font-medium text-amber-300">
            {alertes.data.length} stock{alertes.data.length > 1 ? 's' : ''} négatif{alertes.data.length > 1 ? 's' : ''} à régulariser
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-200">
            {alertes.data.map((a) => (
              <li key={a.id}>
                {a.proprietaire} — {a.article?.code} {a.article?.libelle} :{' '}
                <span className="font-semibold text-red-400">{a.quantite}</span>
                {a.article?.unite ? ` ${a.article.unite}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sélecteur de vue : Central, Dépôt Ville, Équipe */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-sm text-slate-400">Emplacement à afficher</span>
          <select
            value={`${filtre.type}:${filtre.id}`}
            onChange={(e) => {
              const [t, id] = e.target.value.split(':');
              setFiltre({ type: t, id: id || '' });
            }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
          >
            <option value="central:">🏢 Stock Central Entreprise</option>
            <optgroup label="🏙️ Dépôts par Ville">
              {listeVilles.map((v) => (
                <option key={`v-${v.id}`} value={`ville:${v.id}`}>Dépôt Ville : {v.nom}</option>
              ))}
            </optgroup>
            <optgroup label="👷 Équipes terrain">
              {listeEquipes.map((eq) => (
                <option key={`eq-${eq.id}`} value={`equipe:${eq.id}`}>Équipe : {eq.nom}</option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      {/* Formulaire de mouvement */}
      <form onSubmit={mouvement}
        className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Select label="Article *" required value={mvt.article_id}
          onChange={(e) => setMvt({ ...mvt, article_id: e.target.value })}>
          <option value="">— Choisir article —</option>
          {articles.map((a) => (
            <option key={a.id} value={a.id}>{a.code} — {a.libelle}</option>
          ))}
        </Select>

        <Select label="Depuis" value={mvt.de_type}
          onChange={(e) => setMvt({ ...mvt, de_type: e.target.value })}>
          <option value="central">Central (Base)</option>
          <option value="ville">Dépôt de Ville</option>
          <option value="equipe">Équipe</option>
          <option value="exterieur">Extérieur (Achat)</option>
        </Select>

        {mvt.de_type === 'ville' && (
          <Select label="Ville d'origine *" required value={mvt.de_id}
            onChange={(e) => setMvt({ ...mvt, de_id: e.target.value })}>
            <option value="">— Choisir ville —</option>
            {listeVilles.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
          </Select>
        )}

        {mvt.de_type === 'equipe' && (
          <Select label="Équipe d'origine *" required value={mvt.de_id}
            onChange={(e) => setMvt({ ...mvt, de_id: e.target.value })}>
            <option value="">— Choisir équipe —</option>
            {listeEquipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nom}</option>)}
          </Select>
        )}

        <Select label="Vers" value={mvt.vers_type}
          onChange={(e) => setMvt({ ...mvt, vers_type: e.target.value })}>
          <option value="ville">Dépôt de Ville</option>
          <option value="equipe">Équipe</option>
          <option value="central">Central (Retour)</option>
        </Select>

        {mvt.vers_type === 'ville' && (
          <Select label="Ville cible *" required value={mvt.vers_id}
            onChange={(e) => setMvt({ ...mvt, vers_id: e.target.value })}>
            <option value="">— Choisir ville —</option>
            {listeVilles.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
          </Select>
        )}

        {mvt.vers_type === 'equipe' && (
          <Select label="Équipe cible *" required value={mvt.vers_id}
            onChange={(e) => setMvt({ ...mvt, vers_id: e.target.value })}>
            <option value="">— Choisir équipe —</option>
            {listeEquipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nom}</option>)}
          </Select>
        )}

        <Champ label="Quantité *" type="number" min={1} required value={mvt.quantite}
          onChange={(e) => setMvt({ ...mvt, quantite: e.target.value })} />

        <div className="flex items-end">
          <Bouton type="submit" disabled={envoi}>Transférer</Bouton>
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
            { cle: 'proprietaire', label: 'Propriétaire', rendu: (s) => proprietaire(s, listeEquipes, listeVilles) },
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
