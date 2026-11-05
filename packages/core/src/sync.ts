/**
 * Protocole de synchronisation offline (dossier d'architecture §5).
 */

/** Tables exposées à la synchronisation mobile. */
export const TABLES_SYNC = [
  'secteurs',
  'clients',
  'produits',
  'gammes',
  'packs',
  'planifications',
  'visites',
  'commandes',
  'demandesModification',
] as const;
export type TableSync = (typeof TABLES_SYNC)[number];

/** Tables en écriture depuis le mobile. */
export const TABLES_PUSH = ['visites', 'commandes', 'clients', 'demandesModification'] as const;
export type TablePush = (typeof TABLES_PUSH)[number];

export interface SyncRow {
  id: string;
  version: number;
  syncSeq: string; // bigint sérialisé
  deletedAt?: string | null;
  [k: string]: unknown;
}

export interface PullResponse {
  cursor: string;
  hasMore: boolean;
  changes: Partial<Record<TableSync, SyncRow[]>>;
  /** Identifiants retirés du périmètre de l'utilisateur. */
  tombstones: Partial<Record<TableSync, string[]>>;
  serverTime: string;
}

export interface SyncOperation {
  opId: string;
  table: TablePush;
  action: 'UPSERT' | 'DELETE';
  id: string;
  /** Version connue par la tablette (0 pour une création). */
  baseVersion: number;
  payload?: Record<string, unknown>;
  clientTime: string;
}

export type SyncOpStatut = 'APPLIQUEE' | 'DEJA_APPLIQUEE' | 'REJETEE' | 'CONFLIT';

export interface SyncOpResult {
  opId: string;
  statut: SyncOpStatut;
  motif?: string;
  /** Version serveur après traitement (ou version courante en cas de conflit). */
  row?: SyncRow;
}

export interface PushRequest {
  deviceId: string;
  operations: SyncOperation[];
}

export interface PushResponse {
  results: SyncOpResult[];
}

/** Numéro provisoire de document hors ligne : <codeRP>-<AAMMJJ>-<seq>. */
export function numeroProvisoire(codeRp: string, date: string, seq: number): string {
  const d = date.slice(2, 10).replace(/-/g, '');
  return `${codeRp}-${d}-${String(seq).padStart(4, '0')}`;
}
