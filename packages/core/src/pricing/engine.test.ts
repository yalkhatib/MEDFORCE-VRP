import { describe, expect, it } from 'vitest';
import { calculerCommande, packsDisponibles, suggererPaliers } from './engine';
import { CommandeSaisie, ContexteCalcul, Pack, ProduitTarif } from './types';

const produits: ProduitTarif[] = [
  { id: 'P1', designation: 'Produit 1', prixHT: 10, tauxTva: 20 },
  { id: 'P2', designation: 'Produit 2', prixHT: 20, tauxTva: 20 },
  { id: 'P3', designation: 'Produit 3', prixHT: 50, tauxTva: 7 },
  { id: 'P4', designation: 'Produit 4', prixHT: 5, tauxTva: 0 },
  { id: 'UG1', designation: 'UG 1', prixHT: 8, tauxTva: 20 },
  { id: 'UG2', designation: 'UG 2', prixHT: 40, tauxTva: 20 },
];

function pack(p: Partial<Pack> & Pick<Pack, 'id'>): Pack {
  return {
    numero: p.id,
    designation: p.id,
    typeCondition: 'PANACHE',
    dateDebut: '2026-01-01',
    dateFin: '2026-12-31',
    actif: true,
    baseSeuil: 'VALEUR_HT',
    unitaire: false,
    produits: [],
    groupes: [],
    packsSeuil: [],
    conditions: [],
    produitsUG: [],
    ...p,
  };
}

function cmd(packs: CommandeSaisie['packs'], date = '2026-11-05'): CommandeSaisie {
  return { clientId: 'C1', dateCommande: date, packs };
}

function ctx(packs: Pack[], extra: Partial<ContexteCalcul> = {}): ContexteCalcul {
  return { packs, produits, ...extra };
}

const codes = (r: { anomalies: { code: string }[] }) => r.anomalies.map((a) => a.code);

describe('Validité des packs', () => {
  const p = pack({ id: 'A', produits: [{ produitId: 'P1' }], conditions: [{ seuilMin: 0, typeRemise: 'RF', tauxRF: 5 }] });

  it('bloque un pack désactivé ou hors validité', () => {
    const r1 = calculerCommande(cmd([{ packId: 'A', lignes: [{ produitId: 'P1', qte: 1 }] }]), ctx([{ ...p, actif: false }]));
    expect(codes(r1)).toContain('PACK_INACTIF');
    expect(r1.valide).toBe(false);
    const r2 = calculerCommande(cmd([{ packId: 'A', lignes: [{ produitId: 'P1', qte: 1 }] }], '2027-01-02'), ctx([p]));
    expect(codes(r2)).toContain('PACK_HORS_VALIDITE');
  });

  it('bloque un client exclu et le nombre max d’applications', () => {
    const r = calculerCommande(
      cmd([{ packId: 'A', lignes: [{ produitId: 'P1', qte: 1 }] }]),
      ctx([{ ...p, clientsExclus: ['C1'], maxApplicationsParClient: 2 }], { applicationsConsommees: { A: 2 } }),
    );
    expect(codes(r)).toEqual(expect.arrayContaining(['PACK_CLIENT_EXCLU', 'PACK_MAX_APPLICATIONS']));
  });

  it('packsDisponibles filtre les packs utilisables', () => {
    expect(packsDisponibles([p, { ...p, id: 'B', actif: false }], 'C1', '2026-06-01').map((x) => x.id)).toEqual(['A']);
  });

  it('refuse un produit hors pack et une quantité non entière', () => {
    const r = calculerCommande(
      cmd([{ packId: 'A', lignes: [{ produitId: 'P2', qte: 1 }, { produitId: 'P1', qte: 1.5 }] }]),
      ctx([p]),
    );
    expect(codes(r)).toEqual(expect.arrayContaining(['PRODUIT_HORS_PACK', 'QTE_INVALIDE']));
  });
});

