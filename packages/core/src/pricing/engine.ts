import { round2, sum } from '../money';
import {
  Anomalie,
  CategorieProduitPack,
  CommandeSaisie,
  ConditionPalier,
  ContexteCalcul,
  DroitUG,
  LigneCalculee,
  Pack,
  PackSaisi,
  ProduitTarif,
  ResultatCommande,
  ResultatPack,
  TypeCondition,
  UgSaisie,
} from './types';

/**
 * Moteur de calcul des conditions commerciales MEDFORCE VRP.
 *
 * Fonction pure, sans I/O : exécutée à l'identique sur la tablette (mode offline),
 * dans le back-office (saisie téléphoniste) et par l'API (revalidation à la réception).
 */

/** Ordre de traitement : les packs « dépendants » (reste de gamme, UG globales, clé) après les autres. */
const ORDRE_TYPES: TypeCondition[] = ['PANACHE', 'PAR_PRODUIT', 'RESTE_GAMME', 'UG_GLOBALES', 'CLE'];

interface Agregat {
  qte: number;
  ht: number;
  ttc: number;
}

const AGREGAT_VIDE: Agregat = { qte: 0, ht: 0, ttc: 0 };

function anomalie(a: Omit<Anomalie, 'bloquante'> & { bloquante?: boolean }): Anomalie {
  return { bloquante: true, ...a };
}

function estDansPeriode(date: string, debut?: string | null, fin?: string | null): boolean {
  const d = date.slice(0, 10);
  if (debut && d < debut.slice(0, 10)) return false;
  if (fin && d > fin.slice(0, 10)) return false;
  return true;
}

function valeurSelonBase(a: Agregat, base: Pack['baseSeuil']): number {
  switch (base) {
    case 'QUANTITE':
      return a.qte;
    case 'VALEUR_HT':
      return a.ht;
    case 'VALEUR_TTC':
      return a.ttc;
  }
}

function addAgregat(a: Agregat, b: Agregat): Agregat {
  return { qte: a.qte + b.qte, ht: a.ht + b.ht, ttc: a.ttc + b.ttc };
}

function ligneBrute(produit: ProduitTarif, qte: number): LigneCalculee {
  const brut = round2(produit.prixHT * qte);
  return {
    produitId: produit.id,
    qte,
    prixUnitaireHT: produit.prixHT,
    tauxTva: produit.tauxTva,
    montantBrutHT: brut,
    tauxRemise: 0,
    prixRemiseHT: produit.prixHT,
    montantRemiseHT: 0,
    montantNetHT: brut,
    montantNetTTC: round2(brut * (1 + produit.tauxTva / 100)),
    gratuit: false,
  };
}

function appliquerTaux(l: LigneCalculee, taux: number): LigneCalculee {
  const t = Math.max(0, Math.min(100, taux));
  const remise = round2((l.montantBrutHT * t) / 100);
  const net = round2(l.montantBrutHT - remise);
  return {
    ...l,
    tauxRemise: t,
    prixRemiseHT: round2(l.prixUnitaireHT * (1 - t / 100)),
    montantRemiseHT: remise,
    montantNetHT: net,
    montantNetTTC: round2(net * (1 + l.tauxTva / 100)),
  };
}

function agregerLignes(lignes: LigneCalculee[], net: boolean): Agregat {
  return lignes.reduce<Agregat>(
    (acc, l) => ({
      qte: acc.qte + l.qte,
      ht: round2(acc.ht + (net ? l.montantNetHT : l.montantBrutHT)),
      ttc: round2(acc.ttc + (net ? l.montantNetTTC : round2(l.montantBrutHT * (1 + l.tauxTva / 100)))),
    }),
    AGREGAT_VIDE,
  );
}

/** Sélectionne le palier applicable (seuilMin le plus élevé atteint). */
export function choisirPalier(conditions: ConditionPalier[], seuil: number): ConditionPalier | null {
  const candidates = conditions
    .filter((c) => seuil >= c.seuilMin && (c.seuilMax == null || seuil <= c.seuilMax))
    .sort((a, b) => b.seuilMin - a.seuilMin);
  return candidates[0] ?? null;
}

