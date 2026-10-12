import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Bouton, Select, Tableau, useCharge } from '../components/ui.jsx';

const LIBELLES = {
  non_requis: ['EPI non exigé', 'bg-slate-700/40 text-slate-300'],
  photo_manquante: ['Photo manquante', 'bg-red-500/15 text-red-400'],
  en_attente: ['En attente de décision', 'bg-amber-500/15 text-amber-400'],
  auto: ['Débloquée (30 min écoulées)', 'bg-sky-500/15 text-sky-300'],
  valide: ['Validée', 'bg-emerald-500/15 text-emerald-400'],
  rejete: ['Rejetée', 'bg-red-500/15 text-red-400'],
  hors_horaires: ['Hors horaires (6h–23h)', 'bg-slate-500/15 text-slate-400'],
};

function Etat({ statut }) {
  const [texte, style] = LIBELLES[statut.raison] ?? [statut.raison, 'bg-slate-700/40 text-slate-300'];
  return (
    <div>
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>{texte}</span>
      {statut.epi?.motif && <p className="mt-1 text-xs text-red-300">Motif : {statut.epi.motif}</p>}
    </div>
  );
}

function Delegation({ ligne, onFait, onErreur }) {
  const [technicien, setTechnicien] = useState('');

  async function deleguer() {
    try {
      await api.post('/epi/delegations', { equipe_id: ligne.equipe_id, compte_id: Number(technicien) });
      setTechnicien('');
      onFait();
    } catch (e) {
      onErreur(e.corps?.error ?? e.corps?.message ?? 'Délégation refusée.');
    }
  }

  return (
    <div className="space-y-1">
      {ligne.delegations.map((d) => (
        <p key={d.id} className="text-xs text-slate-300">Envoi autorisé : {d.nom}</p>
      ))}
      {ligne.techniciens.length > 0 && (
        <div className="flex items-center gap-2">
          <Select label="" value={technicien} onChange={(e) => setTechnicien(e.target.value)}>
            <option value="">Autoriser un technicien…</option>
            {ligne.techniciens.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
          </Select>
          <Bouton variante="neutre" disabled={!technicien} onClick={deleguer}>OK</Bouton>
        </div>
      )}
    </div>
  );
}

export default function Epi() {
  const jour = useCharge(() => api.get('/epi/jour'));
  const [erreur, setErreur] = useState(null);

  // Rafraîchissement automatique : la conformité voit arriver les photos.
  useEffect(() => {
    const t = setInterval(() => jour.recharger(), 60000);
    return () => clearInterval(t);
  }, [jour.recharger]);

  async function decider(ligne, decision) {
    let motif;
    if (decision === 'rejete') {
      motif = window.prompt('Motif du rejet (obligatoire) :');
      if (!motif?.trim()) return;
    }
    setErreur(null);
    try {
      await api.post(`/epi/${ligne.statut.epi.id}/decision`, { decision, motif });
      jour.recharger();
    } catch (e) {
      setErreur(e.corps?.message ?? 'Décision refusée.');
    }
  }

  const donnees = jour.data;
  const asignaler = donnees?.equipes.filter((e) => e.a_signaler) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Photos EPI du jour</h1>
      {donnees && !donnees.epi_obligatoire && (
        <p className="text-sm text-amber-400">
          L'EPI n'est pas exigé pour cette entreprise : les équipes ne sont pas bloquées.
        </p>
      )}

      {asignaler.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <p className="font-medium text-red-300">
            {asignaler.length} équipe{asignaler.length > 1 ? 's' : ''} sans photo EPI après 8h30
          </p>
          <p className="mt-1 text-sm text-red-200">
            {asignaler.map((e) => e.equipe).join(', ')} — autorisez un technicien à envoyer la photo.
          </p>
        </div>
      )}

      {erreur && <p className="text-sm text-red-400">{erreur}</p>}
      {jour.erreur && <p className="text-sm text-red-400">{jour.erreur.message}</p>}
      {jour.chargement && !donnees && <p className="text-slate-400">Chargement…</p>}

      {donnees && (
        <Tableau
          lignes={donnees.equipes}
          vide="Aucune équipe."
          colonnes={[
            { cle: 'equipe', label: 'Équipe' },
            { cle: 'etat', label: 'État', rendu: (l) => <Etat statut={l.statut} /> },
            {
              cle: 'photo', label: 'Photo',
              rendu: (l) => (l.statut.epi ? (
                <Bouton variante="neutre"
                  onClick={() => api.ouvrir(`/epi/${l.statut.epi.id}/photo`).catch(() => setErreur('Photo introuvable.'))}>
                  Voir
                </Bouton>
              ) : '—'),
            },
            {
              cle: 'decision', label: 'Décision',
              rendu: (l) => (l.statut.epi ? (
                <div className="flex gap-2">
                  <Bouton disabled={l.statut.epi.statut === 'valide'} onClick={() => decider(l, 'valide')}>Valider</Bouton>
                  <Bouton variante="danger" disabled={l.statut.epi.statut === 'rejete'} onClick={() => decider(l, 'rejete')}>
                    Rejeter
                  </Bouton>
                </div>
              ) : '—'),
            },
            {
              cle: 'delegation', label: 'Envoi par un technicien',
              rendu: (l) => <Delegation ligne={l} onFait={jour.recharger} onErreur={setErreur} />,
            },
          ]}
        />
      )}
    </div>
  );
}