describe('Paliers et remise financière', () => {
  const p = pack({
    id: 'PAN',
    produits: [{ produitId: 'P1' }, { produitId: 'P2', maxRemisePct: 8 }],
    conditions: [
      { seuilMin: 100, seuilMax: 499.99, typeRemise: 'RF', tauxRF: 5 },
      { seuilMin: 500, typeRemise: 'RF', tauxRF: 10 },
    ],
  });

  it('applique le palier atteint et plafonne la remise par produit', () => {
    // P1: 20 x 10 = 200 ; P2: 20 x 20 = 400 → seuil 600 → 10 % (P2 plafonné à 8 %)
    const r = calculerCommande(cmd([{ packId: 'PAN', lignes: [{ produitId: 'P1', qte: 20 }, { produitId: 'P2', qte: 20 }] }]), ctx([p]));
    expect(r.valide).toBe(true);
    const [l1, l2] = r.packs[0].lignes;
    expect(l1.tauxRemise).toBe(10);
    expect(l1.montantNetHT).toBe(180);
    expect(l2.tauxRemise).toBe(8);
    expect(l2.montantNetHT).toBe(368);
    expect(r.totalNetHT).toBe(548);
    expect(r.totalNetTTC).toBe(657.6);
    expect(r.totalTVA).toBe(109.6);
    expect(r.tauxRemiseGlobal).toBe(8.67);
  });

  it('bloque la commande si le seuil total est hors bornes', () => {
    const r = calculerCommande(cmd([{ packId: 'PAN', lignes: [{ produitId: 'P1', qte: 5 }] }]), ctx([p]));
    expect(codes(r)).toContain('SEUIL_HORS_BORNES');
    expect(r.valide).toBe(false);
  });

  it('suggère le palier suivant (proposition C1)', () => {
    const s = suggererPaliers(cmd([{ packId: 'PAN', lignes: [{ produitId: 'P1', qte: 20 }] }]), ctx([p]));
    expect(s).toEqual([expect.objectContaining({ packId: 'PAN', seuilActuel: 200, prochainSeuil: 500, ecart: 300 })]);
  });

  it('respecte minQteParticipeSeuil', () => {
    const p2 = pack({
      ...p,
      id: 'PAN2',
      produits: [{ produitId: 'P1', minQteParticipeSeuil: 30 }, { produitId: 'P2' }],
    });
    // P1 (20) ne participe pas au seuil : seuil = 400 → 5 %
    const r = calculerCommande(cmd([{ packId: 'PAN2', lignes: [{ produitId: 'P1', qte: 20 }, { produitId: 'P2', qte: 20 }] }]), ctx([p2]));
    expect(r.packs[0].seuil).toBe(400);
    expect(r.packs[0].lignes[0].tauxRemise).toBe(5);
  });

  it('pack unitaire : conditions appliquées produit par produit en quantité', () => {
    const pu = pack({
      id: 'U',
      unitaire: true,
      baseSeuil: 'QUANTITE',
      produits: [{ produitId: 'P1' }, { produitId: 'P2' }],
      conditions: [
        { seuilMin: 10, seuilMax: 49, typeRemise: 'RF', tauxRF: 3 },
        { seuilMin: 50, typeRemise: 'RF', tauxRF: 6 },
      ],
    });
    const r = calculerCommande(cmd([{ packId: 'U', lignes: [{ produitId: 'P1', qte: 60 }, { produitId: 'P2', qte: 12 }] }]), ctx([pu]));
    expect(r.packs[0].lignes.map((l) => l.tauxRemise)).toEqual([6, 3]);
  });
});

