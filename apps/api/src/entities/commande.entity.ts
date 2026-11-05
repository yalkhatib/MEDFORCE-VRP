import { Column, Entity, Index } from 'typeorm';
import type { Anomalie, PackSaisi } from '@medforce/core';
import { BoolColumn, DateColumn, DateTimeColumn, JsonColumn, MoneyColumn, QtyColumn, StringColumn, TextColumn, UuidColumn } from '../database/columns';
import { SyncEntity } from './base.entity';

@Entity('commande')
export class Commande extends SyncEntity {
  @Index({ unique: true }) @StringColumn(30, { nullable: false }) numero: string;
  @StringColumn(30) numeroProvisoire: string | null;
  @StringColumn(30) numeroX3: string | null;
  @Index() @UuidColumn({ nullable: false }) clientId: string;
  /** RP ayant passé la commande, RP affecté au client et secteur à la date de commande (CDC §5). */
  @Index() @UuidColumn({ nullable: false }) rpId: string;
  @UuidColumn() rpAffecteId: string | null;
  @UuidColumn() sousSecteurId: string | null;
  @UuidColumn() visiteId: string | null;
  /** MOBILE | BACKOFFICE */
  @StringColumn(20, { nullable: false, default: 'MOBILE' }) origine: string;
  @DateColumn({ nullable: false }) dateCommande: string;
  @DateColumn() dateLivraisonSouhaitee: string | null;
  @StringColumn(30, { nullable: false, default: 'BROUILLON' }) statut: string;
  @StringColumn(30) modeReglement: string | null;
  @StringColumn(30) priorite: string | null;
  @StringColumn(100) transporteur: string | null;
  @Column({ type: 'int', nullable: true }) instanceJours: number | null;
  @TextColumn() commentaire: string | null;
  /** Saisie par pack (source de vérité, recalculée par @medforce/core). */
  @JsonColumn({ nullable: false }) saisie: PackSaisi[];
  @JsonColumn() anomalies: Anomalie[] | null;
  @BoolColumn() valide: boolean;
  @MoneyColumn() totalBrutHT: number;
  @MoneyColumn() totalRemiseHT: number;
  @MoneyColumn() totalNetHT: number;
  @MoneyColumn() totalTVA: number;
  @MoneyColumn() totalNetTTC: number;
  @QtyColumn() totalQuantite: number;
  @QtyColumn() totalUG: number;
  /** Dérogation demandée (proposition C2). */
  @StringColumn(30) motifDerogation: string | null;
  @UuidColumn() derogationValideeParId: string | null;
  @DateTimeColumn() dateConfirmationRp: Date | null;
  @UuidColumn() traiteParId: string | null;
  @DateTimeColumn() dateValidation: Date | null;
  @JsonColumn() historiqueStatuts: { statut: string; date: string; par: string | null; motif?: string }[] | null;
}

/** Lignes dénormalisées pour le reporting (régénérées à chaque calcul). */
@Entity('commande_ligne')
export class CommandeLigne extends SyncEntity {
  @Index() @UuidColumn({ nullable: false }) commandeId: string;
  @UuidColumn({ nullable: false }) packId: string;
  @Index() @UuidColumn({ nullable: false }) produitId: string;
  @QtyColumn() qte: number;
  @BoolColumn() gratuit: boolean;
  @MoneyColumn() prixUnitaireHT: number;
  @MoneyColumn() tauxTva: number;
  @MoneyColumn() tauxRemise: number;
  @MoneyColumn() montantBrutHT: number;
  @MoneyColumn() montantRemiseHT: number;
  @MoneyColumn() montantNetHT: number;
  @MoneyColumn() montantNetTTC: number;
}
