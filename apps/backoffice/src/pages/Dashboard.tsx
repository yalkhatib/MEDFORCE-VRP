import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fmt, get } from '../api';
import { Statut } from '../components/ui';

export function Dashboard() {
  const clients = useQuery({ queryKey: ['clients', 'dash'], queryFn: () => get('/clients?taille=1') });
  const commandes = useQuery({ queryKey: ['commandes', 'dash'], queryFn: () => get<any[]>('/commandes') });
  const demandes = useQuery({ queryKey: ['demandes', 'EN_ATTENTE'], queryFn: () => get<any[]>('/clients/demandes?statut=EN_ATTENTE') });
  const cmds = commandes.data ?? [];
  const aTraiter = cmds.filter((c) => ['SAISIE', 'EN_COURS', 'EN_ATTENTE_DEROGATION'].includes(c.statut));
  const ca = cmds.filter((c) => !['BROUILLON', 'ANNULEE'].includes(c.statut)).reduce((a, c) => a + c.totalNetHT, 0);

  return (
    <>
      <h1>
        Tableau de bord <span className="muted">Suivi de l'activité</span>
      </h1>
      <div className="kpis">
        <Kpi color="#f39c12" icon="⌂" label="Portefeuille clients" value={fmt(clients.data?.total, 0)} />
        <Kpi color="#24a148" icon="✓" label="Commandes à traiter" value={fmt(aTraiter.length, 0)} />
        <Kpi color="#17a2b8" icon="↗" label="CA commandé (HT)" value={fmt(ca)} />
        <Kpi color="#d9363e" icon="!" label="Fiches clients à valider" value={fmt(demandes.data?.length, 0)} />
      </div>
      <section className="panel">
        <h2>Dernières commandes</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Date</th>
                <th>Statut</th>
                <th className="num">Net HT</th>
              </tr>
            </thead>
            <tbody>
              {cmds.slice(0, 10).map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/commandes/${c.id}`}>{c.numero}</Link>
                  </td>
                  <td>{c.dateCommande}</td>
                  <td>
                    <Statut v={c.statut} />
                  </td>
                  <td className="num">{fmt(c.totalNetHT)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Kpi({ color, icon, label, value }: { color: string; icon: string; label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="ic" style={{ background: color }} aria-hidden>
        {icon}
      </div>
      <div className="v">
        <small>{label}</small>
        <b>{value || '0'}</b>
      </div>
    </div>
  );
}
