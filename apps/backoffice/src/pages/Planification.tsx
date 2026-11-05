import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { semaineIso, ajouterSemaines } from '@medforce/core';
import { useState } from 'react';
import { get, post } from '../api';
import { Erreur, Panel, Statut } from '../components/ui';
import { useRps, useSecteurs } from './Clients';

const JOURS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function Planification() {
  const rps = useRps();
  const secteurs = useSecteurs();
  const qc = useQueryClient();
  const [rpId, setRpId] = useState('');
  const [form, setForm] = useState({ semaineDebut: ajouterSemaines(semaineIso(new Date()), 1), nombreSemaines: 4, premiereSemaineCycle: 1 });
  const cycles = useQuery({ enabled: !!rpId, queryKey: ['cycles', rpId], queryFn: () => get<any[]>(`/cycles?rpId=${rpId}`) });
  const plans = useQuery({ enabled: !!rpId, queryKey: ['plans', rpId], queryFn: () => get<any[]>(`/planifications?rpId=${rpId}`) });
  const visites = useQuery({ enabled: !!rpId, queryKey: ['visites', rpId], queryFn: () => get<any[]>(`/visites?rpId=${rpId}`) });
  const refresh = () => ['cycles', 'plans', 'visites'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const creer = useMutation({ mutationFn: () => post('/planifications', { rpId, ...form }), onSuccess: refresh });
  const valider = useMutation({ mutationFn: (id: string) => post(`/planifications/${id}/valider`), onSuccess: refresh });
  const dupliquer = useMutation({ mutationFn: (id: string) => post(`/cycles/${id}/dupliquer`), onSuccess: refresh });
  const nom = (ids: string[]) => ids.map((i) => secteurs.data?.find((s) => s.id === i)?.designation ?? '?').join(', ');

  return (
    <>
      <h1>Planification des tournées</h1>
      <div className="toolbar">
        <select value={rpId} onChange={(e) => setRpId(e.target.value)} aria-label="Représentant">
          <option value="">Choisir un représentant…</option>
          {rps.data?.map((r) => <option key={r.id} value={r.id}>{r.codeRp} – {r.prenom} {r.nom}</option>)}
        </select>
      </div>
      {rpId && (
        <>
          <Panel title="Cycles">
            {cycles.data?.map((c) => (
              <div key={c.id} style={{ marginBottom: 12 }}>
                <div className="row">
                  <b>{c.libelle}</b> {c.actif ? <span className="badge ok">Actif</span> : <span className="badge">Inactif {c.dateDesactivation ? `depuis ${c.dateDesactivation}` : ''}</span>}
                  <button className="ghost" onClick={() => dupliquer.mutate(c.id)}>Dupliquer</button>
                </div>
                <table>
                  <thead><tr><th>Semaine</th><th>Nœuds</th>{JOURS.slice(1, 6).map((j) => <th key={j}>{j}</th>)}</tr></thead>
                  <tbody>{c.semaines.map((s: any) => <tr key={s.numero}><td>S{s.numero}</td><td>{nom(s.noeuds)}</td>{[1, 2, 3, 4, 5].map((j) => <td key={j}>{nom(s.jours[String(j)] ?? [])}</td>)}</tr>)}</tbody>
                </table>
              </div>
            ))}
          </Panel>
          <Panel title="Planifications">
            <div className="row" style={{ marginBottom: 12 }}>
              <label>Semaine de début <input value={form.semaineDebut} onChange={(e) => setForm({ ...form, semaineDebut: e.target.value })} size={8} /></label>
              <label>Nombre de semaines <input type="number" min={1} value={form.nombreSemaines} onChange={(e) => setForm({ ...form, nombreSemaines: Number(e.target.value) })} style={{ width: 70 }} /></label>
              <label>1re semaine du cycle <input type="number" min={1} value={form.premiereSemaineCycle} onChange={(e) => setForm({ ...form, premiereSemaineCycle: Number(e.target.value) })} style={{ width: 70 }} /></label>
              <button className="success" onClick={() => creer.mutate()}>Générer le plan de tournée</button>
            </div>
            <Erreur e={creer.error} />
            <table>
              <thead><tr><th>Période</th><th>Statut</th><th>Semaines</th><th></th></tr></thead>
              <tbody>
                {plans.data?.map((p) => (
                  <tr key={p.id}>
                    <td>{p.semaineDebut} ({p.nombreSemaines} sem.)</td>
                    <td><Statut v={p.statut} /> {p.modifieeApresValidation && <span className="badge warn" title="Modifiée après validation">modifiée</span>}</td>
                    <td>{p.semaines.map((s: any) => `${s.semaine} → S${s.semaineCycle} (${nom(s.noeuds)})`).join(' · ')}</td>
                    <td>{p.statut === 'BROUILLON' && <button onClick={() => valider.mutate(p.id)}>Valider</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Visites">
            <table>
              <thead><tr><th>Date</th><th>Semaine</th><th>Statut</th><th>Indicateurs</th></tr></thead>
              <tbody>
                {visites.data?.map((v) => (
                  <tr key={v.id}><td>{v.datePrevue}</td><td>{v.semaine}</td><td><Statut v={v.statut} /></td><td>{v.obligatoire && <span className="badge">Obligatoire</span>} {v.horsPlan && <span className="badge warn">Hors plan</span>} {v.horsZone && <span className="badge ko">Hors zone GPS</span>}</td></tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </>
  );
}
