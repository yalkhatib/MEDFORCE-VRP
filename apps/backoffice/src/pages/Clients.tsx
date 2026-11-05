import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fmt, get, post } from '../api';
import { Chargement, Erreur, KV, Panel, Statut } from '../components/ui';

export function useSecteurs() {
  return useQuery({ queryKey: ['secteurs'], queryFn: () => get<any[]>('/secteurs') });
}
export function useRps() {
  return useQuery({ queryKey: ['utilisateurs', 'RP'], queryFn: () => get<any[]>('/utilisateurs?role=RP') });
}

export function Clients() {
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('');
  const [rpId, setRpId] = useState('');
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<string[]>([]);
  const [rpCible, setRpCible] = useState('');
  const nav = useNavigate();
  const qc = useQueryClient();
  const rps = useRps();
  const params = new URLSearchParams({ q, statut, rpId, page: String(page), taille: '50' });
  const liste = useQuery({ queryKey: ['clients', q, statut, rpId, page], queryFn: () => get(`/clients?${params}`) });
  const affecter = useMutation({
    mutationFn: () => post('/clients/affectation', { clientIds: selection, rpId: rpCible }),
    onSuccess: () => (setSelection([]), qc.invalidateQueries({ queryKey: ['clients'] })),
  });
  const nomRp = (id: string) => rps.data?.find((r) => r.id === id);

  return (
    <>
      <h1>Clients</h1>
      <div className="toolbar">
        <input placeholder="Raison sociale, pharmacien, code X3…" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} style={{ minWidth: 280 }} />
        <select value={statut} onChange={(e) => (setStatut(e.target.value), setPage(1))} aria-label="Statut">
          <option value="">Tous les statuts</option>
          {['CREE_NON_VALIDE', 'VALIDE_SANS_X3', 'ACTIF', 'INACTIF'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={rpId} onChange={(e) => (setRpId(e.target.value), setPage(1))} aria-label="RP">
          <option value="">Tous les RP</option>
          {rps.data?.map((r) => (
            <option key={r.id} value={r.id}>{r.codeRp} – {r.prenom} {r.nom}</option>
          ))}
        </select>
        {selection.length > 0 && (
          <span className="row">
            <b>{selection.length} sélectionné(s)</b>
            <select value={rpCible} onChange={(e) => setRpCible(e.target.value)} aria-label="Affecter au RP">
              <option value="">Affecter au RP…</option>
              {rps.data?.map((r) => (
                <option key={r.id} value={r.id}>{r.codeRp} – {r.prenom} {r.nom}</option>
              ))}
            </select>
            <button className="success" disabled={!rpCible || affecter.isPending} onClick={() => affecter.mutate()}>
              Affecter
            </button>
          </span>
        )}
      </div>
      <Erreur e={affecter.error} />
      <Chargement q={liste} />
      {liste.data && (
        <section className="panel">
          <h2>
            Liste des clients <span>{liste.data.total} élément(s)</span>
          </h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Code</th>
                  <th>Code X3</th>
                  <th>Raison sociale</th>
                  <th>Pharmacien</th>
                  <th>Ville</th>
                  <th>Ciblage</th>
                  <th>RP</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {liste.data.items.map((c: any) => (
                  <tr key={c.id} className="click" onClick={() => nav(`/clients/${c.id}`)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner ${c.raisonSociale}`}
                        checked={selection.includes(c.id)}
                        onChange={(e) => setSelection((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                      />
                    </td>
                    <td>{c.code}</td>
                    <td>{c.codeX3}</td>
                    <td>
                      <b>{c.raisonSociale}</b> {c.solvabilite === 'INSOLVABLE' && <span className="badge ko" title="Indicateur interne">◆</span>}
                      {c.bloque && <span className="badge ko">bloqué</span>}
                    </td>
                    <td>{c.pharmacienNom}</td>
                    <td>{c.ville}</td>
                    <td>{c.ciblage}</td>
                    <td>{nomRp(c.rpId)?.codeRp}</td>
                    <td>
                      <Statut v={c.statut} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="body row">
            <button className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Précédent</button>
            <span>Page {page} / {Math.max(1, Math.ceil(liste.data.total / 50))}</span>
            <button className="ghost" disabled={page * 50 >= liste.data.total} onClick={() => setPage(page + 1)}>Suivant ›</button>
          </div>
        </section>
      )}
    </>
  );
}

export function ClientDetail() {
  const { id } = useParams();
  const c = useQuery({ queryKey: ['client', id], queryFn: () => get(`/clients/${id}`) });
  const histo = useQuery({ queryKey: ['client', id, 'histo'], queryFn: () => get<any[]>(`/clients/${id}/historique-affectations`) });
  const cmds = useQuery({ queryKey: ['commandes', 'client', id], queryFn: () => get<any[]>(`/commandes?clientId=${id}`) });
  const visites = useQuery({ queryKey: ['visites', 'client', id], queryFn: () => get<any[]>(`/visites?clientId=${id}`) });
  const secteurs = useSecteurs();
  const rps = useRps();
  if (!c.data) return <Chargement q={c} />;
  const d = c.data;
  const rp = rps.data?.find((r) => r.id === d.rpId);
  const ss = secteurs.data?.find((s) => s.id === d.sousSecteurId);

  return (
    <>
      <h1>{d.raisonSociale}</h1>
      <div className="toolbar">
        <Statut v={d.statut} />
        <Link className="btn" to={`/commandes/nouvelle?clientId=${d.id}`}>Nouvelle commande</Link>
      </div>
      <div className="grid2" style={{ gap: 16 }}>
        <Panel title="Identification administrative">
          <KV rows={[
            ['Code', d.code], ['Code Sage X3', d.codeX3], ['Catégorie', d.categorie], ['ICE', d.ice], ['Patente', d.patente],
            ['N° autorisation', d.numeroAutorisation], ['Opérateur', d.operateurCreation],
          ]} />
        </Panel>
        <Panel title="Gestionnaire & contacts">
          <KV rows={[
            ['Pharmacien responsable', d.pharmacienNom], ['GSM', [d.gsm1, d.gsm2].filter(Boolean).join(' / ') || null],
            ['Email', [d.email1, d.email2].filter(Boolean).join(' / ') || null], ['Téléphone', [d.telephone1, d.telephone2].filter(Boolean).join(' / ') || null],
            ['Ne partage pas GSM / email', `${d.neSouhaitePasPartagerGsm ? 'Oui' : 'Non'} / ${d.neSouhaitePasPartagerEmail ? 'Oui' : 'Non'}`],
            ['Adresse', d.adresse], ['GPS', d.latitude != null ? `${d.latitude}, ${d.longitude}` : null],
          ]} />
        </Panel>
        <Panel title="Identification Cooper">
          <KV rows={[
            ['Sous-secteur', ss ? `${ss.code} – ${ss.designation}` : null], ['RP affecté', rp ? `${rp.codeRp} – ${rp.prenom} ${rp.nom}` : null],
            ['Ciblage', d.ciblage], ['Solvabilité', d.solvabilite], ['Politique commerciale', d.politiqueCommerciale],
            ['Modalité de règlement', d.modaliteReglement], ['Emplacement', d.emplacement],
          ]} />
        </Panel>
        <Panel title="Situation Sage X3">
          <KV rows={[
            ['Bloqué', d.bloque ? <span className="badge ko">Bloqué</span> : 'Non'], ['Contentieux', d.contentieux],
            ['Plafond d’encours', fmt(d.plafondEncours)], ['Encours commercial', fmt(d.encoursCommercial)],
          ]} />
        </Panel>
      </div>
      <Panel title="Historique des commandes">
        <div className="table-wrap">
          <table>
            <thead><tr><th>N°</th><th>Date</th><th>Statut</th><th className="num">Net HT</th><th className="num">UG</th></tr></thead>
            <tbody>
              {cmds.data?.map((x) => (
                <tr key={x.id}><td><Link to={`/commandes/${x.id}`}>{x.numero}</Link></td><td>{x.dateCommande}</td><td><Statut v={x.statut} /></td><td className="num">{fmt(x.totalNetHT)}</td><td className="num">{fmt(x.totalUG, 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid2" style={{ gap: 16 }}>
        <Panel title="Visites">
          <table>
            <thead><tr><th>Date</th><th>Statut</th><th>Hors plan</th></tr></thead>
            <tbody>{visites.data?.map((v) => <tr key={v.id}><td>{v.datePrevue}</td><td><Statut v={v.statut} /></td><td>{v.horsPlan ? <span className="badge warn">Hors plan</span> : ''}</td></tr>)}</tbody>
          </table>
        </Panel>
        <Panel title="Historique des affectations RP">
          <table>
            <thead><tr><th>Date</th><th>Ancien RP</th><th>Nouveau RP</th></tr></thead>
            <tbody>
              {histo.data?.map((h) => (
                <tr key={h.id}><td>{new Date(h.dateEffet).toLocaleString('fr-MA')}</td><td>{rps.data?.find((r) => r.id === h.ancienneValeur)?.codeRp ?? '—'}</td><td>{rps.data?.find((r) => r.id === h.nouvelleValeur)?.codeRp}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
