import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NIVEAUX_SECTORISATION, niveauEnfant } from '@medforce/core';
import { useState } from 'react';
import { post } from '../api';
import { Chargement, Erreur, Panel } from '../components/ui';
import { useSecteurs } from './Clients';

const LIB: Record<string, string> = { GRANDE_REGION: 'Grande région', SECTEUR: 'Secteur', SOUS_SECTEUR: 'Sous-secteur', VILLE: 'Ville', SOUS_VILLE: 'Sous-ville' };

export function Sectorisation() {
  const s = useSecteurs();
  const qc = useQueryClient();
  const [form, setForm] = useState<{ parentId: string | null; niveau: string; code: string; designation: string } | null>(null);
  const [csv, setCsv] = useState('');
  const creer = useMutation({ mutationFn: (b: any) => post('/secteurs', b), onSuccess: () => (setForm(null), qc.invalidateQueries({ queryKey: ['secteurs'] })) });
  const importer = useMutation({
    mutationFn: () =>
      post('/secteurs/import', {
        lignes: csv
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            const [niveau, code, designation, codeParent] = l.split(/[;\t]/).map((x) => x.trim());
            return { niveau, code, designation, codeParent: codeParent || null };
          }),
      }),
    onSuccess: () => (setCsv(''), qc.invalidateQueries({ queryKey: ['secteurs'] })),
  });

  const enfants = (parentId: string | null) => (s.data ?? []).filter((x) => (x.parentId ?? null) === parentId);
  const Noeud = ({ n }: { n: any }) => (
    <li>
      <span className="badge">{LIB[n.niveau]}</span> <b>{n.code}</b> {n.designation}{' '}
      {niveauEnfant(n.niveau) && (
        <button className="ghost" style={{ padding: '2px 8px' }} onClick={() => setForm({ parentId: n.id, niveau: niveauEnfant(n.niveau)!, code: '', designation: '' })}>
          + {LIB[niveauEnfant(n.niveau)!]}
        </button>
      )}
      {enfants(n.id).length > 0 && <ul>{enfants(n.id).map((c) => <Noeud key={c.id} n={c} />)}</ul>}
    </li>
  );

  return (
    <>
      <h1>Sectorisation</h1>
      <p className="muted">Niveaux : {NIVEAUX_SECTORISATION.map((n) => LIB[n]).join(' › ')}</p>
      <div className="toolbar">
        <button className="success" onClick={() => setForm({ parentId: null, niveau: 'GRANDE_REGION', code: '', designation: '' })}>+ Grande région</button>
      </div>
      {form && (
        <Panel title={`Nouveau nœud : ${LIB[form.niveau]}`}>
          <div className="row">
            <input placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <input placeholder="Désignation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            <button className="success" onClick={() => creer.mutate(form)}>Enregistrer</button>
            <button className="ghost" onClick={() => setForm(null)}>Annuler</button>
          </div>
          <Erreur e={creer.error} />
        </Panel>
      )}
      <Chargement q={s} />
      <Panel title="Arborescence">
        <ul className="tree" style={{ paddingLeft: 0 }}>{enfants(null).map((n) => <Noeud key={n.id} n={n} />)}</ul>
      </Panel>
      <Panel title="Import (copier-coller depuis Excel : niveau ; code ; désignation ; code parent)">
        <textarea rows={6} style={{ width: '100%', fontFamily: 'monospace' }} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'GRANDE_REGION;N;Nord;\nSECTEUR;N01;Tanger;N'} />
        <div className="row">
          <button onClick={() => importer.mutate()} disabled={!csv.trim()}>Importer</button>
          {importer.data && <span>{importer.data.crees} créé(s), {importer.data.misAJour} mis à jour</span>}
        </div>
        <Erreur e={importer.error} />
      </Panel>
    </>
  );
}
