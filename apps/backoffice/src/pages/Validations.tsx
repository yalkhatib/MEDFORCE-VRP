import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { get, post, session } from '../api';
import { Chargement, Erreur, Statut } from '../components/ui';

/** Écran de pré-validation / validation des créations et modifications de fiches clients (CDC §6.3). */
export function Validations() {
  const [statut, setStatut] = useState('EN_ATTENTE,PRE_VALIDEE');
  const qc = useQueryClient();
  const demandes = useQuery({
    queryKey: ['demandes', statut],
    queryFn: async () => (await Promise.all(statut.split(',').map((s) => get<any[]>(`/clients/demandes?statut=${s}`)))).flat(),
  });
  const clients = useQuery({ queryKey: ['clients', 'all-validation'], queryFn: () => get('/clients?taille=500') });
  const decision = useMutation({
    mutationFn: (p: { id: string; decision: string; motif?: string }) => post(`/clients/demandes/${p.id}/decision`, p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes'] }),
  });
  const role = session()?.utilisateur.role;
  const nomClient = (id: string) => clients.data?.items.find((c: any) => c.id === id)?.raisonSociale ?? id.slice(0, 8);

  return (
    <>
      <h1>Validation des fiches clients</h1>
      <div className="toolbar">
        <select value={statut} onChange={(e) => setStatut(e.target.value)} aria-label="Statut">
          <option value="EN_ATTENTE,PRE_VALIDEE">À traiter</option>
          <option value="VALIDEE">Validées</option>
          <option value="REJETEE">Rejetées</option>
        </select>
      </div>
      <Erreur e={decision.error} />
      <Chargement q={demandes} />
      <section className="panel">
        <h2>Demandes</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Client</th><th>Changements (ancienne → nouvelle valeur)</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {demandes.data?.map((d) => (
                <tr key={d.id}>
                  <td>{new Date(d.createdAt).toLocaleString('fr-MA')}</td>
                  <td>{d.type === 'CREATION' ? 'Création' : 'Modification'}</td>
                  <td>{nomClient(d.clientId)}</td>
                  <td>
                    {Object.entries(d.changements ?? {}).map(([k, v]: any) => (
                      <div key={k}>
                        <b>{k}</b> : <span className="muted">{JSON.stringify(v.ancien)}</span> → {JSON.stringify(v.nouveau)}
                      </div>
                    ))}
                  </td>
                  <td><Statut v={d.statut} /></td>
                  <td className="row">
                    {['EN_ATTENTE'].includes(d.statut) && <button className="info" onClick={() => decision.mutate({ id: d.id, decision: 'PREVALIDER' })}>Pré-valider</button>}
                    {['EN_ATTENTE', 'PRE_VALIDEE'].includes(d.statut) && ['ADMIN', 'COORDINATEUR'].includes(role ?? '') && (
                      <>
                        <button className="success" onClick={() => decision.mutate({ id: d.id, decision: 'VALIDER' })}>Valider</button>
                        <button className="danger" onClick={() => decision.mutate({ id: d.id, decision: 'REJETER', motif: prompt('Motif du rejet ?') ?? undefined })}>Rejeter</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
