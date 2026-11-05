import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fmt, get, post, session } from '../api';
import { Chargement, Erreur, KV, Panel, Statut } from '../components/ui';

export function useProduits() {
  return useQuery({ queryKey: ['produits'], queryFn: () => get<any[]>('/produits') });
}

const ONGLETS: [string, string][] = [
  ['SAISIE,EN_ATTENTE_DEROGATION', 'Commandes saisies'],
  ['EN_COURS', 'En cours de traitement'],
  ['VALIDEE,TRANSFEREE_X3,LIVREE_PARTIEL,LIVREE,FACTUREE,ANNULEE', 'Historique'],
  ['BROUILLON', 'Brouillons'],
];

/** Écran de traitement des commandes (CDC §15) en onglets. */
export function Commandes() {
  const [onglet, setOnglet] = useState(ONGLETS[0][0]);
  const nav = useNavigate();
  const liste = useQuery({ queryKey: ['commandes', onglet], queryFn: () => get<any[]>(`/commandes?statut=${onglet}`) });
  const clients = useQuery({ queryKey: ['clients', 'all'], queryFn: () => get('/clients?taille=500') });
  const nomClient = (id: string) => clients.data?.items.find((c: any) => c.id === id)?.raisonSociale ?? '';
  const total = (liste.data ?? []).reduce((a, c) => a + c.totalNetHT, 0);

  return (
    <>
      <h1>Commandes</h1>
      <div className="toolbar">
        {ONGLETS.map(([k, l]) => (
          <button key={k} className={onglet === k ? '' : 'ghost'} onClick={() => setOnglet(k)}>{l}</button>
        ))}
        <Link className="btn" style={{ marginLeft: 'auto', background: 'var(--success)' }} to="/commandes/nouvelle">+ Nouvelle commande</Link>
      </div>
      <Chargement q={liste} />
      <section className="panel">
        <h2>
          <span>{ONGLETS.find(([k]) => k === onglet)?.[1]}</span>
          <span>{liste.data?.length ?? 0} commande(s) · {fmt(total)} DH HT</span>
        </h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>N°</th><th>N° provisoire</th><th>Client</th><th>Date</th><th>Livraison souhaitée</th><th>Origine</th><th>Statut</th><th className="num">Net HT</th><th className="num">Remise</th><th className="num">UG</th></tr></thead>
            <tbody>
              {liste.data?.map((c) => (
                <tr key={c.id} className="click" onClick={() => nav(`/commandes/${c.id}`)}>
                  <td><b>{c.numero}</b></td><td>{c.numeroProvisoire}</td><td>{nomClient(c.clientId)}</td><td>{c.dateCommande}</td><td>{c.dateLivraisonSouhaitee}</td><td>{c.origine}</td>
                  <td><Statut v={c.statut} />{!c.valide && <span className="badge ko" title="Conditions non respectées">!</span>}</td>
                  <td className="num">{fmt(c.totalNetHT)}</td><td className="num">{fmt(c.totalRemiseHT)}</td><td className="num">{fmt(c.totalUG, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const ACTIONS: Record<string, [string, string, string][]> = {
  BROUILLON: [['SAISIE', 'Confirmer', 'success'], ['ANNULEE', 'Annuler', 'danger']],
  EN_ATTENTE_DEROGATION: [['SAISIE', 'Accorder la dérogation', 'success'], ['BROUILLON', 'Refuser (retour brouillon)', 'warning'], ['ANNULEE', 'Annuler', 'danger']],
  SAISIE: [['EN_COURS', 'Prendre en charge', 'info'], ['ANNULEE', 'Annuler', 'danger']],
  EN_COURS: [['VALIDEE', 'Valider (transfert X3)', 'success'], ['SAISIE', 'Libérer', 'warning'], ['ANNULEE', 'Annuler', 'danger']],
};

export function CommandeDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const c = useQuery({ queryKey: ['commande', id], queryFn: () => get(`/commandes/${id}`) });
  const produits = useProduits();
  const packs = useQuery({ queryKey: ['packs'], queryFn: () => get<any[]>('/packs') });
  const client = useQuery({ enabled: !!c.data, queryKey: ['client', c.data?.clientId], queryFn: () => get(`/clients/${c.data.clientId}`) });
  const statut = useMutation({
    mutationFn: (p: { statut: string; motif?: string; motifDerogation?: string }) => post(`/commandes/${id}/statut`, p),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['commande', id] }), qc.invalidateQueries({ queryKey: ['commandes'] })),
  });
  if (!c.data) return <Chargement q={c} />;
  const d = c.data;
  const prod = (pid: string) => produits.data?.find((p) => p.id === pid);
  const pack = (pid: string) => packs.data?.find((p) => p.id === pid);
  const role = session()?.utilisateur.role;

  return (
    <>
      <h1>Commande {d.numero}</h1>
      <div className="toolbar">
        <Statut v={d.statut} />
        {['BROUILLON', 'EN_ATTENTE_DEROGATION'].includes(d.statut) && <Link className="btn" to={`/commandes/${d.id}/edition`}>Modifier</Link>}
        {(ACTIONS[d.statut] ?? []).map(([s, l, cls]) => (
          <button
            key={s}
            className={cls}
            disabled={statut.isPending || (s === 'VALIDEE' && !['ADMIN', 'VALIDATEUR_COMMANDES'].includes(role ?? ''))}
            onClick={() => statut.mutate({ statut: s, motif: s === 'ANNULEE' ? prompt("Motif d'annulation ?") ?? undefined : undefined })}
          >
            {l}
          </button>
        ))}
        {d.statut === 'BROUILLON' && !d.valide && (
          <button className="warning" onClick={() => statut.mutate({ statut: 'EN_ATTENTE_DEROGATION', motifDerogation: prompt('Motif de dérogation (TARIF, PLAFOND, DELAI, MODE_REGLEMENT, QTE) ?') ?? undefined })}>
            Demander une dérogation
          </button>
        )}
      </div>
      <Erreur e={statut.error} />
      {(d.anomalies ?? []).map((a: any, i: number) => <div key={i} className={`alert ${a.bloquante ? '' : 'info'}`}>{a.message}</div>)}
      <div className="grid2" style={{ gap: 16 }}>
        <Panel title="Client">
          <KV rows={[
            ['Raison sociale', client.data && <Link to={`/clients/${client.data.id}`}>{client.data.raisonSociale}</Link>],
            ['Pharmacien', client.data?.pharmacienNom], ['Code X3', client.data?.codeX3],
            ['Solvabilité', client.data?.solvabilite === 'INSOLVABLE' ? <span className="badge ko">◆ à surveiller</span> : client.data?.solvabilite],
          ]} />
        </Panel>
        <Panel title="Informations commande">
          <KV rows={[
            ['Date / livraison souhaitée', `${d.dateCommande} → ${d.dateLivraisonSouhaitee ?? ''}`], ['Origine', d.origine], ['N° provisoire (mobile)', d.numeroProvisoire],
            ['Mode de règlement', d.modeReglement], ['Priorité', d.priorite], ['Motif de dérogation', d.motifDerogation], ['Commentaire', d.commentaire],
          ]} />
        </Panel>
      </div>
      <Panel title="Lignes">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pack</th><th>Produit</th><th className="num">Qté</th><th className="num">PPH HT</th><th className="num">Remise %</th><th className="num">Prix remisé HT</th><th className="num">Net HT</th><th className="num">Net TTC</th></tr></thead>
            <tbody>
              {d.lignes.map((l: any) => (
                <tr key={l.id}>
                  <td>{pack(l.packId)?.numero}</td>
                  <td>{prod(l.produitId)?.designation} {l.gratuit && <span className="badge ok">UG</span>}</td>
                  <td className="num">{fmt(l.qte, 0)}</td><td className="num">{fmt(l.prixUnitaireHT)}</td><td className="num">{fmt(l.tauxRemise)}</td>
                  <td className="num">{fmt(l.montantNetHT / (l.qte || 1))}</td><td className="num">{fmt(l.montantNetHT)}</td><td className="num">{fmt(l.montantNetTTC)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th colSpan={6} className="num">Brut HT / Remise / Net HT / TVA / TTC</th><th className="num" colSpan={2}>{fmt(d.totalBrutHT)} / {fmt(d.totalRemiseHT)} / <b>{fmt(d.totalNetHT)}</b> / {fmt(d.totalTVA)} / <b>{fmt(d.totalNetTTC)}</b></th></tr>
            </tfoot>
          </table>
        </div>
      </Panel>
      <Panel title="Circuit de traitement">
        <table>
          <tbody>{(d.historiqueStatuts ?? []).map((h: any, i: number) => <tr key={i}><td>{new Date(h.date).toLocaleString('fr-MA')}</td><td><Statut v={h.statut} /></td><td>{h.motif}</td></tr>)}</tbody>
        </table>
      </Panel>
    </>
  );
}
