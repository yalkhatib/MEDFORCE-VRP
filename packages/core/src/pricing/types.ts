/**
 * Modèle des conditions commerciales (packs) – CDC §13 et Gap Analysis
 * « Politique Commerciale & Moteur de Remises ».
 */

/** « Type de conditions » (ex « catégorie pack »). */
export type TypeCondition =
  | 'PANACHE' // Conditions panachées
  | 'PAR_PRODUIT' // Conditions par produits / gamme
  | 'RESTE_GAMME' // Conditions financières (reste de la gamme)
  | 'UG_GLOBALES' // Conditions UG globales
  | 'CLE'; // Conditions clé (cumul sur période)

/** Base de calcul du « seuil commande ». */
export type BaseSeuil = 'QUANTITE' | 'VALEUR_HT' | 'VALEUR_TTC';

export type CategorieProduitPack = 'CORE' | 'OBLIGATOIRE' | 'RESTE';

export type TypeRemise =
  | 'RF' // Remise financière
  | 'RF_UG' // Remise financière + UG
  | 'UG' // Unités gratuites seules
  | 'RF_OU_UG'; // Le client choisit entre RF et UG

export type TypeUG =
  | 'PCT_QTE' // % des quantités commandées → nombre d'UG à choisir dans les produits UG
  | 'PCT_VALEUR' // % de la valeur commandée → valeur des UG à choisir
  | 'VALEUR_FIXE' // Quantité fixe d'UG
  | 'PCT_QTE_PRORATA'; // % appliqué produit par produit, UG = mêmes produits (pré-rempli, non modifiable)

export interface PackProduit {
  produitId: string;
  qteMin?: number | null;
  qteMax?: number | null;
  /** Remise financière max autorisée pour ce produit (%). */
  maxRemisePct?: number | null;
  /** Taux UG max autorisé pour ce produit (%). */
  maxRemiseUgPct?: number | null;
  /** Quantité minimale pour que le produit participe au calcul du seuil. */
  minQteParticipeSeuil?: number | null;
  /** Regroupement libre (en général la gamme). */
  groupe?: string | null;
  categorie?: CategorieProduitPack | null;
}

export interface ContrainteGroupe {
  groupe: string;
  qteMin?: number | null;
  qteMax?: number | null;
  valeurMin?: number | null;
  valeurMax?: number | null;
}

export interface PackSeuil {
  packId: string;
  base: 'AVANT_REMISE' | 'APRES_REMISE';
}

export interface ConditionPalier {
  /** null / undefined = condition portant sur le total du pack. */
  categorie?: CategorieProduitPack | null;
  seuilMin: number;
  seuilMax?: number | null;
  typeRemise: TypeRemise;
  tauxRF?: number | null;
  typeUG?: TypeUG | null;
  tauxUG?: number | null;
  qteUgFixe?: number | null;
}

export interface ProduitUG {
  produitId: string;
  qteMin?: number | null;
  qteMax?: number | null;
  /** Le produit n'est proposable en UG que si le taux UG appliqué ≥ ce taux. */
  minTauxRemise?: number | null;
  obligatoire?: boolean;
}

export interface EligibilitePack {
  packId: string;
  /** Montant / quantité minimum du pack éligible dans la même commande (0 = participe au total groupe). */
  min: number;
  groupe?: string | null;
}

export interface Eligibilite {
  packs: EligibilitePack[];
  /** Total minimum saisi par groupe de packs éligibles. */
  totauxGroupes: { groupe: string; totalMin: number }[];
  operateur: 'ET' | 'OU';
  base: 'AVANT_REMISE' | 'APRES_REMISE';
  typeValeur: 'HT' | 'TTC';
}

export interface Pack {
  id: string;
  numero: string;
  designation: string;
  typeCondition: TypeCondition;
  categoriePack?: string | null;
  dateDebut: string; // ISO yyyy-mm-dd
  dateFin: string;
  actif: boolean;
  baseSeuil: BaseSeuil;
  unitaire: boolean;
  nombreMinCores?: number | null;
  produits: PackProduit[];
  groupes: ContrainteGroupe[];
  packsSeuil: PackSeuil[];
  conditions: ConditionPalier[];
  produitsUG: ProduitUG[];
  eligibilite?: Eligibilite | null;
  /** Condition clé : priorité (plus grand = prioritaire) et période de cumul. */
  priorite?: number | null;
  dateDebutCalcul?: string | null;
  dateFinCalcul?: string | null;
  /** Ciblage (proposition C3). */
  clientsExclus?: string[];
  maxApplicationsParClient?: number | null;
}

