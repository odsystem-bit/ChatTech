import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Bouton, Select, Tableau, useCharge } from '../components/ui.jsx';

export default function Dispatching() {
  const { compte } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [villeId, setVilleId] = useState(compte.ville_id ? String(compte.ville_id) : '');
  const [onglet, setOnglet] = useState('jour'); // 'jour' | 'anterieurs'

  const villes = useCharge(() => api.get('/villes'));
  const dispatch = useCharge(
    () => api.get(`/dispatching?date=${date}${villeId ? `&ville_id=${villeId}` : ''}`),
    [date, villeId]
  );

  const [selectionEquipe, setSelectionEquipe] = useState({});
  const [reassignEquipe, setReassignEquipe] = useState({});
  const [motifNonTraite, setMotifNonTraite] = useState({});
  const [modalNonTraite, setModalNonTraite] = useState(null);
  const [actionEnCours, setActionEnCours] = useState(false);

  const data = dispatch.data;
  const aDispatcher = data?.a_dispatcher ?? [];
  const dispatches = data?.dispatches ?? [];
  const equipes = data?.equipes ?? [];
  const anterieurs = data?.anterieurs_non_termines ?? [];
  const totaux = data?.totaux ?? { a_dispatcher: 0, dispatches: 0, anterieurs: 0 };

  async function assigner(dossierId) {
    const eqId = selectionEquipe[dossierId];
    if (!eqId) {
      alert('Veuillez sélectionner une équipe pour ce dossier.');
      return;
    }
    setActionEnCours(true);
    try {
      await api.post(`/dispatching/${dossierId}/assigner`, {
        equipe_id: Number(eqId),
      });
      dispatch.recharger();
    } catch (err) {
      alert(err.corps?.error ?? 'Erreur lors du dispatching.');
    } finally {
      setActionEnCours(false);
    }
  }

  async function reassigner(dossierId, reprogrammerAujourdhui = false) {
    const eqId = reassignEquipe[dossierId];
    if (!eqId) {
      alert('Veuillez sélectionner la nouvelle équipe.');
      return;
    }
    setActionEnCours(true);
    try {
      await api.post(`/dispatching/${dossierId}/reassigner`, {
        equipe_id: Number(eqId),
        reprogrammer_aujourdhui: reprogrammerAujourdhui,
      });
      dispatch.recharger();
    } catch (err) {
      alert(err.corps?.error ?? 'Erreur lors de la réattribution.');
    } finally {
      setActionEnCours(false);
    }
  }

  async function soumettreNonTraite(e) {
    e.preventDefault();
    if (!modalNonTraite) return;
    const motif = motifNonTraite[modalNonTraite.id];
    if (!motif || !motif.trim()) {
      alert('Le motif de non-traitement est obligatoire.');
      return;
    }
    setActionEnCours(true);
    try {
      await api.post(`/dispatching/${modalNonTraite.id}/declarer-non-traite`, {
        motif: motif.trim(),
      });
      setModalNonTraite(null);
      dispatch.recharger();
    } catch (err) {
      alert(err.corps?.error ?? 'Erreur.');
    } finally {
      setActionEnCours(false);
    }
  }

  const listeVilles = villes.data ?? [];

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dispatching des dossiers</h1>
          <p className="text-xs text-slate-400">
            Affectation des interventions aux équipes terrain en temps réel (§6 bis)
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
                onChange={(e) => setVilleId(e.target.value)}
                className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100"
              >
                <option value="">Toutes les villes</option>
                {listeVilles.map((v) => (
                  <option key={v.id} value={v.id}>{v.nom}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {/* Charges des équipes disponibles */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Équipes disponibles & Charge du jour ({date})
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {equipes.length === 0 && (
            <p className="col-span-full text-xs text-slate-500 italic">
              Aucune équipe active trouvée pour cette sélection.
            </p>
          )}
          {equipes.map((eq) => {
            const charge = eq.charge_jour ?? 0;
            const badgeColor =
              charge === 0
                ? 'text-emerald-400 border-emerald-900/50 bg-emerald-950/20'
                : charge <= 3
                ? 'text-sky-400 border-sky-900/50 bg-sky-950/20'
                : 'text-amber-400 border-amber-900/50 bg-amber-950/20';

            return (
              <div
                key={eq.id}
                className={`rounded-xl border p-3 flex flex-col justify-between ${badgeColor}`}
              >
                <div>
                  <p className="font-semibold text-sm text-slate-100 truncate">{eq.nom}</p>
                  <p className="text-xs text-slate-400 truncate">
                    Chef : {eq.chef?.nom ?? 'Non assigné'}
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-slate-800/80 pt-2">
                  <span className="text-xs">Dossiers :</span>
                  <span className="font-bold text-sm">{charge}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Onglets Jour vs Antérieurs */}
      <div className="flex border-b border-slate-800 space-x-4">
        <button
          onClick={() => setOnglet('jour')}
          className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
            onglet === 'jour'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Dossiers du jour ({totaux.a_dispatcher} à dispatcher / {totaux.dispatches} attribués)
        </button>

        <button
          onClick={() => setOnglet('anterieurs')}
          className={`pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            onglet === 'anterieurs'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Reliquats antérieurs non clôturés
          {totaux.anterieurs > 0 && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
              {totaux.anterieurs}
            </span>
          )}
        </button>
      </div>

      {dispatch.chargement && <p className="text-slate-400">Chargement…</p>}

      {onglet === 'jour' && data && (
        <div className="space-y-6">
          {/* 1. Dossiers en attente de dispatching */}
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-amber-400 flex items-center gap-2">
              <span>⏳ Dossiers en attente de dispatching ({aDispatcher.length})</span>
            </h3>

            <Tableau
              lignes={aDispatcher}
              vide="Aucun dossier en attente d'affectation pour cette journée."
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
                { cle: 'notes', label: 'Notes', rendu: (d) => (
                  <span className="text-xs italic text-slate-400">{d.notes || '—'}</span>
                )},
                { cle: 'action', label: 'Affecter à une équipe', rendu: (d) => (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectionEquipe[d.id] ?? ''}
                      onChange={(e) => setSelectionEquipe({ ...selectionEquipe, [d.id]: e.target.value })}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                    >
                      <option value="">— Choisir l'équipe —</option>
                      {equipes.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.nom} ({eq.charge_jour} dossiers)
                        </option>
                      ))}
                    </select>
                    <Bouton
                      variante="primaire"
                      disabled={actionEnCours || !selectionEquipe[d.id]}
                      onClick={() => assigner(d.id)}
                    >
                      Dispatcher
                    </Bouton>
                  </div>
                )},
              ]}
            />
          </div>

          {/* 2. Dossiers déjà dispatchés */}
          <div className="space-y-3 pt-4 border-t border-slate-800/80">
            <h3 className="text-base font-semibold text-slate-300">
              Dossiers déjà dispatchés ({dispatches.length})
            </h3>

            <Tableau
              lignes={dispatches}
              vide="Aucun dossier encore dispatché aujourd'hui."
              colonnes={[
                { cle: 'client_nom', label: 'Client', rendu: (d) => (
                  <div>
                    <p className="font-medium text-slate-100">{d.client_nom}</p>
                    <p className="text-xs text-slate-400">{d.client_tel || d.mobile || '—'}</p>
                  </div>
                )},
                { cle: 'equipe', label: 'Équipe attribuée', rendu: (d) => (
                  <div>
                    <span className="font-semibold text-sky-400">{d.equipe?.nom ?? '—'}</span>
                    <p className="text-xs text-slate-400">Chef : {d.chef_nom ?? '—'}</p>
                  </div>
                )},
                { cle: 'statut_distribution', label: 'Statut', rendu: (d) => (
                  <div>
                    <Badge valeur={d.statut_distribution} />
                    {d.motif_non_traite && (
                      <p className="text-xs text-rose-400 mt-1 max-w-xs truncate" title={d.motif_non_traite}>
                        Motif : {d.motif_non_traite}
                      </p>
                    )}
                  </div>
                )},
                { cle: 'adresse', label: 'Adresse', rendu: (d) => (
                  <span className="text-xs text-slate-300">{d.adresse || '—'}</span>
                )},
                { cle: 'actions', label: 'Gestion', rendu: (d) => (
                  <div className="flex items-center gap-2">
                    <select
                      value={reassignEquipe[d.id] ?? ''}
                      onChange={(e) => setReassignEquipe({ ...reassignEquipe, [d.id]: e.target.value })}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                    >
                      <option value="">Changer équipe…</option>
                      {equipes.filter((eq) => eq.id !== d.equipe_id).map((eq) => (
                        <option key={eq.id} value={eq.id}>{eq.nom}</option>
                      ))}
                    </select>
                    {reassignEquipe[d.id] && (
                      <Bouton
                        variante="neutre"
                        disabled={actionEnCours}
                        onClick={() => reassigner(d.id, false)}
                      >
                        Changer
                      </Bouton>
                    )}
                    {d.statut_distribution !== 'non_traite' && d.statut_distribution !== 'termine' && (
                      <button
                        onClick={() => setModalNonTraite(d)}
                        className="text-xs text-rose-400 hover:text-rose-300 underline ml-2"
                      >
                        Déclarer non traité
                      </button>
                    )}
                  </div>
                )},
              ]}
            />
          </div>
        </div>
      )}

      {/* Onglet Antérieurs non terminés */}
      {onglet === 'anterieurs' && data && (
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-900/30 bg-amber-950/15 p-3 text-xs text-amber-300">
            ℹ️ Ces dossiers proviennent de journées passées et n'ont pas été clôturés (non traités ou en cours).
            Vous pouvez les reprogrammer pour la journée d'aujourd'hui ({today}) en un clic en sélectionnant l'équipe d'affectation.
          </div>

          <Tableau
            lignes={anterieurs}
            vide="Aucun reliquat antérieur en souffrance. Tout est à jour !"
            colonnes={[
              { cle: 'date_dossier', label: 'Date initiale', rendu: (d) => (
                <span className="font-mono text-xs text-amber-400">{d.date_dossier}</span>
              )},
              { cle: 'client_nom', label: 'Client', rendu: (d) => (
                <div>
                  <p className="font-medium text-slate-100">{d.client_nom}</p>
                  <p className="text-xs text-slate-400">{d.client_tel || d.mobile || '—'}</p>
                </div>
              )},
              { cle: 'ville', label: 'Ville', rendu: (d) => d.ville?.nom ?? '—' },
              { cle: 'equipe_precedente', label: 'Dernière équipe', rendu: (d) => (
                <span className="text-xs text-slate-400">{d.equipe?.nom ?? 'Non assignée'}</span>
              )},
              { cle: 'statut_distribution', label: 'Statut', rendu: (d) => (
                <div>
                  <Badge valeur={d.statut_distribution} />
                  {d.motif_non_traite && (
                    <p className="text-xs text-rose-400 mt-1 max-w-xs">{d.motif_non_traite}</p>
                  )}
                </div>
              )},
              { cle: 'action', label: 'Réattribuer pour aujourd’hui', rendu: (d) => (
                <div className="flex items-center gap-2">
                  <select
                    value={reassignEquipe[d.id] ?? ''}
                    onChange={(e) => setReassignEquipe({ ...reassignEquipe, [d.id]: e.target.value })}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                  >
                    <option value="">— Choisir équipe —</option>
                    {equipes.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.nom} ({eq.charge_jour} dossiers aujourd'hui)
                      </option>
                    ))}
                  </select>
                  <Bouton
                    variante="primaire"
                    disabled={actionEnCours || !reassignEquipe[d.id]}
                    onClick={() => reassigner(d.id, true)}
                  >
                    Reprogrammer
                  </Bouton>
                </div>
              )},
            ]}
          />
        </div>
      )}

      {/* Modal Déclarer Non Traité */}
      {modalNonTraite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            onSubmit={soumettreNonTraite}
            className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4"
          >
            <h3 className="text-lg font-semibold text-rose-400">
              Déclarer le dossier comme Non Traité
            </h3>
            <p className="text-xs text-slate-400">
              Client : <span className="text-slate-200 font-medium">{modalNonTraite.client_nom}</span>
              <br />
              Ce dossier ne décrémentera aucun stock de matériel et sera conservé dans l'historique pour réaffectation.
            </p>

            <label className="block">
              <span className="text-xs text-slate-400">Motif du non traitement * :</span>
              <textarea
                required
                rows={3}
                placeholder="ex: Client injoignable, client absent, refus d'installation..."
                value={motifNonTraite[modalNonTraite.id] ?? ''}
                onChange={(e) => setMotifNonTraite({ ...motifNonTraite, [modalNonTraite.id]: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-100 outline-none focus:border-rose-500"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Bouton
                type="button"
                variante="neutre"
                onClick={() => setModalNonTraite(null)}
              >
                Annuler
              </Bouton>
              <Bouton
                type="submit"
                variante="danger"
                disabled={actionEnCours}
              >
                Confirmer Non Traité
              </Bouton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
