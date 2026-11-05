/**
 * Codes métier partagés par l'API, le back-office et le mobile.
 * Stockés en varchar en base (pas d'enum SQL, cf. règles de portabilité).
 */

/** Niveaux de sectorisation retenus en atelier (Gap Analysis §1). */
export const NIVEAUX_SECTORISATION = [
  'GRANDE_REGION',
  'SECTEUR',
  'SOUS_SECTEUR',
  'VILLE',
  'SOUS_VILLE',
] as const;
export type NiveauSectorisation = (typeof NIVEAUX_SECTORISATION)[number];

export function niveauEnfant(n: NiveauSectorisation): NiveauSectorisation | null {
  const i = NIVEAUX_SECTORISATION.indexOf(n);
  return i >= 0 && i < NIVEAUX_SECTORISATION.length - 1 ? NIVEAUX_SECTORISATION[i + 1] : null;
}

/** Mode d'accès aux clients d'un RP (Gap Analysis – Utilisateurs & Profils). */
export const MODES_ACCES_CLIENTS = ['SECTEUR', 'PORTEFEUILLE', 'LES_DEUX'] as const;
export type ModeAccesClients = (typeof MODES_ACCES_CLIENTS)[number];

export const ROLES = ['ADMIN', 'DPP', 'RESPONSABLE_REGIONAL', 'COORDINATEUR', 'RP', 'TELEPHONISTE', 'VALIDATEUR_COMMANDES'] as const;
export type Role = (typeof ROLES)[number];

/** Statut du cycle de vie client (proposition P1, couleurs à définir par Cooper). */
export const STATUTS_CLIENT = ['PROSPECT', 'CREE_NON_VALIDE', 'VALIDE_SANS_X3', 'ACTIF', 'INACTIF', 'ANNULE'] as const;
export type StatutClient = (typeof STATUTS_CLIENT)[number];

export const CIBLAGES = ['A', 'B', 'C', 'P'] as const;
export const SOLVABILITES = ['SOLVABLE', 'IRREGULIER', 'INSOLVABLE'] as const;
export const POLITIQUES_COMMERCIALES = ['COOPER_SR', 'COOPER_SD', 'GROUPEMENT', 'ANTI_MARCHE'] as const;

/** Cycle de vie d'une commande (proposition C5). */
export const STATUTS_COMMANDE = [
  'BROUILLON',
  'CONFIRMEE_RP',
  'EN_ATTENTE_DEROGATION',
  'SAISIE',
  'EN_COURS',
  'VALIDEE',
  'TRANSFEREE_X3',
  'LIVREE_PARTIEL',
  'LIVREE',
  'FACTUREE',
  'ANNULEE',
] as const;
export type StatutCommande = (typeof STATUTS_COMMANDE)[number];

/** Statuts pour lesquels le RP reste propriétaire du document (règle de conflit sync). */
export const STATUTS_COMMANDE_MODIFIABLES_RP: readonly StatutCommande[] = ['BROUILLON', 'CONFIRMEE_RP', 'EN_ATTENTE_DEROGATION', 'SAISIE'];

export const STATUTS_VISITE = ['PLANIFIEE', 'EN_COURS', 'REALISEE', 'NON_REALISEE', 'ANNULEE'] as const;
export type StatutVisite = (typeof STATUTS_VISITE)[number];

export const STATUTS_PLANIFICATION = ['BROUILLON', 'VALIDEE', 'ENTAMEE', 'CLOTUREE', 'SUPPRIMEE'] as const;
export type StatutPlanification = (typeof STATUTS_PLANIFICATION)[number];

export const STATUTS_DEMANDE_MODIF = ['EN_ATTENTE', 'PRE_VALIDEE', 'VALIDEE', 'REJETEE'] as const;
export type StatutDemandeModif = (typeof STATUTS_DEMANDE_MODIF)[number];

/**
 * Champs de la fiche client modifiables par un RP (Gap Analysis §Référentiel Clients).
 * Les autres champs proviennent de Sage X3 et ne sont pas modifiables.
 */
export const CHAMPS_CLIENT_MODIFIABLES = [
  'latitude',
  'longitude',
  'telephone1',
  'telephone2',
  'fax',
  'gsm1',
  'gsm2',
  'email1',
  'email2',
  'neSouhaitePasPartagerGsm',
  'neSouhaitePasPartagerEmail',
  'pharmacienNom',
  'pharmacienSexe',
  'pharmacienDateNaissance',
  'pharmacienCin',
  'assistants',
  'vendeurs',
  'adresse',
  'sousSecteurId',
  'uniteGeoIms',
  'modaliteReglement',
  'ciblage',
  'leaderOpinion',
  'orateur',
  'emplacement',
  'solvabilite',
  'caGlobalEstime',
  'politiqueCommerciale',
  'logicielPharmacie',
  'codeClientRemplacant',
  'moq',
] as const;
export type ChampClientModifiable = (typeof CHAMPS_CLIENT_MODIFIABLES)[number];
