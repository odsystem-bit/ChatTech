// Petits composants partagés — style sobre, thème sombre.
import { useCallback, useEffect, useState } from 'react';

export function Champ({ label, ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-400">{label}</span>
      <input
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2
                   text-sm text-slate-100 outline-none focus:border-sky-500"
        {...props}
      />
    </label>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-400">{label}</span>
      <select
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2
                   text-sm text-slate-100 outline-none focus:border-sky-500"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Bouton({ variante = 'primaire', ...props }) {
  const styles = {
    primaire: 'bg-sky-600 text-white hover:bg-sky-500',
    danger: 'bg-red-600/80 text-white hover:bg-red-500',
    neutre: 'border border-slate-700 text-slate-300 hover:bg-slate-800',
  };
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles[variante]}`}
      {...props}
    />
  );
}

export function Tableau({ colonnes, lignes, vide = 'Aucune donnée.' }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/80 text-left text-slate-400">
            {colonnes.map((c) => (
              <th key={c.cle ?? c} className="px-4 py-3 font-medium">
                {c.label ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0 && (
            <tr>
              <td colSpan={colonnes.length} className="px-4 py-8 text-center text-slate-500">
                {vide}
              </td>
            </tr>
          )}
          {lignes.map((ligne, i) => (
            <tr key={ligne.id ?? i} className="border-b border-slate-800/60 last:border-0">
              {colonnes.map((c, j) => (
                <td key={j} className="px-4 py-3 text-slate-200">
                  {c.rendu ? c.rendu(ligne) : ligne[c.cle]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COULEURS = {
  en_cours: 'bg-amber-500/15 text-amber-400',
  termine: 'bg-emerald-500/15 text-emerald-400',
  actif: 'bg-emerald-500/15 text-emerald-400',
  suspendu: 'bg-red-500/15 text-red-400',
  resilie: 'bg-slate-500/15 text-slate-400',
};

export function Badge({ valeur }) {
  const style = COULEURS[valeur] ?? 'bg-slate-700/40 text-slate-300';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {valeur}
    </span>
  );
}

// Charge des données au montage + à chaque appel de `recharger`.
// Retourne {data, chargement, erreur, recharger}.
export function useCharge(requete, deps = []) {
  const [etat, setEtat] = useState({ data: null, chargement: true, erreur: null });

  const recharger = useCallback(() => {
    let actif = true;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    requete()
      .then((data) => actif && setEtat({ data, chargement: false, erreur: null }))
      .catch((erreur) => actif && setEtat({ data: null, chargement: false, erreur }));
    return () => { actif = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => recharger(), [recharger]);

  return { ...etat, recharger };
}