describe('Contraintes produits, groupes, Core et Obligatoire', () => {
  const p = pack({
    id: 'MIX',
    baseSeuil: 'QUANTITE',
    nombreMinCores: 2,
    produits: [
      { produitId: 'P1', groupe: 'G1', categorie: 'CORE', qteMin: 5, qteMax: 50 },
      { produitId: 'P2', groupe: 'G2', categorie: 'CORE' },
      { produitId: 'P3', groupe: 'G3', categorie: 'OBLIGATOIRE' },
      { produitId: 'P4', groupe: 'G4', categorie: 'RESTE', qteMin: 10, qteMax: 10 },
    ],
    groupes: [{ groupe: 'G2', qteMin: 10, qteMax: 20 }],
    conditions: [{ seuilMin: 1, typeRemise: 'RF', tauxRF: 2 }],
  });

  it('commande conforme', () => {
    const r = calculerCommande(
      cmd([
        {
          packId: 'MIX',
          lignes: [
            { produitId: 'P1', qte: 5 },
            { produitId: 'P2', qte: 10 },
            { produitId: 'P3', qte: 1 },
          ],
        },
      ]),
      ctx([p]),
    );
    expect(r.anomalies).toEqual([]);
    expect(r.valide).toBe(true);
  });

  it('détecte min/max produit, quantité exacte, groupe, cores et obligatoire', () => {
    const r = calculerCommande(
      cmd([
        {
          packId: 'MIX',
          lignes: [
            { produitId: 'P1', qte: 60 },
            { produitId: 'P4', qte: 3 },
          ],
        },
      ]),
      ctx([p]),
    );
    expect(codes(r)).toEqual(expect.arrayContaining(['QTE_MAX', 'QTE_MIN', 'CORES_INSUFFISANTS', 'OBLIGATOIRE_MANQUANT']));
    expect(r.valide).toBe(false);
  });

  it('contrôle les bornes du groupe', () => {
    const r = calculerCommande(
      cmd([{ packId: 'MIX', lignes: [{ produitId: 'P1', qte: 5 }, { produitId: 'P2', qte: 25 }, { produitId: 'P3', qte: 1 }] }]),
      ctx([p]),
    );
    expect(codes(r)).toEqual(['GROUPE_QTE_MAX']);
  });

  it('conditions par catégorie : remise différente sur Core et Reste', () => {
    const pc = pack({
      id: 'CAT',
      baseSeuil: 'QUANTITE',
      produits: [
        { produitId: 'P1', categorie: 'CORE' },
        { produitId: 'P2', categorie: 'RESTE' },
      ],
      conditions: [
        { categorie: 'CORE', seuilMin: 10, typeRemise: 'RF', tauxRF: 12 },
        { categorie: 'RESTE', seuilMin: 1, typeRemise: 'RF', tauxRF: 4 },
      ],
    });
    const r = calculerCommande(cmd([{ packId: 'CAT', lignes: [{ produitId: 'P1', qte: 10 }, { produitId: 'P2', qte: 2 }] }]), ctx([pc]));
    expect(r.packs[0].lignes.map((l) => l.tauxRemise)).toEqual([12, 4]);
    expect(r.packs[0].seuilsParCategorie).toMatchObject({ CORE: 10, RESTE: 2 });
  });
});

