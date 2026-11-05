import { DataSource, EntityManager } from 'typeorm';
import { Client, Cycle, Gamme, PackEntity, Produit, Secteur, Utilisateur } from '../entities';
import { AuthService } from '../modules/auth/auth.module';
import { nextCounter } from './dialect';

/** Identifiants stables du jeu de démonstration (utilisés aussi par les tests e2e). */
export const DEMO = {
  admin: '00000000-0000-4000-8000-000000000001',
  coordinateur: '00000000-0000-4000-8000-000000000002',
  rr: '00000000-0000-4000-8000-000000000003',
  rp1: '00000000-0000-4000-8000-000000000011',
  rp2: '00000000-0000-4000-8000-000000000012',
  validateur: '00000000-0000-4000-8000-000000000004',
  sud: '00000000-0000-4000-8000-000000000101',
  agadir: '00000000-0000-4000-8000-000000000102',
  inezgane: '00000000-0000-4000-8000-000000000103',
  dcheira: '00000000-0000-4000-8000-000000000104',
  centre: '00000000-0000-4000-8000-000000000105',
  casa: '00000000-0000-4000-8000-000000000106',
  maarif: '00000000-0000-4000-8000-000000000107',
  gDermo: '00000000-0000-4000-8000-000000000201',
  gAntalgique: '00000000-0000-4000-8000-000000000202',
  p1: '00000000-0000-4000-8000-000000000301',
  p2: '00000000-0000-4000-8000-000000000302',
  p3: '00000000-0000-4000-8000-000000000303',
  p4: '00000000-0000-4000-8000-000000000304',
  pUg: '00000000-0000-4000-8000-000000000305',
  packPanache: '00000000-0000-4000-8000-000000000401',
  packReste: '00000000-0000-4000-8000-000000000402',
  packProrata: '00000000-0000-4000-8000-000000000403',
  cl1: '00000000-0000-4000-8000-000000000501',
  cl2: '00000000-0000-4000-8000-000000000502',
  cl3: '00000000-0000-4000-8000-000000000503',
  cl4: '00000000-0000-4000-8000-000000000504',
  cycle1: '00000000-0000-4000-8000-000000000601',
};

export const MOT_DE_PASSE_DEMO = 'Medforce@2026';

async function secteur(m: EntityManager, id: string, niveau: string, code: string, designation: string, parent?: Secteur) {
  return m.save(m.create(Secteur, { id, niveau, code, designation, parentId: parent?.id ?? null, chemin: `${parent?.chemin ?? '/'}${id}/` }));
}