function bornesHorsLimite(conditions: ConditionPalier[], seuil: number): boolean {
  if (conditions.length === 0) return false;
  const min = Math.min(...conditions.map((c) => c.seuilMin));
  const maxDefinis = conditions.every((c) => c.seuilMax != null);
  const max = maxDefinis ? Math.max(...conditions.map((c) => c.seuilMax as number)) : Infinity;
  return seuil < min || seuil > max;
}

interface EtatPack {
  pack: Pack;
  saisie: PackSaisi;
  lignes: LigneCalculee[];
  /** Lignes participant au seuil (minQteParticipeSeuil respecté). */
  lignesSeuil: LigneCalculee[];
  anomalies: Anomalie[];
  resultat?: ResultatPack;
}

function cleGroupe(pp: { groupe?: string | null; produitId: string }): string {
  return pp.groupe && pp.groupe.trim() !== '' ? pp.groupe : `#${pp.produitId}`;
}

/** Étape 1 : contrôles structurels (validité, produits, min/max, groupes, Core/Obligatoire). */
function preparerPack(
  saisie: PackSaisi,
  pack: Pack,
  commande: CommandeSaisie,
  ctx: ContexteCalcul,
  produits: Map<string, ProduitTarif>,
): EtatPack {
  const anomalies: Anomalie[] = [];
  const packId = pack.id;

  if (!pack.actif) anomalies.push(anomalie({ code: 'PACK_INACTIF', packId, message: `Le pack ${pack.numero} est désactivé.` }));
  if (!estDansPeriode(commande.dateCommande, pack.dateDebut, pack.dateFin))
    anomalies.push(
      anomalie({ code: 'PACK_HORS_VALIDITE', packId, message: `Le pack ${pack.numero} n'est pas valide à la date de commande.` }),
    );
  if (pack.clientsExclus?.includes(commande.clientId))
    anomalies.push(anomalie({ code: 'PACK_CLIENT_EXCLU', packId, message: `Le client est exclu du pack ${pack.numero}.` }));
  if (pack.maxApplicationsParClient != null && (ctx.applicationsConsommees?.[packId] ?? 0) >= pack.maxApplicationsParClient)
    anomalies.push(
      anomalie({
        code: 'PACK_MAX_APPLICATIONS',
        packId,
        message: `Nombre maximum d'applications du pack ${pack.numero} atteint pour ce client.`,
      }),
    );

  const parProduit = new Map(pack.produits.map((p) => [p.produitId, p]));
  const lignes: LigneCalculee[] = [];
  const lignesSeuil: LigneCalculee[] = [];

  // Fusion des lignes en double sur le même produit.
  const qtes = new Map<string, number>();
  for (const l of saisie.lignes) {
    if (!Number.isFinite(l.qte) || l.qte < 0 || !Number.isInteger(l.qte)) {
      anomalies.push(anomalie({ code: 'QTE_INVALIDE', packId, produitId: l.produitId, message: 'Quantité invalide.' }));
      continue;
    }
    if (l.qte === 0) continue;
    qtes.set(l.produitId, (qtes.get(l.produitId) ?? 0) + l.qte);
  }

  for (const [produitId, qte] of qtes) {
    const produit = produits.get(produitId);
    if (!produit) {
      anomalies.push(anomalie({ code: 'PRODUIT_INCONNU', packId, produitId, message: `Produit ${produitId} inconnu.` }));
      continue;
    }
    const pp = parProduit.get(produitId);
    if (!pp && pack.produits.length > 0) {
      anomalies.push(
        anomalie({
          code: 'PRODUIT_HORS_PACK',
          packId,
          produitId,
          message: `Le produit ${produit.designation ?? produitId} ne fait pas partie du pack ${pack.numero}.`,
        }),
      );
      continue;
    }
    if (pp?.qteMin != null && qte < pp.qteMin)
      anomalies.push(
        anomalie({ code: 'QTE_MIN', packId, produitId, message: `Quantité minimum ${pp.qteMin} non atteinte (${qte}).` }),
      );
    if (pp?.qteMax != null && qte > pp.qteMax)
      anomalies.push(anomalie({ code: 'QTE_MAX', packId, produitId, message: `Quantité maximum ${pp.qteMax} dépassée (${qte}).` }));

    const ligne = ligneBrute(produit, qte);
    lignes.push(ligne);
    if (pp?.minQteParticipeSeuil == null || qte >= pp.minQteParticipeSeuil) lignesSeuil.push(ligne);
  }

  // Contraintes de groupe : uniquement pour les groupes présents dans la commande.
  const valeurLigne = (l: LigneCalculee) =>
    pack.baseSeuil === 'VALEUR_TTC' ? round2(l.montantBrutHT * (1 + l.tauxTva / 100)) : l.montantBrutHT;
  for (const g of pack.groupes) {
    const lg = lignes.filter((l) => parProduit.get(l.produitId)?.groupe === g.groupe);
    if (lg.length === 0) continue;
    const q = sum(lg.map((l) => l.qte));
    const v = round2(sum(lg.map(valeurLigne)));
    const base = { packId, groupe: g.groupe };
    if (g.qteMin != null && q < g.qteMin)
      anomalies.push(anomalie({ ...base, code: 'GROUPE_QTE_MIN', message: `Groupe ${g.groupe} : quantité minimum ${g.qteMin} non atteinte.` }));
    if (g.qteMax != null && q > g.qteMax)
      anomalies.push(anomalie({ ...base, code: 'GROUPE_QTE_MAX', message: `Groupe ${g.groupe} : quantité maximum ${g.qteMax} dépassée.` }));
    if (g.valeurMin != null && v < g.valeurMin)
      anomalies.push(anomalie({ ...base, code: 'GROUPE_VALEUR_MIN', message: `Groupe ${g.groupe} : valeur minimum ${g.valeurMin} non atteinte.` }));
    if (g.valeurMax != null && v > g.valeurMax)
      anomalies.push(anomalie({ ...base, code: 'GROUPE_VALEUR_MAX', message: `Groupe ${g.groupe} : valeur maximum ${g.valeurMax} dépassée.` }));
  }

  const commandes = new Set(lignes.map((l) => l.produitId));
  // Core : nombre minimum de groupes Core distincts.
  const cores = pack.produits.filter((p) => p.categorie === 'CORE');
  if (cores.length > 0 && (pack.nombreMinCores ?? 0) > 0) {
    const groupesCores = new Set(cores.filter((p) => commandes.has(p.produitId)).map(cleGroupe));
    if (groupesCores.size < (pack.nombreMinCores ?? 0))
      anomalies.push(
        anomalie({
          code: 'CORES_INSUFFISANTS',
          packId,
          message: `Au moins ${pack.nombreMinCores} groupe(s) Core distinct(s) requis (${groupesCores.size} saisi(s)).`,
        }),
      );
  }
  // Obligatoire : au moins un article de chaque groupe contenant un produit obligatoire.
  const groupesObligatoires = new Set(pack.produits.filter((p) => p.categorie === 'OBLIGATOIRE').map(cleGroupe));
  for (const g of groupesObligatoires) {
    const present = pack.produits.some((p) => cleGroupe(p) === g && commandes.has(p.produitId));
    if (!present)
      anomalies.push(
        anomalie({
          code: 'OBLIGATOIRE_MANQUANT',
          packId,
          groupe: g.startsWith('#') ? undefined : g,
          produitId: g.startsWith('#') ? g.slice(1) : undefined,
          message: `Un article du groupe obligatoire ${g.startsWith('#') ? g.slice(1) : g} doit figurer dans la commande.`,
        }),
      );
  }

  return { pack, saisie, lignes, lignesSeuil, anomalies };
}