describe('Unités gratuites', () => {
  const base = {
    produits: [{ produitId: 'P1' }, { produitId: 'P2', maxRemiseUgPct: 5 }],
    baseSeuil: 'QUANTITE' as const,
  };

  it('% Qté : droit en nombre d’UG à choisir parmi les produits UG', () => {
    const p = pack({
      id: 'UGQ',
      ...base,
      conditions: [{ seuilMin: 50, typeRemise: 'UG', typeUG: 'PCT_QTE', tauxUG: 10 }],
      produitsUG: [{ produitId: 'UG1' }, { produitId: 'UG2', minTauxRemise: 20 }],
    });
    const ok = calculerCommande(
      cmd([{ packId: 'UGQ', lignes: [{ produitId: 'P1', qte: 60 }], ug: [{ produitId: 'UG1', qte: 6 }] }]),
      ctx([p]),
    );
    expect(ok.packs[0].droitUG).toMatchObject({ type: 'PCT_QTE', quantite: 6, produitsProposables: ['UG1'] });
    expect(ok.valide).toBe(true);
    expect(ok.totalUG).toBe(6);
    expect(ok.packs[0].lignesUG[0]).toMatchObject({ gratuit: true, montantNetHT: 0, tauxRemise: 100 });
    expect(ok.totalNetHT).toBe(600); // UG valorisées à zéro

    const ko = calculerCommande(
      cmd([{ packId: 'UGQ', lignes: [{ produitId: 'P1', qte: 60 }], ug: [{ produitId: 'UG1', qte: 7 }, { produitId: 'UG2', qte: 1 }] }]),
      ctx([p]),
    );
    expect(codes(ko)).toEqual(expect.arrayContaining(['UG_DEPASSEMENT', 'UG_NON_AUTORISEE']));
  });

  it('% Valeur : droit en valeur', () => {
    const p = pack({
      id: 'UGV',
      ...base,
      baseSeuil: 'VALEUR_HT',
      conditions: [{ seuilMin: 100, typeRemise: 'RF_UG', tauxRF: 2, typeUG: 'PCT_VALEUR', tauxUG: 10 }],
      produitsUG: [{ produitId: 'UG2' }],
    });
    // 30 x 10 = 300 HT → droit 30 HT ; 1 x UG2 = 40 > 30 → dépassement
    const r = calculerCommande(cmd([{ packId: 'UGV', lignes: [{ produitId: 'P1', qte: 30 }], ug: [{ produitId: 'UG2', qte: 1 }] }]), ctx([p]));
    expect(r.packs[0].droitUG?.valeur).toBe(30);
    expect(r.packs[0].remiseRetenue).toBe('RF_UG');
    expect(codes(r)).toContain('UG_DEPASSEMENT');
  });

  it('Prorata : UG pré-remplies par produit, plafonnées et non modifiables', () => {
    const p = pack({ id: 'PRO', ...base, conditions: [{ seuilMin: 1, typeRemise: 'UG', typeUG: 'PCT_QTE_PRORATA', tauxUG: 10 }] });
    const r = calculerCommande(cmd([{ packId: 'PRO', lignes: [{ produitId: 'P1', qte: 50 }, { produitId: 'P2', qte: 40 }] }]), ctx([p]));
    expect(r.packs[0].droitUG?.preRemplies).toEqual([
      { produitId: 'P1', qte: 5 },
      { produitId: 'P2', qte: 2 }, // plafonné à 5 %
    ]);
    expect(r.totalUG).toBe(7);
    const ko = calculerCommande(
      cmd([{ packId: 'PRO', lignes: [{ produitId: 'P1', qte: 50 }], ug: [{ produitId: 'P1', qte: 9 }] }]),
      ctx([p]),
    );
    expect(codes(ko)).toContain('UG_PRORATA_NON_MODIFIABLE');
  });

  it('Valeur fixe, UG obligatoire et sans liste UG = même produit', () => {
    const p = pack({
      id: 'FIX',
      ...base,
      conditions: [{ seuilMin: 10, typeRemise: 'UG', typeUG: 'VALEUR_FIXE', qteUgFixe: 3 }],
      produitsUG: [{ produitId: 'UG1', obligatoire: true, qteMin: 1 }],
    });
    const r = calculerCommande(cmd([{ packId: 'FIX', lignes: [{ produitId: 'P1', qte: 10 }] }]), ctx([p]));
    expect(codes(r)).toEqual(['UG_OBLIGATOIRE_MANQUANTE']);

    const meme = pack({ id: 'MEME', ...base, conditions: [{ seuilMin: 10, typeRemise: 'UG', typeUG: 'VALEUR_FIXE', qteUgFixe: 2 }] });
    const r2 = calculerCommande(cmd([{ packId: 'MEME', lignes: [{ produitId: 'P1', qte: 10 }], ug: [{ produitId: 'P1', qte: 2 }] }]), ctx([meme]));
    expect(r2.valide).toBe(true);
  });

  it('RF ou UG au choix du client', () => {
    const p = pack({
      id: 'CHX',
      ...base,
      conditions: [{ seuilMin: 10, typeRemise: 'RF_OU_UG', tauxRF: 5, typeUG: 'PCT_QTE', tauxUG: 10 }],
      produitsUG: [{ produitId: 'UG1' }],
    });
    const rf = calculerCommande(cmd([{ packId: 'CHX', lignes: [{ produitId: 'P1', qte: 20 }] }]), ctx([p]));
    expect(rf.packs[0].remiseRetenue).toBe('RF');
    expect(rf.packs[0].droitUG).toBeNull();
    const ug = calculerCommande(
      cmd([{ packId: 'CHX', lignes: [{ produitId: 'P1', qte: 20 }], choixRemise: 'UG', ug: [{ produitId: 'UG1', qte: 2 }] }]),
      ctx([p]),
    );
    expect(ug.packs[0].remiseRetenue).toBe('UG');
    expect(ug.packs[0].lignes[0].tauxRemise).toBe(0);
    expect(ug.valide).toBe(true);
  });
});

