import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DEMO } from '../src/database/seed-data';
import { demarrer } from './setup';

let app: INestApplication;
let ds: DataSource;
let http: Awaited<ReturnType<typeof demarrer>>['http'];
let token: Awaited<ReturnType<typeof demarrer>>['token'];

const auth = async (login: string) => ({ Authorization: `Bearer ${await token(login)}` });

beforeAll(async () => {
  ({ app, ds, http, token } = await demarrer());
});
afterAll(async () => {
  await app?.close();
});

describe('Authentification', () => {
  it('refuse un mauvais mot de passe et protège les routes', async () => {
    await http().post('/api/auth/login').send({ login: 'rp1', password: 'faux' }).expect(401);
    await http().get('/api/clients').expect(401);
    await http().get('/api/health').expect(200);
  });

  it('renvoie le profil et rafraîchit le jeton', async () => {
    const login = await http().post('/api/auth/login').send({ login: 'rp1', password: 'Medforce@2026' }).expect(201);
    expect(login.body.utilisateur).toMatchObject({ codeRp: 'RP001', role: 'RP' });
    const me = await http().get('/api/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    expect(me.body.passwordHash).toBeUndefined();
    const r = await http().post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(201);
    expect(r.body.accessToken).toBeTruthy();
  });

  it('applique les rôles', async () => {
    await http().post('/api/secteurs').set(await auth('rp1')).send({ niveau: 'GRANDE_REGION', code: 'X', designation: 'X' }).expect(403);
  });
});

describe('Sectorisation', () => {
  it('importe une arborescence et contrôle les niveaux', async () => {
    const h = await auth('coordinateur');
    const r = await http()
      .post('/api/secteurs/import')
      .set(h)
      .send({
        lignes: [
          { niveau: 'SECTEUR', code: 'N01', designation: 'Tanger', codeParent: 'N' },
          { niveau: 'GRANDE_REGION', code: 'N', designation: 'Nord' },
          { niveau: 'SOUS_SECTEUR', code: 'N0101', designation: 'Tanger Centre', codeParent: 'N01' },
        ],
      })
      .expect(201);
    expect(r.body).toEqual({ crees: 3, misAJour: 0 });
    await http().post('/api/secteurs').set(h).send({ niveau: 'SOUS_SECTEUR', code: 'Z', designation: 'Orphelin' }).expect(400);
    await http().post('/api/secteurs').set(h).send({ niveau: 'VILLE', code: 'Z', designation: 'Mauvais niveau', parentId: DEMO.sud }).expect(400);
  });
});

describe('Clients : périmètre et circuit de validation', () => {
  it('limite chaque RP à son périmètre (secteur / portefeuille)', async () => {
    const rp1 = await http().get('/api/clients').set(await auth('rp1')).expect(200);
    expect(rp1.body.items.map((c: any) => c.raisonSociale).sort()).toEqual(['Pharmacie Al Amal', 'Pharmacie Ennour']);
    const rp2 = await http().get('/api/clients').set(await auth('rp2')).expect(200);
    expect(rp2.body.items.map((c: any) => c.id)).toEqual([DEMO.cl4]);
    const rr = await http().get('/api/clients').set(await auth('rr.sud')).expect(200);
    expect(rr.body.total).toBe(3);
    const admin = await http().get('/api/clients?q=maârif').set(await auth('admin')).expect(200);
    expect(admin.body.items).toHaveLength(1);
    await http().get(`/api/clients/${DEMO.cl4}`).set(await auth('rp1')).expect(404);
  });

  it('création par un RP → pré-validation RR → validation back-office → code X3', async () => {
    const id = randomUUID();
    const c = await http()
      .post('/api/clients')
      .set(await auth('rp1'))
      .send({ id, raisonSociale: 'Pharmacie Nouvelle', sousSecteurId: DEMO.inezgane, gsm1: '0600000000', codeX3: 'INTERDIT' })
      .expect(201);
    expect(c.body).toMatchObject({ statut: 'CREE_NON_VALIDE', rpId: DEMO.rp1, codeX3: null });
    expect(c.body.code).toBeGreaterThan(0);

    const demandes = await http().get('/api/clients/demandes?statut=EN_ATTENTE').set(await auth('rr.sud')).expect(200);
    const d = demandes.body.find((x: any) => x.clientId === id);
    expect(d.type).toBe('CREATION');
    await http().post(`/api/clients/demandes/${d.id}/decision`).set(await auth('rp2')).send({ decision: 'VALIDER' }).expect(400);
    await http().post(`/api/clients/demandes/${d.id}/decision`).set(await auth('rr.sud')).send({ decision: 'PREVALIDER' }).expect(201);
    const v = await http().post(`/api/clients/demandes/${d.id}/decision`).set(await auth('coordinateur')).send({ decision: 'VALIDER' }).expect(201);
    expect(v.body.statut).toBe('VALIDEE');
    const apres = await http().get(`/api/clients/${id}`).set(await auth('rp1')).expect(200);
    expect(apres.body.statut).toBe('VALIDE_SANS_X3');

    const x3 = await http().post('/api/clients/import-x3').set(await auth('coordinateur')).send({ clients: [{ code: c.body.code, codeX3: 'X3NEW' }, { code: 999999, codeX3: 'IGNORE' }] }).expect(201);
    expect(x3.body).toEqual({ misAJour: 1, ignores: 1 });
    const actif = await http().get(`/api/clients/${id}`).set(await auth('rp1')).expect(200);
    expect(actif.body).toMatchObject({ statut: 'ACTIF', codeX3: 'X3NEW' });
  });

  it('demande de modification : champs non modifiables refusés, ancienne/nouvelle valeur conservées', async () => {
    await http().post(`/api/clients/${DEMO.cl1}/demande-modification`).set(await auth('rp1')).send({ raisonSociale: 'Hack' }).expect(400);
    const d = await http()
      .post(`/api/clients/${DEMO.cl1}/demande-modification`)
      .set(await auth('rp1'))
      .send({ gsm1: '0611223344', neSouhaitePasPartagerEmail: true })
      .expect(201);
    expect(d.body.changements.gsm1).toEqual({ ancien: null, nouveau: '0611223344' });
    await http().post(`/api/clients/demandes/${d.body.id}/decision`).set(await auth('coordinateur')).send({ decision: 'VALIDER' }).expect(201);
    const c = await http().get(`/api/clients/${DEMO.cl1}`).set(await auth('rp1')).expect(200);
    expect(c.body).toMatchObject({ gsm1: '0611223344', neSouhaitePasPartagerEmail: true });
  });

  it('affectation en masse avec historique', async () => {
    await http().post('/api/clients/affectation').set(await auth('coordinateur')).send({ clientIds: [DEMO.cl3], rpId: DEMO.rp1 }).expect(201);
    const h = await http().get(`/api/clients/${DEMO.cl3}/historique-affectations`).set(await auth('coordinateur')).expect(200);
    expect(h.body).toHaveLength(0); // déjà affecté à rp1 : pas de changement
    await http().post('/api/clients/affectation').set(await auth('coordinateur')).send({ clientIds: [DEMO.cl3], rpId: DEMO.rp2 }).expect(201);
    const h2 = await http().get(`/api/clients/${DEMO.cl3}/historique-affectations`).set(await auth('coordinateur')).expect(200);
    expect(h2.body[0]).toMatchObject({ ancienneValeur: DEMO.rp1, nouvelleValeur: DEMO.rp2 });
    // rp2 est en mode LES_DEUX : il voit désormais ce client via son portefeuille.
    await http().get(`/api/clients/${DEMO.cl3}`).set(await auth('rp2')).expect(200);
  });
});

describe('Commandes et conditions commerciales', () => {
  const saisieConforme = {
    clientId: DEMO.cl1,
    dateCommande: '2026-11-05',
    packs: [
      // 60 × 42 = 2520 + 20 × 35 = 700 → 3220 HT → palier 10 % + UG 5 % des quantités (4)
      { packId: DEMO.packPanache, lignes: [{ produitId: DEMO.p1, qte: 60 }, { produitId: DEMO.p2, qte: 20 }], ug: [{ produitId: DEMO.pUg, qte: 4 }] },
      { packId: DEMO.packReste, lignes: [{ produitId: DEMO.p4, qte: 10 }] },
    ],
  };

  it('simule : remises, UG, reste de gamme après remise, suggestions', async () => {
    const r = await http().post('/api/commandes/simulation').set(await auth('rp1')).send(saisieConforme).expect(201);
    expect(r.body.valide).toBe(true);
    const pan = r.body.packs.find((p: any) => p.packId === DEMO.packPanache);
    expect(pan.lignes.map((l: any) => l.tauxRemise)).toEqual([10, 10]);
    expect(pan.droitUG).toMatchObject({ type: 'PCT_QTE', quantite: 4 });
    const reste = r.body.packs.find((p: any) => p.packId === DEMO.packReste);
    expect(reste.seuil).toBe(2898); // 3220 − 10 %
    expect(reste.lignes[0].tauxRemise).toBe(4);
    expect(r.body.totalUG).toBe(4);
  });

  it('cycle de vie : brouillon → saisie → en cours → validée ; RP bloqué après prise en charge', async () => {
    const id = randomUUID();
    const c = await http().post('/api/commandes').set(await auth('rp1')).send({ ...saisieConforme, id }).expect(201);
    expect(c.body).toMatchObject({ statut: 'BROUILLON', valide: true, rpAffecteId: DEMO.rp1, dateLivraisonSouhaitee: '2026-11-06' });
    expect(c.body.numero).toMatch(/^CMD\d{8}$/);
    await http().post(`/api/commandes/${id}/statut`).set(await auth('rp1')).send({ statut: 'SAISIE' }).expect(201);
    await http().post(`/api/commandes/${id}/statut`).set(await auth('validateur')).send({ statut: 'EN_COURS' }).expect(201);
    await http().put(`/api/commandes/${id}`).set(await auth('rp1')).send(saisieConforme).expect(409);
    await http().post(`/api/commandes/${id}/statut`).set(await auth('rp1')).send({ statut: 'VALIDEE' }).expect(400);
    const v = await http().post(`/api/commandes/${id}/statut`).set(await auth('validateur')).send({ statut: 'VALIDEE' }).expect(201);
    expect(v.body.historiqueStatuts.map((h: any) => h.statut)).toEqual(['BROUILLON', 'SAISIE', 'EN_COURS', 'VALIDEE']);
    const detail = await http().get(`/api/commandes/${id}`).set(await auth('rp1')).expect(200);
    expect(detail.body.lignes.filter((l: any) => l.gratuit)).toHaveLength(1);
    await http().get(`/api/commandes/${id}`).set(await auth('rp2')).expect(404);
  });

  it('commande non conforme : confirmation refusée, dérogation accordée par le responsable', async () => {
    const id = randomUUID();
    const saisie = { clientId: DEMO.cl1, dateCommande: '2026-11-05', packs: [{ packId: DEMO.packPanache, lignes: [{ produitId: DEMO.p2, qte: 5 }] }] };
    const c = await http().post('/api/commandes').set(await auth('rp1')).send({ ...saisie, id }).expect(201);
    expect(c.body.valide).toBe(false);
    expect(c.body.anomalies.map((a: any) => a.code)).toEqual(expect.arrayContaining(['CORES_INSUFFISANTS', 'SEUIL_HORS_BORNES', 'MONTANT_MINIMUM']));
    await http().post(`/api/commandes/${id}/statut`).set(await auth('rp1')).send({ statut: 'SAISIE' }).expect(400);
    await http().post(`/api/commandes/${id}/statut`).set(await auth('rp1')).send({ statut: 'EN_ATTENTE_DEROGATION' }).expect(400);
    await http().post(`/api/commandes/${id}/statut`).set(await auth('rp1')).send({ statut: 'EN_ATTENTE_DEROGATION', motifDerogation: 'QTE' }).expect(201);
    await http().post(`/api/commandes/${id}/statut`).set(await auth('rp1')).send({ statut: 'SAISIE' }).expect(400);
    const ok = await http().post(`/api/commandes/${id}/statut`).set(await auth('rr.sud')).send({ statut: 'SAISIE' }).expect(201);
    expect(ok.body.derogationValideeParId).toBe(DEMO.rr);
  });

  it('alerte client insolvable (non bloquante) et UG au prorata non modifiables', async () => {
    const r = await http()
      .post('/api/commandes/simulation')
      .set(await auth('rp1'))
      .send({ clientId: DEMO.cl2, packs: [{ packId: DEMO.packProrata, lignes: [{ produitId: DEMO.p3, qte: 200 }, { produitId: DEMO.p4, qte: 50 }] }] })
      .expect(201);
    expect(r.body.anomalies.map((a: any) => a.code)).toContain('CLIENT_INSOLVABLE');
    expect(r.body.packs[0].droitUG.preRemplies).toEqual([
      { produitId: DEMO.p3, qte: 20 },
      { produitId: DEMO.p4, qte: 5 },
    ]);
    expect(r.body.valide).toBe(true);
  });
});

describe('Planification', () => {
  it('génère le plan de tournée depuis le cycle actif, refuse les chevauchements', async () => {
    const h = await auth('rr.sud');
    const p = await http().post('/api/planifications').set(h).send({ rpId: DEMO.rp1, semaineDebut: '2026-46', nombreSemaines: 3 }).expect(201);
    expect(p.body.semaines.map((s: any) => [s.semaine, s.semaineCycle])).toEqual([
      ['2026-46', 1],
      ['2026-47', 2],
      ['2026-48', 1],
    ]);
    await http().post('/api/planifications').set(h).send({ rpId: DEMO.rp1, semaineDebut: '2026-48', nombreSemaines: 2 }).expect(409);
    await http().post(`/api/planifications/${p.body.id}/valider`).set(h).expect(201);

    const v = await http()
      .post('/api/visites/planifier')
      .set(h)
      .send({ rpId: DEMO.rp1, semaine: '2026-46', visites: [{ clientId: DEMO.cl1, jour: 1, obligatoire: true }, { clientId: DEMO.cl3, jour: 2 }] })
      .expect(201);
    expect(v.body.map((x: any) => [x.datePrevue, x.horsPlan, x.obligatoire])).toEqual([
      ['2026-11-09', false, true],
      ['2026-11-10', true, false], // Dcheira n'est pas planifié en semaine 1 du cycle
    ]);
    const plans = await http().get(`/api/planifications?rpId=${DEMO.rp1}`).set(h).expect(200);
    expect(plans.body[0].modifieeApresValidation).toBe(true);
  });
});

describe('Synchronisation offline', () => {
  it('pull incrémental filtré par périmètre, avec curseur et pagination', async () => {
    const h = await auth('rp2');
    const page1 = await http().get('/api/sync/pull?cursor=0&limit=5').set(h).expect(200);
    expect(page1.body.hasMore).toBe(true);
    let cursor = page1.body.cursor;
    const clients = [...(page1.body.changes.clients ?? [])];
    let tables = Object.keys(page1.body.changes);
    for (let i = 0; i < 50; i++) {
      const p = await http().get(`/api/sync/pull?cursor=${cursor}&limit=5`).set(h).expect(200);
      clients.push(...(p.body.changes.clients ?? []));
      tables = [...new Set([...tables, ...Object.keys(p.body.changes)])];
      expect(BigInt(p.body.cursor) >= BigInt(cursor)).toBe(true);
      cursor = p.body.cursor;
      if (!p.body.hasMore) break;
    }
    expect(tables).toEqual(expect.arrayContaining(['secteurs', 'produits', 'packs', 'clients']));
    expect(clients.map((c) => c.id).sort()).toEqual([DEMO.cl3, DEMO.cl4].sort());
    const vide = await http().get(`/api/sync/pull?cursor=${cursor}`).set(h).expect(200);
    expect(vide.body.changes).toEqual({});
  });

  it('push : visite + commande confirmée hors ligne, rejeu idempotent, conflit si commande en traitement', async () => {
    const h = await auth('rp1');
    const visiteId = randomUUID();
    const commandeId = randomUUID();
    const ops = [
      {
        opId: randomUUID(),
        table: 'visites',
        action: 'UPSERT',
        id: visiteId,
        baseVersion: 0,
        clientTime: '2026-11-05T10:00:00Z',
        payload: { clientId: DEMO.cl1, debut: '2026-11-05T10:00:00Z', fin: '2026-11-05T10:20:00Z', statut: 'REALISEE', activites: { priseCommande: true } },
      },
      {
        opId: randomUUID(),
        table: 'commandes',
        action: 'UPSERT',
        id: commandeId,
        baseVersion: 0,
        clientTime: '2026-11-05T10:15:00Z',
        payload: {
          clientId: DEMO.cl1,
          dateCommande: '2026-11-05',
          numeroProvisoire: 'RP001-261105-0001',
          visiteId,
          statutCible: 'SAISIE',
          packs: [{ packId: DEMO.packPanache, lignes: [{ produitId: DEMO.p1, qte: 60 }] }],
        },
      },
      { opId: randomUUID(), table: 'clients', action: 'UPSERT', id: DEMO.cl1, baseVersion: 1, clientTime: '2026-11-05T10:16:00Z', payload: { raisonSociale: 'X' } },
    ];
    const r = await http().post('/api/sync/push').set(h).send({ deviceId: 'TAB-01', operations: ops }).expect(201);
    expect(r.body.results.map((x: any) => x.statut)).toEqual(['APPLIQUEE', 'APPLIQUEE', 'REJETEE']);
    expect(r.body.results[0].row).toMatchObject({ id: visiteId, horsPlan: true, semaine: '2026-45' });
    expect(r.body.results[1].row).toMatchObject({ statut: 'SAISIE', numeroProvisoire: 'RP001-261105-0001', totalNetHT: 2318.4 });

    const rejeu = await http().post('/api/sync/push').set(h).send({ deviceId: 'TAB-01', operations: ops.slice(0, 2) }).expect(201);
    expect(rejeu.body.results.map((x: any) => x.statut)).toEqual(['DEJA_APPLIQUEE', 'DEJA_APPLIQUEE']);

    await http().post(`/api/commandes/${commandeId}/statut`).set(await auth('validateur')).send({ statut: 'EN_COURS' }).expect(201);
    const conflit = await http()
      .post('/api/sync/push')
      .set(h)
      .send({ deviceId: 'TAB-01', operations: [{ ...ops[1], opId: randomUUID(), baseVersion: 2 }] })
      .expect(201);
    expect(conflit.body.results[0]).toMatchObject({ statut: 'CONFLIT', row: { statut: 'EN_COURS' } });

    // Les écritures serveur sont visibles au pull suivant de la tablette.
    const pull = await http().get('/api/sync/pull?cursor=0&limit=2000').set(h).expect(200);
    expect(pull.body.changes.commandes.find((c: any) => c.id === commandeId).statut).toBe('EN_COURS');
    expect(pull.body.changes.visites.map((v: any) => v.id)).toContain(visiteId);
  });

  it('attribue des syncSeq strictement croissants', async () => {
    const rows = await ds.query('SELECT "syncSeq" FROM client ORDER BY "syncSeq"');
    const seqs = rows.map((r: any) => BigInt(r.syncSeq));
    expect(new Set(seqs.map(String)).size).toBe(seqs.length);
  });
});
