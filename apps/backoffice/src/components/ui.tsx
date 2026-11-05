import { ReactNode } from 'react';

export const LIBELLES_STATUT: Record<string, [string, string]> = {
  BROUILLON: ['Brouillon', ''],
  CONFIRMEE_RP: ['Confirmée RP', ''],
  EN_ATTENTE_DEROGATION: ['Dérogation demandée', 'warn'],
  SAISIE: ['Saisie', 'ok'],
  EN_COURS: ['En cours', 'warn'],
  VALIDEE: ['Validée', 'ok'],
  TRANSFEREE_X3: ['Transférée X3', 'ok'],
  LIVREE_PARTIEL: ['Livrée partiellement', ''],
  LIVREE: ['Livrée', 'ok'],
  FACTUREE: ['Facturée', 'ok'],
  ANNULEE: ['Annulée', 'ko'],
  PROSPECT: ['Prospect', ''],
  CREE_NON_VALIDE: ['Créé – non validé', 'warn'],
  VALIDE_SANS_X3: ['Validé – sans code X3', 'warn'],
  ACTIF: ['Actif', 'ok'],
  INACTIF: ['Inactif', 'ko'],
  ANNULE: ['Annulé', 'ko'],
  EN_ATTENTE: ['En attente', 'warn'],
  PRE_VALIDEE: ['Pré-validée', ''],
  REJETEE: ['Rejetée', 'ko'],
  PLANIFIEE: ['Planifiée', ''],
  REALISEE: ['Réalisée', 'ok'],
  NON_REALISEE: ['Non réalisée', 'ko'],
};

export function Statut({ v }: { v?: string | null }) {
  if (!v) return null;
  const [l, c] = LIBELLES_STATUT[v] ?? [v, ''];
  return <span className={`badge ${c}`}>{l}</span>;
}

export function Panel({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>
        <span>{title}</span>
        {actions}
      </h2>
      <div className="body">{children}</div>
    </section>
  );
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div>
      {rows.map(([k, v]) => (
        <div className="kv" key={k}>
          <div>{k} :</div>
          <div>{v ?? <span className="muted">—</span>}</div>
        </div>
      ))}
    </div>
  );
}

export function Erreur({ e }: { e: unknown }) {
  if (!e) return null;
  const err = e as any;
  const details = err?.body?.message?.details ?? err?.body?.details;
  return (
    <div className="alert">
      {err.message ?? String(e)}
      {Array.isArray(details) && (
        <ul>
          {details.filter((d: any) => d.bloquante !== false).map((d: any, i: number) => (
            <li key={i}>{d.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Chargement({ q }: { q: { isLoading: boolean; error: unknown } }) {
  if (q.isLoading) return <p className="muted">Chargement…</p>;
  if (q.error) return <Erreur e={q.error} />;
  return null;
}
