import type { SyncOperation, SyncOpResult, SyncRow, TableSync } from '@medforce/core';

/**
 * Stockage local de la tablette. Implémentations : mémoire (tests), SQLite (application Expo).
 * Toutes les méthodes sont asynchrones pour être compatibles avec expo-sqlite.
 */
export interface LocalStore {
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  upsert(table: TableSync, rows: SyncRow[]): Promise<void>;
  remove(table: TableSync, ids: string[]): Promise<void>;
  get(table: TableSync, id: string): Promise<SyncRow | null>;
  list(table: TableSync): Promise<SyncRow[]>;
  outboxAdd(op: SyncOperation): Promise<void>;
  outboxList(): Promise<SyncOperation[]>;
  outboxRemove(opIds: string[]): Promise<void>;
  /** Journal des opérations rejetées / en conflit, à présenter au RP. */
  rejetAdd(r: SyncOpResult & { table: string; at: string }): Promise<void>;
  rejetList(): Promise<(SyncOpResult & { table: string; at: string })[]>;
  clear(): Promise<void>;
}

export class MemoryStore implements LocalStore {
  private meta = new Map<string, string>();
  private tables = new Map<string, Map<string, SyncRow>>();
  private outbox: SyncOperation[] = [];
  private rejets: (SyncOpResult & { table: string; at: string })[] = [];

  private t(table: string) {
    if (!this.tables.has(table)) this.tables.set(table, new Map());
    return this.tables.get(table)!;
  }
  async getMeta(k: string) {
    return this.meta.get(k) ?? null;
  }
  async setMeta(k: string, v: string) {
    this.meta.set(k, v);
  }
  async upsert(table: TableSync, rows: SyncRow[]) {
    for (const r of rows) this.t(table).set(r.id, r);
  }
  async remove(table: TableSync, ids: string[]) {
    ids.forEach((id) => this.t(table).delete(id));
  }
  async get(table: TableSync, id: string) {
    return this.t(table).get(id) ?? null;
  }
  async list(table: TableSync) {
    return [...this.t(table).values()].filter((r) => !r.deletedAt);
  }
  async outboxAdd(op: SyncOperation) {
    this.outbox.push(op);
  }
  async outboxList() {
    return [...this.outbox];
  }
  async outboxRemove(ids: string[]) {
    this.outbox = this.outbox.filter((o) => !ids.includes(o.opId));
  }
  async rejetAdd(r: SyncOpResult & { table: string; at: string }) {
    this.rejets.push(r);
  }
  async rejetList() {
    return [...this.rejets];
  }
  async clear() {
    this.meta.clear();
    this.tables.clear();
    this.outbox = [];
    this.rejets = [];
  }
}