/** Agrégat d'un pack référencé dans « Packs pour calcul du seuil ». */
function agregatReference(etat: EtatPack | undefined, base: 'AVANT_REMISE' | 'APRES_REMISE'): Agregat {
  if (!etat) return AGREGAT_VIDE;
  if (base === 'APRES_REMISE' && etat.resultat) {
    const participants = new Set(etat.lignesSeuil.map((l) => l.produitId));
    return agregerLignes(
      etat.resultat.lignes.filter((l) => participants.has(l.produitId)),
      true,
    );
  }
  return agregerLignes(etat.lignesSeuil, false);
}

function calculerDroitUG(
  condition: ConditionPalier,
  etat: EtatPack,
  agregatPropre: Agregat,
): DroitUG | null {
  const { pack } = etat;
  const type = condition.typeUG ?? 'PCT_QTE';
  const taux = condition.tauxUG ?? 0;
  const proposablesDefinis = pack.produitsUG.filter((p) => p.minTauxRemise == null || taux >= p.minTauxRemise);
  // Sans liste de produits UG : offrir le même produit commandé.
  const produitsProposables =
    pack.produitsUG.length > 0 ? proposablesDefinis.map((p) => p.produitId) : etat.lignes.map((l) => l.produitId);

  switch (type) {
    case 'PCT_QTE':
      return { type, quantite: Math.floor((agregatPropre.qte * taux) / 100), produitsProposables };
    case 'PCT_VALEUR': {
      const base = pack.baseSeuil === 'VALEUR_TTC' ? agregatPropre.ttc : agregatPropre.ht;
      return { type, valeur: round2((base * taux) / 100), produitsProposables };
    }
    case 'VALEUR_FIXE':
      return { type, quantite: condition.qteUgFixe ?? 0, produitsProposables };
    case 'PCT_QTE_PRORATA': {
      const parProduit = new Map(pack.produits.map((p) => [p.produitId, p]));
      const preRemplies = etat.lignes
        .map((l) => {
          const max = parProduit.get(l.produitId)?.maxRemiseUgPct;
          const t = max != null ? Math.min(taux, max) : taux;
          return { produitId: l.produitId, qte: Math.floor((l.qte * t) / 100) };
        })
        .filter((u) => u.qte > 0);
      return {
        type,
        quantite: sum(preRemplies.map((u) => u.qte)),
        produitsProposables: preRemplies.map((u) => u.produitId),
        preRemplies,
      };
    }
  }
}

