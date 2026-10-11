// Client API CHAPTECH — Bearer token stocké en localStorage.
// Le proxy Vite renvoie /api → backend Laravel en dev.

const BASE = '/api/v1';
const CLE_TOKEN = 'chaptech.token';
const CLE_COMPTE = 'chaptech.compte';

export const authStore = {
  get token() { return localStorage.getItem(CLE_TOKEN); },
  get compte() {
    const raw = localStorage.getItem(CLE_COMPTE);
    return raw ? JSON.parse(raw) : null;
  },
  save(token, compte) {
    localStorage.setItem(CLE_TOKEN, token);
    localStorage.setItem(CLE_COMPTE, JSON.stringify(compte));
  },
  clear() {
    localStorage.removeItem(CLE_TOKEN);
    localStorage.removeItem(CLE_COMPTE);
  },
};

export class ApiErreur extends Error {
  constructor(statut, corps) {
    super(corps?.message ?? corps?.erreur ?? `Erreur ${statut}`);
    this.statut = statut;
    this.corps = corps;
  }
}

async function appel(methode, chemin, corps, options = {}) {
  const reponse = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: {
      Accept: 'application/json',
      ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(authStore.token ? { Authorization: `Bearer ${authStore.token}` } : {}),
    },
    body: corps !== undefined ? JSON.stringify(corps) : undefined,
    signal: options.signal,
  });

  const data = reponse.status === 204 ? null : await reponse.json().catch(() => null);

  if (!reponse.ok) {
    if (reponse.status === 401 && authStore.token) {
      // Jeton expiré/révoqué → on force la reconnexion
      authStore.clear();
      window.location.assign('/login');
    }
    throw new ApiErreur(reponse.status, data);
  }
  return data;
}

export const api = {
  get: (chemin, options) => appel('GET', chemin, undefined, options),
  post: (chemin, corps, options) => appel('POST', chemin, corps, options),
  put: (chemin, corps, options) => appel('PUT', chemin, corps, options),
  delete: (chemin, options) => appel('DELETE', chemin, undefined, options),

  login: (identifiant, password) =>
    appel('POST', '/auth/login', { identifiant, password }),
  loginPlateforme: (identifiant, password) =>
    appel('POST', '/auth/plateforme/login', { identifiant, password }),
  logout: () => appel('POST', '/auth/logout'),
};
