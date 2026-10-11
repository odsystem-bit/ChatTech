import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Abonnements from './pages/Abonnements.jsx';
import Articles from './pages/Articles.jsx';
import Comptes from './pages/Comptes.jsx';
import Entreprises from './pages/Entreprises.jsx';
import Equipes from './pages/Equipes.jsx';
import Interventions from './pages/Interventions.jsx';
import Login from './pages/Login.jsx';
import PlateformeLogin from './pages/PlateformeLogin.jsx';
import Stock from './pages/Stock.jsx';

function Protege({ roles, children }) {
  const { connecte, compte } = useAuth();
  const location = useLocation();

  if (!connecte) {
    return <Navigate to="/login" replace state={{ depuis: location.pathname }} />;
  }
  if (roles && !roles.includes(compte.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function Accueil() {
  const { compte } = useAuth();
  return (
    <Navigate
      to={compte?.role === 'super_admin' ? '/entreprises' : '/interventions'}
      replace
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/plateforme" element={<PlateformeLogin />} />
        <Route element={<Protege><Layout /></Protege>}>
          <Route path="/" element={<Accueil />} />
          <Route path="/interventions" element={
            <Protege roles={['admin', 'gestionnaire']}><Interventions /></Protege>
          } />
          <Route path="/comptes" element={
            <Protege roles={['admin']}><Comptes /></Protege>
          } />
          <Route path="/equipes" element={
            <Protege roles={['admin']}><Equipes /></Protege>
          } />
          <Route path="/articles" element={
            <Protege roles={['admin', 'gestionnaire']}><Articles /></Protege>
          } />
          <Route path="/stock" element={
            <Protege roles={['admin', 'gestionnaire']}><Stock /></Protege>
          } />
          <Route path="/entreprises" element={
            <Protege roles={['super_admin']}><Entreprises /></Protege>
          } />
          <Route path="/abonnements" element={
            <Protege roles={['super_admin']}><Abonnements /></Protege>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