function validerUG(
  droit: DroitUG,
  saisieUG: UgSaisie[] | undefined,
  etat: EtatPack,
  produits: Map<string, ProduitTarif>,
): { lignes: LigneCalculee[]; anomalies: Anomalie[] } {
  const packId = etat.pack.id;
  const anomalies: Anomalie[] = [];
  let retenues: UgSaisie[];

  if (droit.type === 'PCT_QTE_PRORATA') {
    const attendu = droit.preRemplies ?? [];
    if (saisieUG && saisieUG.length > 0) {
      const norm = (u: UgSaisie[]) =>
        u
          .filter((x) => x.qte > 0)
          .map((x) => `${x.produitId}:${x.qte}`)
          .sort()
          .join('|');
      if (norm(saisieUG) !== norm(attendu))
        anomalies.push(
          anomalie({ code: 'UG_PRORATA_NON_MODIFIABLE', packId, message: 'Les UG au prorata sont pré-remplies et non modifiables.' }),
        );
    }
    retenues = attendu;
  } else {
    retenues = (saisieUG ?? []).filter((u) => u.qte > 0);
    const proposables = new Set(droit.produitsProposables);
    const defs = new Map(etat.pack.produitsUG.map((p) => [p.produitId, p]));
    for (const u of retenues) {
      if (!proposables.has(u.produitId))
        anomalies.push(
          anomalie({ code: 'UG_NON_AUTORISEE', packId, produitId: u.produitId, message: 'Produit non autorisé en UG pour ce palier.' }),
        );
      const d = defs.get(u.produitId);
      if (d?.qteMin != null && u.qte < d.qteMin)
        anomalies.push(anomalie({ code: 'UG_QTE_MIN', packId, produitId: u.produitId, message: `UG : minimum ${d.qteMin}.` }));
      if (d?.qteMax != null && u.qte > d.qteMax)
        anomalies.push(anomalie({ code: 'UG_QTE_MAX', packId, produitId: u.produitId, message: `UG : maximum ${d.qteMax}.` }));
    }
    const aDroit = (droit.quantite ?? 0) > 0 || (droit.valeur ?? 0) > 0;
    if (aDroit) {
      for (const d of etat.pack.produitsUG.filter((p) => p.obligatoire && proposables.has(p.produitId))) {
        if (!retenues.some((u) => u.produitId === d.produitId))
          anomalies.push(
            anomalie({
              code: 'UG_OBLIGATOIRE_MANQUANTE',
              packId,
              produitId: d.produitId,
              message: 'Une UG obligatoire doit être sélectionnée.',
            }),
          );
      }
    }
    if (droit.quantite != null) {
      const total = sum(retenues.map((u) => u.qte));
      if (total > droit.quantite)
        anomalies.push(
          anomalie({ code: 'UG_DEPASSEMENT', packId, message: `UG saisies (${total}) supérieures au droit (${droit.quantite}).` }),
        );
    }
    if (droit.valeur != null) {
      const valeur = round2(
        sum(
          retenues.map((u) => {
            const p = produits.get(u.produitId);
            if (!p) return 0;
            const ht = p.prixHT * u.qte;
            return etat.pack.baseSeuil === 'VALEUR_TTC' ? ht * (1 + p.tauxTva / 100) : ht;
          }),
        ),
      );
      if (valeur > droit.valeur + 0.005)
        anomalies.push(
          anomalie({ code: 'UG_DEPASSEMENT', packId, message: `Valeur des UG (${valeur}) supérieure au droit (${droit.valeur}).` }),
        );
    }
  }

  const lignes: LigneCalculee[] = [];
  for (const u of retenues) {
    const p = produits.get(u.produitId);
    if (!p) {
      anomalies.push(anomalie({ code: 'PRODUIT_INCONNU', packId, produitId: u.produitId, message: 'Produit UG inconnu.' }));
      continue;
    }
    lignes.push({ ...appliquerTaux(ligneBrute(p, u.qte), 100), gratuit: true });
  }
  return { lignes, anomalies };
}