describe('Packs liés : seuil multi-packs, reste de gamme, éligibilité, condition clé', () => {
  const panache = pack({
    id: 'PAN',
    produits: [{ produitId: 'P1' }],
    conditions: [{ seuilMin: 0, typeRemise: 'RF', tauxRF: 10 }],
  });

  it('reste de gamme : taux selon le seuil d’un autre pack (après remise)', () => {
    const reste = pack({
      id: 'RG',
      typeCondition: 'RESTE_GAMME',
      produits: [{ produitId: 'P2' }, { produitId: 'P3' }],
      packsSeuil: [{ packId: 'PAN', base: 'APRES_REMISE' }],
      conditions: [
        { seuilMin: 0, seuilMax: 999.99, typeRemise: 'RF', tauxRF: 2 },
        { seuilMin: 1000, typeRemise: 'RF', tauxRF: 4 },
      ],
    });
    // Le pack RG est saisi avant PAN : l'ordre de traitement doit quand même calculer PAN d'abord.
    const r = calculerCommande(
      cmd([
        { packId: 'RG', lignes: [{ produitId: 'P2', qte: 1 }] },
        { packId: 'PAN', lignes: [{ produitId: 'P1', qte: 120 }] }, // 1200 brut → 1080 net
      ]),
      ctx([panache, reste]),
    );
    const rg = r.packs.find((p) => p.packId === 'RG');
    expect(rg?.seuil).toBe(1080);
    expect(rg?.lignes[0].tauxRemise).toBe(4);
  });

  it('éligibilité : bloque si le pack prérequis n’atteint pas son minimum (ET/OU)', () => {
    const dep = pack({
      id: 'DEP',
      produits: [{ produitId: 'P2' }],
      conditions: [{ seuilMin: 0, typeRemise: 'RF', tauxRF: 15 }],
      eligibilite: {
        packs: [
          { packId: 'PAN', min: 0, groupe: 'G' },
          { packId: 'AUTRE', min: 0, groupe: 'G' },
        ],
        totauxGroupes: [{ groupe: 'G', totalMin: 500 }],
        operateur: 'ET',
        base: 'AVANT_REMISE',
        typeValeur: 'HT',
      },
    });
    const ko = calculerCommande(
      cmd([
        { packId: 'PAN', lignes: [{ produitId: 'P1', qte: 10 }] },
        { packId: 'DEP', lignes: [{ produitId: 'P2', qte: 1 }] },
      ]),
      ctx([panache, dep]),
    );
    expect(codes(ko)).toContain('ELIGIBILITE_NON_ATTEINTE');
    const ok = calculerCommande(
      cmd([
        { packId: 'PAN', lignes: [{ produitId: 'P1', qte: 50 }] },
        { packId: 'DEP', lignes: [{ produitId: 'P2', qte: 1 }] },
      ]),
      ctx([panache, dep]),
    );
    expect(ok.valide).toBe(true);
  });

  it('condition clé : cumul historique + commande, seule la plus prioritaire s’applique', () => {
    const cle = (id: string, priorite: number, taux: number) =>
      pack({
        id,
        typeCondition: 'CLE',
        priorite,
        produits: [{ produitId: 'P3' }],
        packsSeuil: [{ packId: id, base: 'AVANT_REMISE' }],
        conditions: [{ seuilMin: 10000, typeRemise: 'RF', tauxRF: taux }],
      });
    const r = calculerCommande(
      cmd([
        { packId: 'K1', lignes: [{ produitId: 'P3', qte: 10 }] },
        { packId: 'K2', lignes: [{ produitId: 'P3', qte: 10 }] },
      ]),
      ctx([cle('K1', 1, 3), cle('K2', 5, 2)], { cumulsHistoriques: { K1: 9600, K2: 9800 } }),
    );
    const k1 = r.packs.find((p) => p.packId === 'K1');
    const k2 = r.packs.find((p) => p.packId === 'K2');
    expect(k1?.seuil).toBe(10100);
    expect(k2?.remiseRetenue).toBe('RF');
    expect(k1?.remiseRetenue).toBe('AUCUNE');
    expect(r.valide).toBe(true);
  });
});

describe('Contrôles de commande', () => {
  it('montant minimum de commande (500 DH Casa / 2000 DH hors Casa)', () => {
    const p = pack({ id: 'A', produits: [{ produitId: 'P1' }], conditions: [] });
    const r = calculerCommande(cmd([{ packId: 'A', lignes: [{ produitId: 'P1', qte: 10 }] }]), ctx([p], { montantMinimumCommande: 500 }));
    expect(codes(r)).toEqual(['MONTANT_MINIMUM']);
  });

  it('fusionne les lignes en double et signale un pack inconnu', () => {
    const p = pack({ id: 'A', produits: [{ produitId: 'P1', qteMax: 15 }] });
    const r = calculerCommande(
      cmd([
        { packId: 'A', lignes: [{ produitId: 'P1', qte: 10 }, { produitId: 'P1', qte: 10 }] },
        { packId: 'X', lignes: [] },
      ]),
      ctx([p]),
    );
    expect(r.totalQuantite).toBe(20);
    expect(codes(r)).toEqual(expect.arrayContaining(['QTE_MAX', 'PACK_INCONNU']));
  });
});
