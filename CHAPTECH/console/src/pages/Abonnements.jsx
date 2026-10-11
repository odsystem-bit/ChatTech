import { useState } from 'react';
import { api } from '../api.js';
import { Badge, Bouton, Champ, Select, Tableau, useCharge } from '../components/ui.jsx';

const ETATS = ['essai', 'actif', 'lecture_seule', 'suspendu'];

function LigneAbonnement({ ent, onMaj }) {
  const [form, setForm] = useState({
    etat_abonnement: ent.etat_abonnement,
    fin_abonnement: ent.fin_abonnement?.slice(0, 10) ?? '',
    limite_equipes: ent.limite_equipes,
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  async function enregistrer() {
    setErreur(null);
    setEnvoi(true);
    try {
      await api.put(`/abonnements/${ent.id}`, {
        etat_abonnement: form.etat_abonnement,
        fin_abonnement: form.fin_abonnement || null,
        limite_equipes: Number(form.limite_equipes),
      });
      onMaj();
    } catch (err) {
      setErreur(err.corps?.message ?? 'Échec de la mise à jour.');
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <tr className="border-b border-slate-800/60 last:border-0">
      <td className="px-4 py-3 text-slate-200">{ent.nom}</td>
      <td className="px-4 py-3">
        <select value={form.etat_abonnement}
          onChange={(e) => setForm({ ...form, etat_abonnement: e.target.value })}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm">
          {ETATS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td className="px-4 py-3">
        <input type="date" value={form.fin_abonnement}
          onChange={(e) => setForm({ ...form, fin_abonnement: e.target.value })}
          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm" />
      </td>
      <td className="px-4 py-3">
        <input type="number" min={1} value={form.limite_equipes}
          onChange={(e) => setForm({ ...form, limite_equipes: e.target.value })}
          className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm" />
      </td>
      <td className="px-4 py-3">
        <Badge valeur={ent.etat_abonnement} />
      </td>
      <td className="px-4 py-3">
        <Bouton onClick={enregistrer} disabled={envoi}>Enregistrer</Bouton>
        {erreur && <p className="mt-1 text-xs text-red-400">{erreur}</p>}
      </td>
    </tr>
  );
}

export default function Abonnements() {
  const abonnements = useCharge(() => api.get('/abonnements'));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Abonnements</h1>
      <p className="text-sm text-slate-400">
        « lecture_seule » et « suspendu » bloquent les écritures du tenant
        (middleware abonnement §13). Chaque bascule est journalisée.
      </p>

      {abonnements.chargement && <p className="text-slate-400">Chargement…</p>}
      {abonnements.data && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-left text-slate-400">
                <th className="px-4 py-3 font-medium">Entreprise</th>
                <th className="px-4 py-3 font-medium">État</th>
                <th className="px-4 py-3 font-medium">Fin d'abonnement</th>
                <th className="px-4 py-3 font-medium">Max équipes</th>
                <th className="px-4 py-3 font-medium">État actuel</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {(abonnements.data ?? []).map((ent) => (
                <LigneAbonnement key={ent.id} ent={ent} onMaj={abonnements.recharger} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