/** Étape 2 : seuil, palier, remises et UG pour un pack. */
function calculerPack(
  etat: EtatPack,
  etats: Map<string, EtatPack>,
  ctx: ContexteCalcul,
  produits: Map<string, ProduitTarif>,
): ResultatPack {
  const { pack, saisie } = etat;
  const anomalies = [...etat.anomalies];
  const parProduit = new Map(pack.produits.map((p) => [p.produitId, p]));
  const categorieDe = (produitId: string): CategorieProduitPack | null => parProduit.get(produitId)?.categorie ?? null;

  const agregatPropre = agregerLignes(etat.lignesSeuil, false);

  // Seuil commande (total) à partir des « packs pour calcul du seuil ».
  const refs = pack.packsSeuil.length > 0 ? pack.packsSeuil : [{ packId: pack.id, base: 'AVANT_REMISE' as const }];
  let agregatSeuil = AGREGAT_VIDE;
  for (const r of refs) {
    agregatSeuil = addAgregat(agregatSeuil, r.packId === pack.id ? agregatPropre : agregatReference(etats.get(r.packId), r.base));
  }
  let seuil = valeurSelonBase(agregatSeuil, pack.baseSeuil);
  if (pack.typeCondition === 'CLE') seuil += ctx.cumulsHistoriques?.[pack.id] ?? 0;
  seuil = pack.baseSeuil === 'QUANTITE' ? seuil : round2(seuil);

  const conditionsTotal = pack.conditions.filter((c) => c.categorie == null);
  const categories = Array.from(
    new Set(pack.conditions.map((c) => c.categorie).filter((c): c is CategorieProduitPack => c != null)),
  );

  const seuilsParCategorie: ResultatPack['seuilsParCategorie'] = { TOTAL: seuil };
  const palierParCategorie = new Map<CategorieProduitPack, ConditionPalier | null>();
  for (const cat of categories) {
    const ag = agregerLignes(
      etat.lignesSeuil.filter((l) => categorieDe(l.produitId) === cat),
      false,
    );
    const s = valeurSelonBase(ag, pack.baseSeuil);
    seuilsParCategorie[cat] = s;
    palierParCategorie.set(
      cat,
      choisirPalier(
        pack.conditions.filter((c) => c.categorie === cat),
        s,
      ),
    );
  }

  const seuilBloquant = pack.typeCondition !== 'CLE' && pack.typeCondition !== 'RESTE_GAMME';
  if (!pack.unitaire && etat.lignes.length > 0 && bornesHorsLimite(conditionsTotal, seuil)) {
    anomalies.push(
      anomalie({
        code: 'SEUIL_HORS_BORNES',
        packId: pack.id,
        bloquante: seuilBloquant,
        message: `Seuil commande ${seuil} hors des bornes du pack ${pack.numero}.`,
      }),
    );
  }

  // Choix RF / UG pour les conditions RF_OU_UG.
  const choix = saisie.choixRemise ?? 'RF';
  const conditionsAppliquees: ConditionPalier[] = [];
  const conditionLigne = (l: LigneCalculee): ConditionPalier | null => {
    if (pack.unitaire) {
      const s = valeurSelonBase(agregerLignes([l], false), pack.baseSeuil);
      return choisirPalier(conditionsTotal, s);
    }
    const cat = categorieDe(l.produitId);
    if (cat && palierParCategorie.has(cat)) return palierParCategorie.get(cat) ?? null;
    return choisirPalier(conditionsTotal, seuil);
  };
  const rfActif = (c: ConditionPalier) =>
    c.typeRemise === 'RF' || c.typeRemise === 'RF_UG' || (c.typeRemise === 'RF_OU_UG' && choix === 'RF');
  const ugActif = (c: ConditionPalier) =>
    c.typeRemise === 'UG' || c.typeRemise === 'RF_UG' || (c.typeRemise === 'RF_OU_UG' && choix === 'UG');

  if (saisie.choixRemise && !pack.conditions.some((c) => c.typeRemise === 'RF_OU_UG'))
    anomalies.push(
      anomalie({
        code: 'CHOIX_REMISE_INVALIDE',
        packId: pack.id,
        bloquante: false,
        message: 'Le choix RF/UG ne s’applique pas à ce pack ; ignoré.',
      }),
    );

  const lignes = etat.lignes.map((l) => {
    const c = conditionLigne(l);
    if (!c) return l;
    if (!conditionsAppliquees.includes(c)) conditionsAppliquees.push(c);
    if (!rfActif(c)) return l;
    const max = parProduit.get(l.produitId)?.maxRemisePct;
    const taux = max != null ? Math.min(c.tauxRF ?? 0, max) : c.tauxRF ?? 0;
    return appliquerTaux(l, taux);
  });

  // UG : on prend la condition UG la plus favorable parmi celles appliquées (une seule par pack).
  let droitUG: DroitUG | null = null;
  let lignesUG: LigneCalculee[] = [];
  const conditionUG = conditionsAppliquees.filter(ugActif).sort((a, b) => (b.tauxUG ?? 0) - (a.tauxUG ?? 0))[0];
  if (conditionUG) {
    droitUG = calculerDroitUG(conditionUG, { ...etat, lignes }, agregatPropre);
    if (droitUG) {
      const r = validerUG(droitUG, saisie.ug, etat, produits);
      lignesUG = r.lignes;
      anomalies.push(...r.anomalies);
    }
  } else if (saisie.ug && saisie.ug.some((u) => u.qte > 0)) {
    anomalies.push(anomalie({ code: 'UG_NON_AUTORISEE', packId: pack.id, message: 'Aucune UG accordée par le palier atteint.' }));
  }

  const hasRF = conditionsAppliquees.some(rfActif);
  const hasUG = !!conditionUG;
  const totalBrutHT = round2(sum(lignes.map((l) => l.montantBrutHT)));
  const totalRemiseHT = round2(sum(lignes.map((l) => l.montantRemiseHT)));
  const totalNetHT = round2(sum(lignes.map((l) => l.montantNetHT)));
  const totalNetTTC = round2(sum(lignes.map((l) => l.montantNetTTC)));

  return {
    packId: pack.id,
    numero: pack.numero,
    typeCondition: pack.typeCondition,
    seuil,
    seuilsParCategorie,
    conditionsAppliquees,
    remiseRetenue: hasRF && hasUG ? 'RF_UG' : hasRF ? 'RF' : hasUG ? 'UG' : 'AUCUNE',
    lignes,
    lignesUG,
    droitUG,
    totalBrutHT,
    totalRemiseHT,
    totalNetHT,
    totalNetTTC,
    valeurUGHT: round2(sum(lignesUG.map((l) => l.montantBrutHT))),
    anomalies,
    valide: !anomalies.some((a) => a.bloquante),
  };
}

