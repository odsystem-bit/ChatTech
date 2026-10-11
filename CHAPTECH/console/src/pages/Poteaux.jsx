import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Bouton, Champ, Select, Tableau, useCharge } from '../components/ui.jsx';

function Carte({ label, valeur }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{valeur}</p>
    </div>
  );
}

export default function Poteaux() {
  const { compte } = useAuth();
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [equipe, setEquipe] = useState('');
  const [erreurExport, setErreurExport] = useState(null);
  const [export_, setExport] = useState(false);

  const chef = compte.role === 'chef';

  const periode = new URLSearchParams();
  if (debut) periode.set('debut', debut);
  if (fin) periode.set('fin', fin);

  const poteaux = useCharge(
    () => api.get(`/poteaux?${periode}`),
    [debut, fin],
  );

  const lignes = poteaux.data?.lignes ?? [];

  // Le responsable poteaux ne peut pas lister les équipes (route admin) :
  // on les déduit des fiches reçues.
  const equipes = useMemo(() => {
    const vues = new Map();
    lignes.forEach((l) => l.equipe_id && vues.set(l.equipe_id, l.equipe ?? `Équipe ${l.equipe_id}`));
    return [...vues].sort((a, b) => a[1].localeCompare(b[1]));
  }, [lignes]);

  const visibles = equipe ? lignes.filter((l) => String(l.equipe_id) === equipe) : lignes;
  const total = (cle) => visibles.reduce((somme, l) => somme + l[cle], 0);

  const dateInvalide = debut && fin && fin < debut;

  async function exporter() {
    setErreurExport(null);
    setExport(true);
    try {
      const params = new URLSearchParams(periode);
      if (equipe) params.set('equipe', equipe);
      await api.telecharger(`/poteaux/export?${params}`, 'poteaux.csv');
    } catch (e) {
      setErreurExport(e.message);
    }
    setExport(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Suivi des poteaux</h1>
      {chef && <p className="text-sm text-slate-400">Vous voyez uniquement votre équipe.</p>}

      <div className="flex flex-wrap items-end gap-4">
        <Champ label="Du" type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
        <Champ label="Au" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
        {!chef && (
          <Select label="Équipe" value={equipe} onChange={(e) => setEquipe(e.target.value)}>
            <option value="">Toutes</option>
            {equipes.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
          </Select>
        )}
        <Bouton onClick={exporter} disabled={export_ || dateInvalide}>
          {export_ ? 'Export…' : 'Télécharger (Excel)'}
        </Bouton>
      </div>

      {dateInvalide && <p className="text-sm text-red-400">La date de fin précède la date de début.</p>}
      {erreurExport && <p className="text-sm text-red-400">{erreurExport}</p>}
      {poteaux.erreur && <p className="text-sm text-red-400">{poteaux.erreur.message}</p>}
      {poteaux.chargement && <p className="text-slate-400">Chargement…</p>}

      {poteaux.data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Carte label="Implantés" valeur={total('implantes')} />
            <Carte label="Armés" valeur={total('armes')} />
            <Carte label="Traversés" valeur={total('traverses')} />
          </div>

          <Tableau
            lignes={visibles}
            vide="Aucun poteau sur cette période."
            colonnes={[
              { cle: 'date', label: 'Date', rendu: (l) => l.date ?? '—' },
              { cle: 'client_nom', label: 'Client', rendu: (l) => l.client_nom || '—' },
              { cle: 'adresse', label: 'Adresse', rendu: (l) => l.adresse || '—' },
              { cle: 'equipe', label: 'Équipe', rendu: (l) => l.equipe ?? '—' },
              { cle: 'implantes', label: 'Implantés' },
              { cle: 'armes', label: 'Armés' },
              { cle: 'traverses', label: 'Traversés' },
            ]}
          />
        </>
      )}
    </div>
  );
}