export interface ProduitTarif {
  id: string;
  designation?: string;
  /** Prix de base de calcul (PPH HT par défaut). */
  prixHT: number;
  tauxTva: number;
}

export interface LigneSaisie {
  produitId: string;
  qte: number;
}

export interface UgSaisie {
  produitId: string;
  qte: number;
}

export interface PackSaisi {
  packId: string;
  lignes: LigneSaisie[];
  /** Pour RF_OU_UG. */
  choixRemise?: 'RF' | 'UG';
  ug?: UgSaisie[];
}

export interface CommandeSaisie {
  clientId: string;
  dateCommande: string; // ISO
  packs: PackSaisi[];
}

export interface ContexteCalcul {
  packs: Pack[];
  produits: ProduitTarif[];
  /** Condition clé : cumul historique (même base que le pack) par packId pour le client. */
  cumulsHistoriques?: Record<string, number>;
  /** Nombre d'applications déjà consommées par packId pour le client. */
  applicationsConsommees?: Record<string, number>;
  /** Montant minimum de commande HT (ex. 500 DH Casa / 2000 DH hors Casa). */
  montantMinimumCommande?: number | null;
}

export type CodeErreur =
  | 'PACK_INCONNU'
  | 'PACK_INACTIF'
  | 'PACK_HORS_VALIDITE'
  | 'PACK_CLIENT_EXCLU'
  | 'PACK_MAX_APPLICATIONS'
  | 'PRODUIT_HORS_PACK'
  | 'PRODUIT_INCONNU'
  | 'QTE_INVALIDE'
  | 'QTE_MIN'
  | 'QTE_MAX'
  | 'GROUPE_QTE_MIN'
  | 'GROUPE_QTE_MAX'
  | 'GROUPE_VALEUR_MIN'
  | 'GROUPE_VALEUR_MAX'
  | 'CORES_INSUFFISANTS'
  | 'OBLIGATOIRE_MANQUANT'
  | 'SEUIL_HORS_BORNES'
  | 'ELIGIBILITE_NON_ATTEINTE'
  | 'UG_NON_AUTORISEE'
  | 'UG_DEPASSEMENT'
  | 'UG_QTE_MIN'
  | 'UG_QTE_MAX'
  | 'UG_OBLIGATOIRE_MANQUANTE'
  | 'UG_PRORATA_NON_MODIFIABLE'
  | 'CHOIX_REMISE_INVALIDE'
  | 'MONTANT_MINIMUM'
  | 'CLIENT_BLOQUE'
  | 'CLIENT_INSOLVABLE';

export interface Anomalie {
  code: CodeErreur;
  message: string;
  packId?: string;
  produitId?: string;
  groupe?: string;
  /** bloquante = la commande ne peut pas être validée. */
  bloquante: boolean;
}

export interface LigneCalculee {
  produitId: string;
  qte: number;
  prixUnitaireHT: number;
  tauxTva: number;
  montantBrutHT: number;
  tauxRemise: number;
  prixRemiseHT: number;
  montantRemiseHT: number;
  montantNetHT: number;
  montantNetTTC: number;
  gratuit: boolean;
}

export interface DroitUG {
  type: TypeUG;
  /** Nombre d'unités (PCT_QTE, VALEUR_FIXE, PCT_QTE_PRORATA) ou valeur (PCT_VALEUR). */
  quantite?: number;
  valeur?: number;
  /** Produits proposables en UG. */
  produitsProposables: string[];
  /** Pré-remplissage (PRORATA). */
  preRemplies?: UgSaisie[];
}

export interface ResultatPack {
  packId: string;
  numero: string;
  typeCondition: TypeCondition;
  seuil: number;
  /** Seuils par catégorie lorsque des conditions par catégorie existent. */
  seuilsParCategorie: Partial<Record<CategorieProduitPack | 'TOTAL', number>>;
  conditionsAppliquees: ConditionPalier[];
  remiseRetenue: 'RF' | 'UG' | 'RF_UG' | 'AUCUNE';
  lignes: LigneCalculee[];
  lignesUG: LigneCalculee[];
  droitUG: DroitUG | null;
  totalBrutHT: number;
  totalRemiseHT: number;
  totalNetHT: number;
  totalNetTTC: number;
  valeurUGHT: number;
  anomalies: Anomalie[];
  valide: boolean;
}

export interface ResultatCommande {
  packs: ResultatPack[];
  totalBrutHT: number;
  totalRemiseHT: number;
  totalNetHT: number;
  totalTVA: number;
  totalNetTTC: number;
  totalQuantite: number;
  totalUG: number;
  tauxRemiseGlobal: number;
  anomalies: Anomalie[];
  valide: boolean;
}
