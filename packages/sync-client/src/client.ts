import {
  calculerCommande,
  numeroProvisoire,
  type CommandeSaisie,
  type Pack,
  type PullResponse,
  type PushResponse,
  type ResultatCommande,
  type SyncOperation,
  type SyncRow,
  type TablePush,
} from '@medforce/core';
import type { LocalStore } from './store';

export interface SyncClientOptions {
  baseUrl: string;
  deviceId: string;
  store: LocalStore;
  getToken: () => Promise<string | null> | string | null;
  fetch?: typeof fetch;
  uuid?: () => string;
  now?: () => Date;
  pageSize?: number;
}

export interface SyncReport {
  online: boolean;
  pushed: number;
  appliquees: number;
  rejetees: number;
  conflits: number;
  pulled: number;
  cursor: string;
  erreur?: string;
}

const CURSOR = 'sync.cursor';
const SEQ_DOC = 'sync.seqDocument';

/**
 * Moteur de synchronisation offline-first de la tablette RP (dossier d'architecture §5).
 *  - Toute écriture est appliquée localement immédiatement puis mise dans l'outbox.
 *  - `synchroniser()` pousse l'outbox (idempotent via opId), puis tire les changements serveur.
 *  - Une coupure réseau n'altère rien : l'outbox est conservée et rejouée plus tard.
 */
export class SyncClient {
  private readonly f: typeof fetch;
  private readonly uuid: () => string;
  private readonly now: () => Date;
  private enCours: Promise<SyncReport> | null = null;

  constructor(private readonly o: SyncClientOptions) {
    this.f = o.fetch ?? fetch;
    this.uuid = o.uuid ?? (() => crypto.randomUUID());
    this.now = o.now ?? (() => new Date());
  }

  // ------------------------------------------------------------------ Écritures locales
  async enregistrer(table: TablePush, id: string, payload: Record<string, unknown>, action: 'UPSERT' | 'DELETE' = 'UPSERT'): Promise<SyncOperation> {
    const existant = await this.o.store.get(table, id);
    const op: SyncOperation = {
      opId: this.uuid(),
      table,
      action,
      id,
      baseVersion: existant?.version ?? 0,
      payload,
      clientTime: this.now().toISOString(),
    };
    // Application optimiste : la donnée est visible immédiatement sur la tablette.
    const local: SyncRow = {
      ...(existant ?? {}),
      ...payload,
      id,
      version: existant?.version ?? 0,
      syncSeq: existant?.syncSeq ?? '0',
      _local: true,
      ...(action === 'DELETE' ? { deletedAt: op.clientTime } : {}),
    };
    await this.o.store.upsert(table, [local]);
    await this.o.store.outboxAdd(op);
    return op;
  }

  /** Numéro provisoire de document hors ligne : <codeRP>-<AAMMJJ>-<seq>. */
  async prochainNumero(codeRp: string): Promise<string> {
    const seq = Number((await this.o.store.getMeta(SEQ_DOC)) ?? '0') + 1;
    await this.o.store.setMeta(SEQ_DOC, String(seq));
    return numeroProvisoire(codeRp, this.now().toISOString().slice(0, 10), seq);
  }

  /** Calcul de commande 100 % local (mêmes règles que le serveur). */
  async calculerCommande(saisie: CommandeSaisie, montantMinimumCommande?: number | null): Promise<ResultatCommande> {
    const packs = (await this.o.store.list('packs')) as unknown as Pack[];
    const produits = (await this.o.store.list('produits')).map((p: any) => ({ id: p.id, designation: p.designation, prixHT: Number(p.pphHT), tauxTva: Number(p.tauxTva) }));
    return calculerCommande(saisie, { packs, produits, montantMinimumCommande });
  }

  async enAttente(): Promise<number> {
    return (await this.o.store.outboxList()).length;
  }

  // ------------------------------------------------------------------ Synchronisation
  synchroniser(): Promise<SyncReport> {
    // Une seule synchronisation à la fois (déclenchements multiples : timer, retour réseau, bouton).
    this.enCours ??= this.executer().finally(() => (this.enCours = null));
    return this.enCours;
  }

  private async http<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.o.getToken();
    const r = await this.f(`${this.o.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
    return (await r.json()) as T;
  }

  private async executer(): Promise<SyncReport> {
    const rapport: SyncReport = { online: true, pushed: 0, appliquees: 0, rejetees: 0, conflits: 0, pulled: 0, cursor: (await this.o.store.getMeta(CURSOR)) ?? '0' };
    try {
      // 1. Push par lots (ordre de saisie conservé).
      let ops = await this.o.store.outboxList();
      while (ops.length) {
        const lot = ops.slice(0, 50);
        const res = await this.http<PushResponse>('POST', '/sync/push', { deviceId: this.o.deviceId, operations: lot });
        for (const r of res.results) {
          const op = lot.find((x) => x.opId === r.opId)!;
          if (r.row) await this.o.store.upsert(op.table, [r.row]);
          if (r.statut === 'APPLIQUEE' || r.statut === 'DEJA_APPLIQUEE') rapport.appliquees++;
          else {
            r.statut === 'CONFLIT' ? rapport.conflits++ : rapport.rejetees++;
            await this.o.store.rejetAdd({ ...r, table: op.table, at: this.now().toISOString() });
          }
        }
        await this.o.store.outboxRemove(res.results.map((r) => r.opId));
        rapport.pushed += lot.length;
        ops = await this.o.store.outboxList();
      }
      // 2. Pull incrémental jusqu'à épuisement.
      let cursor = rapport.cursor;
      for (;;) {
        const p = await this.http<PullResponse>('GET', `/sync/pull?cursor=${cursor}&limit=${this.o.pageSize ?? 500}`);
        for (const [table, rows] of Object.entries(p.changes)) {
          if (!rows?.length) continue;
          await this.o.store.upsert(table as any, rows);
          rapport.pulled += rows.length;
        }
        for (const [table, ids] of Object.entries(p.tombstones)) if (ids?.length) await this.o.store.remove(table as any, ids);
        cursor = p.cursor;
        await this.o.store.setMeta(CURSOR, cursor);
        if (!p.hasMore) break;
      }
      rapport.cursor = cursor;
    } catch (e) {
      rapport.online = false;
      rapport.erreur = (e as Error).message;
    }
    return rapport;
  }

  /** Réinitialisation complète (changement d'utilisateur, révocation de la tablette). */
  async reinitialiser() {
    await this.o.store.clear();
  }
}
