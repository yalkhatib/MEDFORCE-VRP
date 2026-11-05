import { useMutation, useQuery } from '@tanstack/react-query';
import { packsDisponibles, type Pack, type PackSaisi } from '@medforce/core';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { fmt, get, post, put, uuid } from '../api';
import { Erreur, Panel } from '../components/ui';
import { useProduits } from './Commandes';

const LIB_TYPE: Record<string, string> = {
  PANACHE: 'Conditions panachées',
  PAR_PRODUIT: 'Conditions par produit',
  RESTE_GAMME: 'Reste de la gamme',
  UG_GLOBALES: 'UG globales',
  CLE: 'Condition clé',
};

function useDebounce<T>(v: T, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

/**
 * Saisie de commande back-office (téléphonistes / RP) : même moteur de calcul que la tablette,
 * calcul à la volée côté serveur (remises, UG, contrôles, palier suivant).
 */
export function SaisieCommande() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [commandeId] = useState(id ?? uuid());
  const [clientId, setClientId] = useState(sp.get('clientId') ?? '');
  const [rechercheClient, setRechercheClient] = useState('');
  const [saisie, setSaisie] = useState<PackSaisi[]>([]);
  const [entete, setEntete] = useState({ dateLivraisonSouhaitee: '', modeReglement: '', priorite: 'NORMAL', commentaire: '' });
  const date = new Date().toISOString().slice(0, 10);

  const existante = useQuery({ enabled: !!id, queryKey: ['commande', id], queryFn: () => get(`/commandes/${id}`) });
  useEffect(() => {
    if (existante.data) {
      setClientId(existante.data.clientId);
      setSaisie(existante.data.saisie);
      setEntete({
        dateLivraisonSouhaitee: existante.data.dateLivraisonSouhaitee ?? '',
        modeReglement: existante.data.modeReglement ?? '',
        priorite: existante.data.priorite ?? 'NORMAL',
        commentaire: existante.data.commentaire ?? '',
      });
    }
  }, [existante.data]);

  const clients = useQuery({ queryKey: ['clients', 'saisie', rechercheClient], queryFn: () => get(`/clients?taille=20&q=${encodeURIComponent(rechercheClient)}`) });
  const client = useQuery({ enabled: !!clientId, queryKey: ['client', clientId], queryFn: () => get(`/clients/${clientId}`) });
  const packs = useQuery({ queryKey: ['packs', 'actifs'], queryFn: () => get<Pack[]>('/packs?actifs=true') });
  const produits = useProduits();
  const prod = (pid: string) => produits.data?.find((p) => p.id === pid);
  const disponibles = useMemo(() => (packs.data && clientId ? packsDisponibles(packs.data, clientId, date) : []), [packs.data, clientId, date]);

  const corps = { id: commandeId, clientId, dateCommande: date, packs: saisie, ...entete, dateLivraisonSouhaitee: entete.dateLivraisonSouhaitee || null, origine: 'BACKOFFICE' };
  const debounced = useDebounce(JSON.stringify(corps));
  const simulation = useQuery({
    enabled: !!clientId && saisie.length > 0,
    queryKey: ['simulation', debounced],
    queryFn: () => post('/commandes/simulation', JSON.parse(debounced)),
    placeholderData: (p) => p,
  });
  const resultatPack = (packId: string) => simulation.data?.packs.find((p: any) => p.packId === packId);

  const enregistrer = useMutation({
    mutationFn: async (confirmer: boolean) => {
      const c = id ? await put(`/commandes/${id}`, corps) : await post('/commandes', corps);
      if (confirmer) await post(`/commandes/${c.id}/statut`, { statut: 'SAISIE' });
      return c;
    },
    onSuccess: (c) => nav(`/commandes/${c.id}`),
  });

  const majLigne = (packId: string, produitId: string, qte: number) =>
    setSaisie((s) =>
      s.map((p) => (p.packId !== packId ? p : { ...p, lignes: [...p.lignes.filter((l) => l.produitId !== produitId), ...(qte > 0 ? [{ produitId, qte }] : [])] })),
    );
  const majUG = (packId: string, produitId: string, qte: number) =>
    setSaisie((s) =>
      s.map((p) => (p.packId !== packId ? p : { ...p, ug: [...(p.ug ?? []).filter((l) => l.produitId !== produitId), ...(qte > 0 ? [{ produitId, qte }] : [])] })),
    );

  return (
    <>
      <h1>{id ? 'Modifier la commande' : 'Nouvelle commande'}</h1>
      <div className="grid2" style={{ gap: 16 }}>
        <Panel title="Client">
          {!clientId ? (
            <>
              <input placeholder="Rechercher une pharmacie ou un pharmacien…" value={rechercheClient} onChange={(e) => setRechercheClient(e.target.value)} style={{ width: '100%' }} autoFocus />
              <table>
                <tbody>
                  {clients.data?.items.map((c: any) => (
                    <tr key={c.id} className="click" onClick={() => setClientId(c.id)}>
                      <td>{c.codeX3 ?? c.code}</td><td><b>{c.raisonSociale}</b></td><td>{c.pharmacienNom}</td><td>{c.ville}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div>
              <p>
                <b>{client.data?.raisonSociale}</b> {client.data?.solvabilite === 'INSOLVABLE' && <span className="badge ko">◆</span>} {client.data?.bloque && <span className="badge ko">Bloqué X3</span>}
                <br />
                <span className="muted">{client.data?.pharmacienNom} · {client.data?.ville} · Code X3 {client.data?.codeX3 ?? '—'}</span>
              </p>
              {!id && <button className="ghost" onClick={() => (setClientId(''), setSaisie([]))}>Changer de client</button>}
            </div>
          )}
        </Panel>
        <Panel title="Entête de commande">
          <div className="row">
            <label>Livraison souhaitée <input type="date" value={entete.dateLivraisonSouhaitee} onChange={(e) => setEntete({ ...entete, dateLivraisonSouhaitee: e.target.value })} /></label>
            <label>Mode de règlement{' '}
              <select value={entete.modeReglement} onChange={(e) => setEntete({ ...entete, modeReglement: e.target.value })}>
                <option value="">(fiche client)</option>
                {['CHEQUE', 'TRAITE', 'VIREMENT', 'CHEQUE_CERTIFIE', 'NORMAL'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label>Priorité <select value={entete.priorite} onChange={(e) => setEntete({ ...entete, priorite: e.target.value })}>{['NORMAL', 'GARDE', 'URGENT'].map((m) => <option key={m}>{m}</option>)}</select></label>
          </div>
          <p><textarea placeholder="Commentaire (imprimé sur le BL)" style={{ width: '100%' }} value={entete.commentaire} onChange={(e) => setEntete({ ...entete, commentaire: e.target.value })} /></p>
        </Panel>
      </div>

      {clientId && (
        <div className="toolbar">
          <select
            value=""
            aria-label="Ajouter un pack"
            onChange={(e) => e.target.value && setSaisie((s) => (s.some((p) => p.packId === e.target.value) ? s : [...s, { packId: e.target.value, lignes: [] }]))}
          >
            <option value="">+ Ajouter un pack de conditions…</option>
            {disponibles.map((p) => <option key={p.id} value={p.id}>{p.numero} – {p.designation} ({LIB_TYPE[p.typeCondition]})</option>)}
          </select>
          {simulation.isFetching && <span className="muted">Calcul…</span>}
        </div>
      )}

      {saisie.map((s) => {
        const pack = packs.data?.find((p) => p.id === s.packId);
        if (!pack) return null;
        const r = resultatPack(s.packId);
        const listeProduits = pack.produits.length ? pack.produits : (produits.data ?? []).filter((p) => p.vendable).map((p) => ({ produitId: p.id }));
        const tri = [...listeProduits].sort((a: any, b: any) => `${a.categorie ?? 'Z'}${a.groupe ?? ''}`.localeCompare(`${b.categorie ?? 'Z'}${b.groupe ?? ''}`));
        const aChoix = pack.conditions.some((c) => c.typeRemise === 'RF_OU_UG');
        return (
          <Panel
            key={s.packId}
            title={`${pack.numero} – ${pack.designation} · ${LIB_TYPE[pack.typeCondition]}`}
            actions={<button className="danger" onClick={() => setSaisie((x) => x.filter((p) => p.packId !== s.packId))}>Retirer</button>}
          >
            <div className="grid2" style={{ gap: 16 }}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Catégorie / groupe</th><th>Produit</th><th className="num">PPH HT</th><th className="num">Min–Max</th><th className="num">Qté</th><th className="num">Remise</th><th className="num">Net HT</th></tr></thead>
                  <tbody>
                    {tri.map((pp: any) => {
                      const p = prod(pp.produitId);
                      const l = s.lignes.find((x) => x.produitId === pp.produitId);
                      const calc = r?.lignes.find((x: any) => x.produitId === pp.produitId);
                      return (
                        <tr key={pp.produitId}>
                          <td>{pp.categorie && <span className="badge">{pp.categorie}</span>} {pp.groupe}</td>
                          <td>{p?.designation} {p?.stockDisponible === 0 && <span className="badge ko">Rupture</span>}</td>
                          <td className="num">{fmt(p?.pphHT)}</td>
                          <td className="num muted">{pp.qteMin ?? ''}–{pp.qteMax ?? ''}</td>
                          <td className="num"><input className="qty" type="number" min={0} aria-label={`Quantité ${p?.designation}`} value={l?.qte ?? ''} onChange={(e) => majLigne(s.packId, pp.produitId, Number(e.target.value))} /></td>
                          <td className="num">{calc ? `${fmt(calc.tauxRemise)} %` : ''}</td>
                          <td className="num">{calc ? fmt(calc.montantNetHT) : ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div>
                <table>
                  <thead><tr><th>Catégorie</th><th className="num">Seuil min</th><th className="num">Seuil max</th><th>Remise</th><th className="num">Taux RF</th><th>UG</th></tr></thead>
                  <tbody>
                    {pack.conditions.map((c, i) => (
                      <tr key={i} style={r?.conditionsAppliquees?.some((x: any) => x.seuilMin === c.seuilMin && x.categorie == c.categorie) ? { background: 'var(--primary-soft)', fontWeight: 600 } : undefined}>
                        <td>{c.categorie ?? 'Total'}</td><td className="num">{fmt(c.seuilMin, Number.isInteger(c.seuilMin) ? 0 : 2)}</td><td className="num">{c.seuilMax != null ? fmt(c.seuilMax, Number.isInteger(c.seuilMax) ? 0 : 2) : ''}</td><td>{c.typeRemise}</td><td className="num">{c.tauxRF ?? ''}</td><td>{c.typeUG ? `${c.typeUG} ${c.tauxUG ?? c.qteUgFixe ?? ''}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pack.nombreMinCores ? <p className="muted">Nombre minimum de groupes Core : {pack.nombreMinCores}</p> : null}
                {aChoix && (
                  <p className="row">
                    Remise : {(['RF', 'UG'] as const).map((v) => (
                      <label key={v}><input type="radio" checked={(s.choixRemise ?? 'RF') === v} onChange={() => setSaisie((x) => x.map((p) => (p.packId === s.packId ? { ...p, choixRemise: v } : p)))} /> {v === 'RF' ? 'Remise financière' : 'Unités gratuites'}</label>
                    ))}
                  </p>
                )}
                {r && (
                  <p>
                    Seuil commande : <b>{fmt(r.seuil, pack.baseSeuil === 'QUANTITE' ? 0 : 2)}</b> · Net HT <b>{fmt(r.totalNetHT)}</b> · Remise {fmt(r.totalRemiseHT)}
                  </p>
                )}
                {r?.droitUG && (
                  <div>
                    <b>Unités gratuites</b> — droit : {r.droitUG.quantite != null ? `${r.droitUG.quantite} unité(s)` : `${fmt(r.droitUG.valeur)} DH`}
                    <table>
                      <tbody>
                        {(r.droitUG.preRemplies ?? r.droitUG.produitsProposables.map((pid: string) => ({ produitId: pid, qte: undefined }))).map((u: any) => (
                          <tr key={u.produitId}>
                            <td>{prod(u.produitId)?.designation}</td>
                            <td className="num">
                              {r.droitUG.type === 'PCT_QTE_PRORATA' ? (
                                <b>{u.qte}</b>
                              ) : (
                                <input className="qty" type="number" min={0} aria-label={`UG ${prod(u.produitId)?.designation}`} value={s.ug?.find((x) => x.produitId === u.produitId)?.qte ?? ''} onChange={(e) => majUG(s.packId, u.produitId, Number(e.target.value))} />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {r?.anomalies.map((a: any, i: number) => <div key={i} className={`alert ${a.bloquante ? '' : 'info'}`}>{a.message}</div>)}
              </div>
            </div>
          </Panel>
        );
      })}

      {simulation.data && (
        <Panel title="Totaux de la commande">
          {simulation.data.anomalies.filter((a: any) => !a.packId).map((a: any, i: number) => <div key={i} className={`alert ${a.bloquante ? '' : 'info'}`}>{a.message}</div>)}
          {simulation.data.suggestions?.map((s: any) => (
            <div key={s.packId} className="alert info">Pack {s.numero} : encore {fmt(s.ecart)} pour atteindre le palier {fmt(s.prochainSeuil, 0)} ({s.condition.typeRemise} {s.condition.tauxRF ?? s.condition.tauxUG ?? ''} %).</div>
          ))}
          <div className="kpis" style={{ marginTop: 8 }}>
            {[
              ['Brut HT', simulation.data.totalBrutHT],
              ['Remise HT', simulation.data.totalRemiseHT],
              ['Net HT', simulation.data.totalNetHT],
              ['TVA', simulation.data.totalTVA],
              ['Net TTC', simulation.data.totalNetTTC],
            ].map(([l, v]) => <div className="kpi" key={l as string}><div className="v"><small>{l}</small><b>{fmt(v as number)}</b></div></div>)}
            <div className="kpi"><div className="v"><small>Quantité / UG</small><b>{fmt(simulation.data.totalQuantite, 0)} / {fmt(simulation.data.totalUG, 0)}</b></div></div>
          </div>
          <Erreur e={enregistrer.error} />
          <div className="toolbar">
            <button onClick={() => enregistrer.mutate(false)} disabled={enregistrer.isPending}>Enregistrer le brouillon</button>
            <button className="success" onClick={() => enregistrer.mutate(true)} disabled={enregistrer.isPending || !simulation.data.valide}>Enregistrer et confirmer</button>
            {!simulation.data.valide && <span className="muted">Commande non conforme : enregistrer en brouillon puis demander une dérogation.</span>}
          </div>
        </Panel>
      )}
    </>
  );
}