function verifierEligibilite(etat: EtatPack, etats: Map<string, EtatPack>): Anomalie[] {
  const elig = etat.pack.eligibilite;
  if (!elig || (elig.packs.length === 0 && elig.totauxGroupes.length === 0)) return [];

  const valeurPack = (packId: string): number => {
    const e = etats.get(packId);
    if (!e?.resultat) return 0;
    if (elig.base === 'APRES_REMISE') return elig.typeValeur === 'TTC' ? e.resultat.totalNetTTC : e.resultat.totalNetHT;
    return elig.typeValeur === 'TTC' ? round2(sum(e.lignes.map((l) => l.montantBrutHT * (1 + l.tauxTva / 100)))) : e.resultat.totalBrutHT;
  };

  const tests: boolean[] = [];
  // Packs avec un minimum propre (> 0).
  for (const p of elig.packs.filter((x) => x.min > 0)) tests.push(!!etats.get(p.packId)?.resultat?.valide && valeurPack(p.packId) >= p.min);
  // Totaux par groupe de packs éligibles.
  for (const g of elig.totauxGroupes) {
    const total = round2(sum(elig.packs.filter((p) => p.groupe === g.groupe).map((p) => valeurPack(p.packId))));
    tests.push(total >= g.totalMin);
  }
  // Packs sans groupe et min = 0 : doivent simplement être présents.
  for (const p of elig.packs.filter((x) => x.min === 0 && !x.groupe)) tests.push((etats.get(p.packId)?.lignes.length ?? 0) > 0);

  const ok = tests.length === 0 || (elig.operateur === 'ET' ? tests.every(Boolean) : tests.some(Boolean));
  return ok
    ? []
    : [
        anomalie({
          code: 'ELIGIBILITE_NON_ATTEINTE',
          packId: etat.pack.id,
          message: `Les packs requis pour rendre le pack ${etat.pack.numero} éligible ne sont pas atteints.`,
        }),
      ];
}

