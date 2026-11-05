import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { session, setSession } from './api';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ClientDetail, Clients } from './pages/Clients';
import { Validations } from './pages/Validations';
import { Sectorisation } from './pages/Sectorisation';
import { Catalogue } from './pages/Catalogue';
import { CommandeDetail, Commandes } from './pages/Commandes';
import { SaisieCommande } from './pages/SaisieCommande';
import { Planification } from './pages/Planification';

const MENU = [
  ['/', 'Tableau de bord'],
  ['/clients', 'Clients'],
  ['/validations', 'Validations'],
  ['/commandes', 'Commandes'],
  ['/planification', 'Planification'],
  ['/sectorisation', 'Sectorisation'],
  ['/catalogue', 'Catalogue & packs'],
] as const;

export function App() {
  const s = session();
  const nav = useNavigate();
  if (!s) return (
    <Routes>
      <Route path="*" element={<Login />} />
    </Routes>
  );
  return (
    <>
      <header className="top">
        <div className="brand">
          <b>Med</b>Force <span style={{ fontWeight: 300 }}>VRP</span>
        </div>
        <nav>
          {MENU.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="user">
          <span>
            {s.utilisateur.prenom} {s.utilisateur.nom} · {s.utilisateur.role}
          </span>
          <button
            className="ghost"
            style={{ color: '#fff', borderColor: 'rgba(255,255,255,.4)' }}
            onClick={() => {
              setSession(null);
              nav('/login');
              location.reload();
            }}
          >
            Déconnexion
          </button>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/validations" element={<Validations />} />
          <Route path="/commandes" element={<Commandes />} />
          <Route path="/commandes/nouvelle" element={<SaisieCommande />} />
          <Route path="/commandes/:id/edition" element={<SaisieCommande />} />
          <Route path="/commandes/:id" element={<CommandeDetail />} />
          <Route path="/planification" element={<Planification />} />
          <Route path="/sectorisation" element={<Sectorisation />} />
          <Route path="/catalogue" element={<Catalogue />} />
          <Route path="/login" element={<Navigate to="/" />} />
          <Route path="*" element={<p>Page introuvable.</p>} />
        </Routes>
      </main>
    </>
  );
}
