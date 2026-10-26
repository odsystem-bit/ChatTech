import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Bouton, Champ, Select, Tableau, useCharge } from '../components/ui.jsx';

export default function Dossiers() {
  const { compte } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [villeId, setVilleId] = useState(compte.ville_id ? String(compte.ville_id) : '');

  const villes = useCharge(() => api.get('/villes'));
  const dossiers = useCharge(
    () => api.get(`/dossiers/du-jour?date=${date}${villeId ? `&ville_id=${villeId}` : ''}`),
    [date, villeId]
  );

  const [form, setForm] = useState({
    client_nom: '',
    client_tel: '',
    mobile: '',
    adresse: '',
    ville_id: compte.ville_id ? String(compte.ville_id) : '',
    notes: '',
  });

  const [modeBatch, setModeBatch] = useState(false);
  const [batchForms, setBatchForms] = useState([
    { client_nom: '', client_tel: '', mobile: '', adresse: '', notes: '' },
    { client_nom: '', client_tel: '', mobile: '', adresse: '', notes: '' },
    { client_nom: '', client_tel: '', mobile: '', adresse: '', notes: '' },
    { client_nom: '', client_tel: '', mobile: '', adresse: '', notes: '' },
  ]);

  const [erreur, setErreur] = useState(null);
  const [succes, setSucces] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const stats = dossiers.data?.stats ?? {
    total: 0, a_dispatcher: 0, dispatche: 0, en_cours: 0, termine: 0, non_traite: 0,
  };

  async function creerUnitaire(e) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    setEnvoi(true);

    const vId = compte.ville_id || Number(form.ville_id);
    if (!vId) {
      setErreur('Veuillez sélectionner une ville pour ce dossier.');
      setEnvoi(false);
      return;
    }

    try {
      await api.post('/dossiers', {
        ...form,
        ville_id: vId,
        date_dossier: date,
      });
      setForm({
        client_nom: '', client_tel: '', mobile: '', adresse: '',
        ville_id: compte.ville_id ? String(compte.ville_id) : form.ville_id,
        notes: '',
      });
      setSucces('Dossier injecté avec succès ! Prêt pour le dispatching.');
      dossiers.recharger();
    } catch (err) {
      setErreur(err.corps?.error ?? err.corps?.message ?? 'Échec de création du dossier.');
    } finally {
      setEnvoi(false);
    }
  }

  async function creerBatch(e) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    setEnvoi(true);

    const vId = compte.ville_id || Number(form.ville_id);
    if (!vId) {
      setErreur('Veuillez sélectionner une ville pour ce lot de dossiers.');
      setEnvoi(false);
      return;
    }

    const valides = batchForms.filter((f) => f.client_nom.trim() !== '');
    if (valides.length === 0) {
      setErreur('Remplissez au moins le nom d’un client dans le lot.');
      setEnvoi(false);
      return;
    }

    try {
      await api.post('/dossiers', {
        dossiers: valides.map((f) => ({
          ...f,
          ville_id: vId,
          date_dossier: date,
        })),
      });
      setBatchForms([
        { client_nom: '', client_tel: '', mobile: '', adresse: '', notes: '' },
        { client_nom: '', client_tel: '', mobile: '', adresse: '', notes: '' },
        { client_nom: '', client_tel: '', mobile: '', adresse: '', notes: '' },
        { client_nom: '', client_tel: '', mobile: '', adresse: '', notes: '' },
      ]);
      setSucces(`${valides.length} dossiers injectés avec succès !`);
      dossiers.recharger();
    } catch (err) {
      setErreur(err.corps?.error ?? err.corps?.message ?? 'Échec de l’injection du lot.');
    } finally {
      setEnvoi(false);
    }
  }

  async function supprimerDossier(d) {
    if (!confirm(`Supprimer le dossier de ${d.client_nom} ?`)) return;
    try {
      await api.delete(`/dossiers/${d.id}`);
      dossiers.recharger();
    } catch (err) {
      alert(err.corps?.error ?? 'Impossible de supprimer.');
    }
  }

  const listeVilles = villes.data ?? [];
  const listeDossiers = dossiers.data?.dossiers ?? [];

  return (
    <div className="space-y-6">
      {/* En-tête avec filtres */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dossiers du jour</h1>
          <p className="text-xs text-slate-400">
            Saisie et injection des dossiers par le Coordonnateur ({compte.isDeVille ? 'Ville restreinte' : 'De base'})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-slate-400">
            Date :
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100"
            />
          </label>

          {!compte.ville_id && (
            <label className="text-xs text-slate-400">
              Ville :
              <select
                value={villeId}
                onChange={(e) => {
                  setVilleId(e.target.value);
                  setForm((f) => ({ ...f, ville_id: e.target.value }));
                }}
                className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100"
              >
                <option value="">Toutes les villes</option>
                {listeVilles.map((v) => (
                  <option key={v.id} value={v.id}>{v.nom}</option>
                ))}
              </select>
            </label>
          )}

          <Bouton
            variante={modeBatch ? 'primaire' : 'neutre'}
            onClick={() => setModeBatch(!modeBatch)}
          >
            {modeBatch ? 'Mode Unitaire' : '⚡ Saisie en lot (4 clients)'}
          </Bouton>
        </div>
      </div>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <p className="text-xs text-slate-400">Total dossiers</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-3">
          <p className="text-xs text-amber-400">À dispatcher</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">{stats.a_dispatcher}</p>
        </div>
        <div className="rounded-xl border border-sky-900/40 bg-sky-950/20 p-3">
          <p className="text-xs text-sky-400">Dispatchés</p>
          <p className="mt-1 text-2xl font-bold text-sky-400">{stats.dispatche}</p>
        </div>
        <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-3">
          <p className="text-xs text-blue-400">En cours</p>
          <p className="mt-1 text-2xl font-bold text-blue-400">{stats.en_cours}</p>
        </div>
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-3">
          <p className="text-xs text-emerald-400">Terminés</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{stats.termine}</p>
        </div>
        <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-3">
          <p className="text-xs text-rose-400">Non traités</p>
          <p className="mt-1 text-2xl font-bold text-rose-400">{stats.non_traite}</p>
        </div>
      </div>

      {/* Formulaire de saisie unitaire */}
      {!modeBatch ? (
        <form onSubmit={creerUnitaire} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">Ajouter un dossier</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Champ
              label="Nom du Client *"
              required
              placeholder="ex: KOUASSI Jean"
              value={form.client_nom}
              onChange={(e) => setForm({ ...form, client_nom: e.target.value })}
            />
            <Champ
              label="Téléphone Ligne"
              placeholder="ex: 21 30 00 00"
              value={form.client_tel}
              onChange={(e) => setForm({ ...form, client_tel: e.target.value })}
            />
            <Champ
              label="Mobile / WhatsApp"
              placeholder="ex: 97 00 00 00"
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            />
            <Champ
              label="Adresse / Repère"
              placeholder="ex: Rue 142, Haie Vive, face pharmacie"
              value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value })}
            />
            {!compte.ville_id && (
              <Select
                label="Ville du dossier *"
                required
                value={form.ville_id}
                onChange={(e) => setForm({ ...form, ville_id: e.target.value })}
              >
                <option value="">— Choisir la ville —</option>
                {listeVilles.map((v) => (
                  <option key={v.id} value={v.id}>{v.nom}</option>
                ))}
              </Select>
            )}
            <Champ
              label="Remarque / Réf ligne"
              placeholder="ex: FAT 14 port 3 disponible"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <Bouton type="submit" disabled={envoi}>
              {envoi ? 'Injection en cours…' : '+ Injecter le dossier'}
            </Bouton>
            {erreur && <p className="text-sm text-rose-400">{erreur}</p>}
            {succes && <p className="text-sm text-emerald-400">{succes}</p>}
          </div>
        </form>
      ) : (
        /* Formulaire de saisie en lot */
        <form onSubmit={creerBatch} className="rounded-xl border border-sky-800/40 bg-slate-900/60 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-sky-300">⚡ Saisie groupée (Lot quotidien)</h2>
            {!compte.ville_id && (
              <div className="w-64">
                <Select
                  label="Ville pour ce lot *"
                  required
                  value={form.ville_id}
                  onChange={(e) => setForm({ ...form, ville_id: e.target.value })}
                >
                  <option value="">— Choisir la ville —</option>
                  {listeVilles.map((v) => (
                    <option key={v.id} value={v.id}>{v.nom}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {batchForms.map((b, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 sm:grid-cols-5">
                <Champ
                  label={`Client ${idx + 1}`}
                  placeholder="Nom client"
                  value={b.client_nom}
                  onChange={(e) => {
                    const next = [...batchForms];
                    next[idx].client_nom = e.target.value;
                    setBatchForms(next);
                  }}
                />
                <Champ
                  label="Tél Ligne"
                  placeholder="Téléphone"
                  value={b.client_tel}
                  onChange={(e) => {
                    const next = [...batchForms];
                    next[idx].client_tel = e.target.value;
                    setBatchForms(next);
                  }}
                />
                <Champ
                  label="Mobile"
                  placeholder="Mobile"
                  value={b.mobile}
                  onChange={(e) => {
                    const next = [...batchForms];
                    next[idx].mobile = e.target.value;
                    setBatchForms(next);
                  }}
                />
                <Champ
                  label="Adresse / Zone"
                  placeholder="Quartier / Rue"
                  value={b.adresse}
                  onChange={(e) => {
                    const next = [...batchForms];
                    next[idx].adresse = e.target.value;
                    setBatchForms(next);
                  }}
                />
                <Champ
                  label="Notes"
                  placeholder="Réf / FAT"
                  value={b.notes}
                  onChange={(e) => {
                    const next = [...batchForms];
                    next[idx].notes = e.target.value;
                    setBatchForms(next);
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Bouton type="submit" disabled={envoi}>
              {envoi ? 'Injection en cours…' : 'Injecter tous les dossiers du lot'}
            </Bouton>
            {erreur && <p className="text-sm text-rose-400">{erreur}</p>}
            {succes && <p className="text-sm text-emerald-400">{succes}</p>}
          </div>
        </form>
      )}

      {/* Tableau des dossiers du jour */}
      {dossiers.chargement && <p className="text-slate-400">Chargement des dossiers…</p>}
      {dossiers.data && (
        <Tableau
          lignes={listeDossiers}
          vide={`Aucun dossier enregistré pour le ${date}.`}
          colonnes={[
            { cle: 'client_nom', label: 'Client', rendu: (d) => (
              <div>
                <p className="font-medium text-slate-100">{d.client_nom}</p>
                <p className="text-xs text-slate-400">{d.client_tel || d.mobile || '—'}</p>
              </div>
            )},
            { cle: 'ville', label: 'Ville', rendu: (d) => d.ville?.nom ?? '—' },
            { cle: 'adresse', label: 'Adresse / Zone', rendu: (d) => (
              <span className="text-xs text-slate-300">{d.adresse || '—'}</span>
            )},
            { cle: 'statut_distribution', label: 'Statut Dispatch', rendu: (d) => (
              <Badge valeur={d.statut_distribution} />
            )},
            { cle: 'equipe', label: 'Équipe assignée', rendu: (d) => (
              d.equipe ? (
                <span className="font-medium text-sky-400">{d.equipe.nom}</span>
              ) : (
                <span className="text-xs italic text-amber-500">Non assignée</span>
              )
            )},
            { cle: 'actions', label: '', rendu: (d) => (
              d.statut_distribution === 'a_dispatcher' && (
                <Bouton variante="danger" onClick={() => supprimerDossier(d)}>
                  Supprimer
                </Bouton>
              )
            )},
          ]}
        />
      )}
    </div>
  );
}