/**
 * Calcule une commande complète : remises, UG, totaux et anomalies bloquantes / informatives.
 */
export function calculerCommande(commande: CommandeSaisie, ctx: ContexteCalcul): ResultatCommande {
  const packs = new Map(ctx.packs.map((p) => [p.id, p]));
  const produits = new Map(ctx.produits.map((p) => [p.id, p]));
  const anomaliesGlobales: Anomalie[] = [];
  const etats = new Map<string, EtatPack>();

  for (const s of commande.packs) {
    const pack = packs.get(s.packId);
    if (!pack) {
      anomaliesGlobales.push(anomalie({ code: 'PACK_INCONNU', packId: s.packId, message: `Pack ${s.packId} inconnu.` }));
      continue;
    }
    const existant = etats.get(pack.id);
    const saisie: PackSaisi = existant
      ? { ...existant.saisie, lignes: [...existant.saisie.lignes, ...s.lignes], ug: [...(existant.saisie.ug ?? []), ...(s.ug ?? [])] }
      : s;
    etats.set(pack.id, preparerPack(saisie, pack, commande, ctx, produits));
  }

  const ordonnes = Array.from(etats.values()).sort(
    (a, b) => ORDRE_TYPES.indexOf(a.pack.typeCondition) - ORDRE_TYPES.indexOf(b.pack.typeCondition),
  );
  for (const e of ordonnes) e.resultat = calculerPack(e, etats, ctx, produits);

  // Conditions clé : seule la plus prioritaire s'applique parmi celles qui atteignent un palier.
  const cles = ordonnes
    .filter((e) => e.pack.typeCondition === 'CLE' && e.resultat && e.resultat.remiseRetenue !== 'AUCUNE')
    .sort((a, b) => (b.pack.priorite ?? 0) - (a.pack.priorite ?? 0));
  for (const e of cles.slice(1)) {
    const r = e.resultat as ResultatPack;
    e.resultat = {
      ...r,
      lignes: e.lignes,
      lignesUG: [],
      droitUG: null,
      remiseRetenue: 'AUCUNE',
      totalRemiseHT: 0,
      totalNetHT: r.totalBrutHT,
      totalNetTTC: round2(sum(e.lignes.map((l) => l.montantNetTTC))),
      valeurUGHT: 0,
      anomalies: [
        ...r.anomalies,
        anomalie({
          code: 'SEUIL_HORS_BORNES',
          packId: e.pack.id,
          bloquante: false,
          message: `Condition clé ${e.pack.numero} non appliquée : une condition clé plus prioritaire s'applique.`,
        }),
      ],
    };
  }

  // Éligibilité (dépend des totaux des autres packs).
  for (const e of ordonnes) {
    const r = e.resultat as ResultatPack;
    const elig = verifierEligibilite(e, etats);
    if (elig.length > 0) e.resultat = { ...r, anomalies: [...r.anomalies, ...elig], valide: false };
  }

  const resultats = ordonnes.map((e) => e.resultat as ResultatPack);
  const toutesLignes = resultats.flatMap((r) => r.lignes);
  const totalBrutHT = round2(sum(resultats.map((r) => r.totalBrutHT)));
  const totalRemiseHT = round2(sum(resultats.map((r) => r.totalRemiseHT)));
  const totalNetHT = round2(sum(resultats.map((r) => r.totalNetHT)));
  const totalNetTTC = round2(sum(resultats.map((r) => r.totalNetTTC)));

  if (ctx.montantMinimumCommande != null && toutesLignes.length > 0 && totalNetHT < ctx.montantMinimumCommande)
    anomaliesGlobales.push(
      anomalie({
        code: 'MONTANT_MINIMUM',
        message: `Montant minimum de commande non atteint (${totalNetHT} < ${ctx.montantMinimumCommande} HT).`,
      }),
    );

  const anomalies = [...anomaliesGlobales, ...resultats.flatMap((r) => r.anomalies)];
  return {
    packs: resultats,
    totalBrutHT,
    totalRemiseHT,
    totalNetHT,
    totalTVA: round2(totalNetTTC - totalNetHT),
    totalNetTTC,
    totalQuantite: sum(toutesLignes.map((l) => l.qte)),
    totalUG: sum(resultats.flatMap((r) => r.lignesUG.map((l) => l.qte))),
    tauxRemiseGlobal: totalBrutHT > 0 ? round2((totalRemiseHT / totalBrutHT) * 100) : 0,
    anomalies,
    valide: !anomalies.some((a) => a.bloquante),
  };
}

