import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ApiErreur } from '../api.js';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifiant: '', password: '' });
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(false);

  async function soumettre(e) {
    e.preventDefault();
    setErreur(null);
    setChargement(true);
    try {
      const compte = await login(form.identifiant, form.password);
      const cible = location.state?.depuis
        ?? (compte.role === 'super_admin' ? '/entreprises' : '/interventions');
      navigate(cible, { replace: true });
    } catch (err) {
      setErreur(err instanceof ApiErreur && err.statut === 401
        ? 'Identifiants incorrects ou compte suspendu.'
        : 'Erreur de connexion au serveur.');
    } finally {
      setChargement(false);
    }
  }

  const champ = (cle, label, type = 'text') => (
    <label className="block" key={cle}>
      <span className="mb-1 block text-sm text-slate-400">{label}</span>
      <input
        type={type}
        required
        value={form[cle]}
        onChange={(e) => setForm({ ...form, [cle]: e.target.value })}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2
                   text-slate-100 outline-none focus:border-sky-500"
      />
    </label>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <form onSubmit={soumettre}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
        <h1 className="text-xl font-semibold text-slate-100">CHAPTECH — Console</h1>
        {champ('identifiant', 'Identifiant')}
        {champ('password', 'Mot de passe', 'password')}
        {erreur && <p className="text-sm text-red-400">{erreur}</p>}
        <button type="submit" disabled={chargement}
          className="w-full rounded-lg bg-sky-600 py-2 font-medium text-white
                     hover:bg-sky-500 disabled:opacity-50">
          {chargement ? 'Connexion…' : 'Se connecter'}
        </button>
        <p className="pt-2 text-center">
          <Link to="/plateforme" className="text-xs text-slate-500 hover:text-slate-300">
            Accès plateforme →
          </Link>
        </p>
      </form>
    </div>
  );
}
