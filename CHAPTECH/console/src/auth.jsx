import { createContext, useContext, useMemo, useState } from 'react';
import { api, authStore } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [compte, setCompte] = useState(authStore.compte);

  const valeur = useMemo(() => ({
    compte,
    connecte: !!compte,
    async login(identifiant, password) {
      const data = await api.login(identifiant, password);
      authStore.save(data.token, data.compte);
      setCompte(data.compte);
      return data.compte;
    },
    async loginPlateforme(identifiant, password) {
      const data = await api.loginPlateforme(identifiant, password);
      authStore.save(data.token, data.compte);
      setCompte(data.compte);
      return data.compte;
    },
    async logout() {
      try { await api.logout(); } catch { /* jeton déjà mort : pas grave */ }
      authStore.clear();
      setCompte(null);
    },
  }), [compte]);

  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
