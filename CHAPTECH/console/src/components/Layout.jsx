import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

// Nav filtrée par rôle : admin/gestionnaire → exploitation tenant ;
// super_admin → console plateforme. Le backend re-vérifie (403) —
// ce filtre n'est que cosmétique.
const NAV = [
  { vers: '/dossiers', label: 'Dossiers du jour', roles: ['admin', 'coordonnateur'] },
  { vers: '/dispatching', label: 'Dispatching', roles: ['admin', 'superviseur'] },
  { vers: '/interventions', label: 'Interventions', roles: ['admin', 'gestionnaire', 'conformite', 'coordonnateur', 'superviseur'] },
  { vers: '/conformite', label: 'Conformité', roles: ['admin', 'conformite'] },
  { vers: '/epi', label: 'EPI du jour', roles: ['admin', 'conformite'] },
  { vers: '/stock', label: 'Stock', roles: ['admin', 'gestionnaire'] },
  { vers: '/articles', label: 'Articles', roles: ['admin', 'gestionnaire'] },
  { vers: '/villes', label: 'Villes', roles: ['admin'] },
  { vers: '/equipes', label: 'Équipes', roles: ['admin'] },
  { vers: '/comptes', label: 'Comptes', roles: ['admin'] },
  { vers: '/entreprises', label: 'Entreprises', roles: ['super_admin'] },
  { vers: '/abonnements', label: 'Abonnements', roles: ['super_admin'] },
];

export default function Layout() {
  const { compte, logout } = useAuth();
  const navigate = useNavigate();
  const liens = NAV.filter((l) => l.roles.includes(compte.role));

  async function seDeconnecter() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-56 flex-col border-r border-slate-800 bg-slate-900/60">
        <div className="border-b border-slate-800 px-4 py-4">
          <p className="font-semibold">CHAPTECH</p>
          <p className="mt-1 text-xs text-slate-400">{compte.nom} · {compte.role}</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {liens.map((l) => (
            <NavLink key={l.vers} to={l.vers}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-sky-600/20 text-sky-300'
                    : 'text-slate-300 hover:bg-slate-800'
                }`
              }>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={seDeconnecter}
          className="m-3 rounded-lg border border-slate-700 py-2 text-sm
                     text-slate-300 hover:bg-slate-800">
          Déconnexion
        </button>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
