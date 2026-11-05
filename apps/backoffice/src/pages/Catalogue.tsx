import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { fmt, get } from '../api';
import { Chargement, Panel } from '../components/ui';
import { useProduits } from './Commandes';

export function Catalogue() {
  const produits = useProduits();
  const gammes = useQuery({ queryKey: ['gammes'], queryFn: () => get<any[]>('/gammes') });
  const packs = useQuery({ queryKey: ['packs'], queryFn: () => get<any[]>('/packs') });
  const [packOuvert, setPackOuvert] = useState<string | null>(null);
  const nomProduit = (id: string) => produits.data?.find((p) => p.id === id)?.designation ?? id;

  return (
    <>
      <h1>Catalogue & conditions commerciales</h1>
      <Panel title="Packs (types de conditions)">
        <Chargement q={packs} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>N°</th><th>Désignation</th><th>Type de conditions</th><th>Base seuil</th><th>Validité</th><th>Actif</th><th>Paliers</th></tr></thead>
            <tbody>
              {packs.data?.map((p) => (
                <Fragment key={p.id}>
                  <tr className="click" onClick={() => setPackOuvert(packOuvert === p.id ? null : p.id)}>
                    <td><b>{p.numero}</b></td><td>{p.designation}</td><td>{p.typeCondition}</td><td>{p.baseSeuil}{p.unitaire ? ' · unitaire' : ''}</td>
                    <td>{p.dateDebut} → {p.dateFin}</td><td>{p.actif ? <span className="badge ok">Actif</span> : <span className="badge ko">Inactif</span>}</td><td>{p.conditions.length}</td>
                  </tr>
                  {packOuvert === p.id && (
                    <tr>
                      <td colSpan={7}>
                        <div className="grid2" style={{ gap: 16 }}>
                          <table>
                            <thead><tr><th>Produit</th><th>Catégorie</th><th>Groupe</th><th className="num">Min</th><th className="num">Max</th><th className="num">Remise max</th></tr></thead>
                            <tbody>{p.produits.map((x: any) => <tr key={x.produitId}><td>{nomProduit(x.produitId)}</td><td>{x.categorie}</td><td>{x.groupe}</td><td className="num">{x.qteMin}</td><td className="num">{x.qteMax}</td><td className="num">{x.maxRemisePct}</td></tr>)}</tbody>
                          </table>
                          <table>
                            <thead><tr><th>Catégorie</th><th className="num">Seuil min</th><th className="num">Seuil max</th><th>Type</th><th className="num">RF %</th><th>UG</th></tr></thead>
                            <tbody>{p.conditions.map((c: any, i: number) => <tr key={i}><td>{c.categorie ?? 'Total'}</td><td className="num">{c.seuilMin}</td><td className="num">{c.seuilMax}</td><td>{c.typeRemise}</td><td className="num">{c.tauxRF}</td><td>{c.typeUG} {c.tauxUG ?? c.qteUgFixe}</td></tr>)}</tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Produits (synchronisés depuis Sage X3)">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Désignation</th><th>Gamme</th><th>Catégorie</th><th className="num">PPH HT</th><th className="num">TVA</th><th className="num">Colisage</th><th className="num">Priorité</th><th className="num">Stock</th></tr></thead>
            <tbody>
              {produits.data?.map((p) => (
                <tr key={p.id}><td>{p.code}</td><td>{p.designation}</td><td>{gammes.data?.find((g) => g.id === p.gammeId)?.libelle}</td><td>{p.categorie}</td><td className="num">{fmt(p.pphHT)}</td><td className="num">{fmt(p.tauxTva, 0)} %</td><td className="num">{p.colisage}</td><td className="num">{p.priorite}</td><td className="num">{fmt(p.stockDisponible, 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
