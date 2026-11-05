import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { MemoryStore, SyncClient } from '@medforce/sync-client';
import { DEMO } from '../src/database/seed-data';
import { demarrer } from './setup';

/**
 * Scénario tablette de bout en bout : le moteur de synchronisation mobile (@medforce/sync-client)
 * parle à la vraie API, avec des coupures réseau simulées.
 */
let app: INestApplication;
let baseUrl: string;
let token: (login: string) => Promise<string>;

beforeAll(async () => {
  const ctx = await demarrer();
  app = ctx.app;
  token = ctx.token;
  await app.listen(0);
  baseUrl = `${await app.getUrl()}/api`.replace('[::1]', 'localhost');
});
afterAll(async () => app?.close());

function tablette(login: string) {
  let online = true;
  const store = new MemoryStore();
  const reseau = (async (url: any, init: any) => {
    if (!online) throw new TypeError('Network request failed');
    return fetch(url, init);
  }) as typeof fetch;
  const client = new SyncClient({ baseUrl, deviceId: `TAB-${login}`, store, fetch: reseau, getToken: () => token(login), pageSize: 50 });
  return { client, store, setOnline: (v: boolean) => (online = v) };
}

it('journée terrain hors ligne : synchronisation initiale, saisie déconnectée, rejeu, conflit', async () => {
  const t = tablette('rp1');

  // 1. Synchronisation initiale : référentiels + périmètre du RP.
  const init = await t.client.synchroniser();
  expect(init.online).toBe(true);
  expect((await t.store.list('clients')).map((c) => c.id).sort()).toEqual([DEMO.cl1, DEMO.cl2].sort()); // Dcheira hors périmètre (mode SECTEUR : Inezgane)
  expect((await t.store.list('packs')).length).toBe(3);

  // 2. Perte de réseau : le RP réalise une visite et passe une commande calculée localement.
  t.setOnline(false);
  const visiteId = randomUUID();
  await t.client.enregistrer('visites', visiteId, { clientId: DEMO.cl1, statut: 'REALISEE', debut: '2026-11-05T09:00:00Z', activites: { priseCommande: true } });
  const saisie = { clientId: DEMO.cl1, dateCommande: '2026-11-05', packs: [{ packId: DEMO.packPanache, lignes: [{ produitId: DEMO.p1, qte: 60 }] }] };
  const calcul = await t.client.calculerCommande(saisie, 2000);
  expect(calcul).toMatchObject({ valide: true, totalNetHT: 2318.4 });
  const commandeId = randomUUID();
  const numero = await t.client.prochainNumero('RP001');
  await t.client.enregistrer('commandes', commandeId, { ...saisie, numeroProvisoire: numero, visiteId, statutCible: 'SAISIE' });
  const horsLigne = await t.client.synchroniser();
  expect(horsLigne.online).toBe(false);
  expect(await t.client.enAttente()).toBe(2);

  // 3. Retour du réseau : rejeu de l'outbox, numéro définitif attribué par le serveur.
  t.setOnline(true);
  const retour = await t.client.synchroniser();
  expect(retour).toMatchObject({ online: true, appliquees: 2, rejetees: 0, conflits: 0 });
  const cmd = await t.store.get('commandes', commandeId);
  expect(cmd).toMatchObject({ statut: 'SAISIE', numeroProvisoire: numero, totalNetHT: 2318.4 });
  expect(String(cmd?.numero)).toMatch(/^CMD/);

  // 4. Le back-office prend la commande en charge pendant que la tablette est de nouveau hors ligne.
  await fetch(`${baseUrl}/commandes/${commandeId}/statut`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token('validateur')}` },
    body: JSON.stringify({ statut: 'EN_COURS' }),
  }).then((r) => expect(r.status).toBe(201));
  t.setOnline(false);
  await t.client.enregistrer('commandes', commandeId, { ...saisie, packs: [{ packId: DEMO.packPanache, lignes: [{ produitId: DEMO.p1, qte: 80 }] }] });
  t.setOnline(true);
  const conflit = await t.client.synchroniser();
  expect(conflit.conflits).toBe(1);
  expect(await t.store.get('commandes', commandeId)).toMatchObject({ statut: 'EN_COURS', totalNetHT: 2318.4 });
  expect((await t.store.rejetList())[0]).toMatchObject({ statut: 'CONFLIT', table: 'commandes' });

  // 5. Un autre RP ne reçoit jamais ces données.
  const autre = tablette('rp2');
  await autre.client.synchroniser();
  expect(await autre.store.get('commandes', commandeId)).toBeNull();
  expect(await autre.store.get('clients', DEMO.cl1)).toBeNull();
});