/**
 * Suggestion des packs applicables (proposition C1) : pour chaque pack valide à date et non exclu,
 * renvoie le palier suivant et l'écart pour l'atteindre.
 */
export function suggererPaliers(
  commande: CommandeSaisie,
  ctx: ContexteCalcul,
): { packId: string; numero: string; seuilActuel: number; prochainSeuil: number; ecart: number; condition: ConditionPalier }[] {
  const resultat = calculerCommande(commande, ctx);
  const out: ReturnType<typeof suggererPaliers> = [];
  for (const r of resultat.packs) {
    const pack = ctx.packs.find((p) => p.id === r.packId);
    if (!pack || pack.unitaire) continue;
    const prochain = pack.conditions
      .filter((c) => c.categorie == null && c.seuilMin > r.seuil)
      .sort((a, b) => a.seuilMin - b.seuilMin)[0];
    if (prochain)
      out.push({
        packId: pack.id,
        numero: pack.numero,
        seuilActuel: r.seuil,
        prochainSeuil: prochain.seuilMin,
        ecart: round2(prochain.seuilMin - r.seuil),
        condition: prochain,
      });
  }
  return out;
}

/** Packs utilisables à une date pour un client (filtrage de l'écran de saisie). */
export function packsDisponibles(packs: Pack[], clientId: string, date: string, applications: Record<string, number> = {}): Pack[] {
  return packs.filter(
    (p) =>
      p.actif &&
      estDansPeriode(date, p.dateDebut, p.dateFin) &&
      !p.clientsExclus?.includes(clientId) &&
      (p.maxApplicationsParClient == null || (applications[p.id] ?? 0) < p.maxApplicationsParClient),
  );
}
