import { describe, expect, it } from 'vitest';
import { SyncClient } from './client';
import { MemoryStore } from './store';

function fakeServer() {
  let seq = 0;
  const vus = new Set<string>();
  const rows: any[] = [];
  let online = true;
  const f = (async (url: string, init: any) => {
    if (!online) throw new TypeError('Network request failed');
    if (url.includes('/sync/push')) {
      const body = JSON.parse(init.body);
      const results = body.operations.map((op: any) => {
        if (vus.has(op.opId)) return { opId: op.opId, statut: 'DEJA_APPLIQUEE' };
        vus.add(op.opId);
        const row = { ...op.payload, id: op.id, version: 1, syncSeq: String(++seq) };
        rows.push({ table: op.table, row });
        return { opId: op.opId, statut: 'APPLIQUEE', row };
      });
      return new Response(JSON.stringify({ results }));
    }
    const cursor = new URL(url, 'http://x').searchParams.get('cursor')!;
    const changes: any = {};
    for (const r of rows.filter((x) => BigInt(x.row.syncSeq) > BigInt(cursor))) (changes[r.table] ??= []).push(r.row);
    return new Response(JSON.stringify({ cursor: String(seq), hasMore: false, changes, tombstones: {}, serverTime: '' }));
  }) as unknown as typeof fetch;
  return { f, setOnline: (v: boolean) => (online = v), rows };
}

describe('SyncClient', () => {
  it('conserve l’outbox hors ligne puis la rejoue à la reconnexion', async () => {
    const srv = fakeServer();
    const store = new MemoryStore();
    let n = 0;
    const c = new SyncClient({ baseUrl: '', deviceId: 'T1', store, getToken: () => 't', fetch: srv.f, uuid: () => `op-${++n}` });
    srv.setOnline(false);
    await c.enregistrer('visites', 'v1', { clientId: 'c1', statut: 'REALISEE' });
    expect((await store.get('visites', 'v1'))?._local).toBe(true);
    const r1 = await c.synchroniser();
    expect(r1).toMatchObject({ online: false, appliquees: 0 });
    expect(await c.enAttente()).toBe(1);

    srv.setOnline(true);
    const r2 = await c.synchroniser();
    expect(r2).toMatchObject({ online: true, appliquees: 1, pushed: 1 });
    expect(await c.enAttente()).toBe(0);
    expect((await store.get('visites', 'v1'))?._local).toBeUndefined();
    expect(await store.getMeta('sync.cursor')).toBe('1');
  });

  it('numérote les documents hors ligne', async () => {
    const c = new SyncClient({ baseUrl: '', deviceId: 'T1', store: new MemoryStore(), getToken: () => null, now: () => new Date('2026-11-05T09:00:00Z') });
    expect(await c.prochainNumero('RP001')).toBe('RP001-261105-0001');
    expect(await c.prochainNumero('RP001')).toBe('RP001-261105-0002');
  });

  it('calcule une commande avec les packs synchronisés', async () => {
    const store = new MemoryStore();
    await store.upsert('produits', [{ id: 'p1', version: 1, syncSeq: '1', pphHT: '10', tauxTva: '20' }]);
    await store.upsert('packs', [
      {
        id: 'k1', version: 1, syncSeq: '2', numero: 'K1', designation: 'K1', typeCondition: 'PANACHE', dateDebut: '2026-01-01', dateFin: '2026-12-31',
        actif: true, baseSeuil: 'QUANTITE', unitaire: false, produits: [{ produitId: 'p1' }], groupes: [], packsSeuil: [], produitsUG: [],
        conditions: [{ seuilMin: 10, typeRemise: 'RF', tauxRF: 5 }],
      },
    ]);
    const c = new SyncClient({ baseUrl: '', deviceId: 'T1', store, getToken: () => null });
    const r = await c.calculerCommande({ clientId: 'c', dateCommande: '2026-11-05', packs: [{ packId: 'k1', lignes: [{ produitId: 'p1', qte: 10 }] }] });
    expect(r.totalNetHT).toBe(95);
  });
});