export async function seed(ds: DataSource) {
  await ds.transaction(async (m) => {
    const hash = AuthService.hash(MOT_DE_PASSE_DEMO);
    const sud = await secteur(m, DEMO.sud, 'GRANDE_REGION', 'S', 'Sud');
    const agadir = await secteur(m, DEMO.agadir, 'SECTEUR', 'S01', 'Agadir', sud);
    const inezgane = await secteur(m, DEMO.inezgane, 'SOUS_SECTEUR', 'S0101', 'Inezgane', agadir);
    const dcheira = await secteur(m, DEMO.dcheira, 'SOUS_SECTEUR', 'S0102', 'Dcheira', agadir);
    const centre = await secteur(m, DEMO.centre, 'GRANDE_REGION', 'C', 'Centre');
    const casa = await secteur(m, DEMO.casa, 'SECTEUR', 'C01', 'Casablanca', centre);
    const maarif = await secteur(m, DEMO.maarif, 'SOUS_SECTEUR', 'C0101', 'Maârif', casa);

    const u = (id: string, codeRp: string, login: string, nom: string, prenom: string, role: string, extra: Partial<Utilisateur> = {}) =>
      m.save(m.create(Utilisateur, { id, codeRp, login, nom, prenom, role, passwordHash: hash, statut: 'ACTIF', ...extra }));
    await u(DEMO.admin, 'ADM001', 'admin', 'Administrateur', 'Système', 'ADMIN');
    await u(DEMO.coordinateur, 'COO001', 'coordinateur', 'Coordinateur', 'Promotion', 'COORDINATEUR', { estResponsable: true });
    await u(DEMO.validateur, 'VAL001', 'validateur', 'Validation', 'Commandes', 'VALIDATEUR_COMMANDES');
    await u(DEMO.rr, 'RR001', 'rr.sud', 'Responsable', 'Sud', 'RESPONSABLE_REGIONAL', { estResponsable: true, secteursIds: [sud.id] });
    await u(DEMO.rp1, 'RP001', 'rp1', 'Alaoui', 'Karim', 'RP', { responsableId: DEMO.rr, secteursIds: [inezgane.id], modeAccesClients: 'SECTEUR', dhKmUrbainResidence: 2.4, dhKmVilleAVille: 2.4 });
    await u(DEMO.rp2, 'RP002', 'rp2', 'Bennani', 'Sara', 'RP', { secteursIds: [maarif.id], modeAccesClients: 'LES_DEUX' });

    const gDermo = await m.save(m.create(Gamme, { id: DEMO.gDermo, code: '100', libelle: 'Dermatologie' }));
    const gAnt = await m.save(m.create(Gamme, { id: DEMO.gAntalgique, code: '200', libelle: 'Antalgiques' }));
    const prod = (id: string, code: string, designation: string, gammeId: string, pphHT: number, tauxTva: number, priorite = 0) =>
      m.save(m.create(Produit, { id, code, designation, gammeId, pphHT, pphTTC: Math.round(pphHT * (1 + tauxTva / 100) * 100) / 100, tauxTva, categorie: 'OTC', vendable: true, colisage: 10, priorite, stockDisponible: 1000 }));
    await prod(DEMO.p1, 'DER001', 'Crème hydratante 50 ml', gDermo.id, 42, 20, 2);
    await prod(DEMO.p2, 'DER002', 'Gel nettoyant 200 ml', gDermo.id, 35, 20, 1);
    await prod(DEMO.p3, 'ANT001', 'Paracétamol 1 g B/8', gAnt.id, 9.5, 7);
    await prod(DEMO.p4, 'ANT002', 'Ibuprofène 400 mg B/20', gAnt.id, 18, 7);
    await prod(DEMO.pUg, 'DER900', 'Trousse découverte dermo', gDermo.id, 25, 20);

    const pack = (p: Partial<PackEntity>) =>
      m.save(m.create(PackEntity, { dateDebut: '2026-01-01', dateFin: '2026-12-31', actif: true, unitaire: false, groupes: [], produitsUG: [], conditions: [], eligibilite: null, clientsExclus: [], ...p }));
    await pack({
      id: DEMO.packPanache,
      numero: 'PK-2026-001',
      designation: 'Panaché Dermatologie',
      typeCondition: 'PANACHE',
      baseSeuil: 'VALEUR_HT',
      nombreMinCores: 1,
      produits: [
        { produitId: DEMO.p1, groupe: 'DERMO', categorie: 'CORE', maxRemisePct: 12 },
        { produitId: DEMO.p2, groupe: 'DERMO', categorie: 'RESTE' },
      ],
      packsSeuil: [{ packId: DEMO.packPanache, base: 'AVANT_REMISE' }],
      conditions: [
        { seuilMin: 1000, seuilMax: 2999.99, typeRemise: 'RF', tauxRF: 8 },
        { seuilMin: 3000, typeRemise: 'RF_UG', tauxRF: 10, typeUG: 'PCT_QTE', tauxUG: 5 },
      ],
      produitsUG: [{ produitId: DEMO.pUg }],
    });
    await pack({
      id: DEMO.packReste,
      numero: 'PK-2026-002',
      designation: 'Reste de la gamme',
      typeCondition: 'RESTE_GAMME',
      baseSeuil: 'VALEUR_HT',
      produits: [{ produitId: DEMO.p3 }, { produitId: DEMO.p4 }],
      packsSeuil: [{ packId: DEMO.packPanache, base: 'APRES_REMISE' }],
      conditions: [
        { seuilMin: 0, seuilMax: 2499.99, typeRemise: 'RF', tauxRF: 2 },
        { seuilMin: 2500, typeRemise: 'RF', tauxRF: 4 },
      ],
    });
    await pack({
      id: DEMO.packProrata,
      numero: 'PK-2026-003',
      designation: 'Antalgiques UG au prorata',
      typeCondition: 'PAR_PRODUIT',
      baseSeuil: 'QUANTITE',
      produits: [{ produitId: DEMO.p3, qteMin: 20 }, { produitId: DEMO.p4 }],
      packsSeuil: [{ packId: DEMO.packProrata, base: 'AVANT_REMISE' }],
      conditions: [{ seuilMin: 20, typeRemise: 'UG', typeUG: 'PCT_QTE_PRORATA', tauxUG: 10 }],
    });

    const client = async (id: string, raisonSociale: string, s: Secteur, rpId: string | null, extra: Partial<Client> = {}) =>
      m.save(
        m.create(Client, {
          id,
          code: Number(await nextCounter(m, 'client_code')),
          raisonSociale,
          statut: 'ACTIF',
          codeX3: `X3${raisonSociale.slice(-3).toUpperCase()}`,
          sousSecteurId: s.id,
          secteurChemin: s.chemin,
          rpId,
          ciblage: 'A',
          solvabilite: 'SOLVABLE',
          operateurCreation: 'Sage X3',
          latitude: 30.3,
          longitude: -9.5,
          ...extra,
        }),
      );
    await client(DEMO.cl1, 'Pharmacie Al Amal', inezgane, DEMO.rp1, { pharmacienNom: 'Dr. Idrissi Nadia', ville: 'Inezgane' });
    await client(DEMO.cl2, 'Pharmacie Ennour', inezgane, DEMO.rp1, { ville: 'Inezgane', solvabilite: 'INSOLVABLE', ciblage: 'B' });
    await client(DEMO.cl3, 'Pharmacie Dcheira Centre', dcheira, DEMO.rp1, { ville: 'Dcheira' });
    await client(DEMO.cl4, 'Pharmacie du Maârif', maarif, DEMO.rp2, { ville: 'Casablanca' });

    await m.save(
      m.create(Cycle, {
        id: DEMO.cycle1,
        rpId: DEMO.rp1,
        libelle: 'Cycle Agadir 2 semaines',
        actif: true,
        semaines: [
          { numero: 1, noeuds: [inezgane.id], jours: { '1': [inezgane.id], '2': [inezgane.id], '3': [inezgane.id], '4': [inezgane.id], '5': [inezgane.id] } },
          { numero: 2, noeuds: [dcheira.id], jours: { '1': [dcheira.id], '2': [dcheira.id], '3': [dcheira.id], '4': [dcheira.id], '5': [dcheira.id] } },
        ],
      }),
    );
  });
}
