import { Entity, Index } from 'typeorm';
import { BoolColumn, DateColumn, DateTimeColumn, JsonColumn, StringColumn, TextColumn, UuidColumn } from '../database/columns';
import { Column } from 'typeorm';
import { SyncEntity } from './base.entity';

const gps = { type: 'decimal' as const, precision: 10, scale: 7, nullable: true, transformer: { to: (v: any) => v, from: (v: any) => (v == null ? v : Number(v)) } };

export interface ActivitesVisite {
  presentationConditions?: boolean;
  priseCommande?: boolean;
  motifNonCommande?: string | null;
  formationProduits?: 'RAPPEL' | 'LANCEMENT' | null;
  produitsFormation?: string[];
  merchandising?: boolean;
  animationAtelier?: boolean;
  reclamation?: boolean;
  recouvrement?: boolean;
  echantillons?: boolean;
  materielPromotionnel?: boolean;
  pharmacovigilance?: boolean;
  demandePharmacie?: boolean;
  autreMotif?: string | null;
}

/**
 * Visite pharmaceutique : planifiée (statut PLANIFIEE) puis réalisée sur le mobile ou le back-office.
 */
@Entity('visite')
@Index(['rpId', 'datePrevue'])
export class Visite extends SyncEntity {
  @Index() @UuidColumn({ nullable: false }) clientId: string;
  @UuidColumn({ nullable: false }) rpId: string;
  @UuidColumn() planificationId: string | null;
  @StringColumn(7) semaine: string | null;
  @DateColumn() datePrevue: string | null;
  @StringColumn(20, { nullable: false, default: 'PLANIFIEE' }) statut: string;
  @BoolColumn() obligatoire: boolean;
  @BoolColumn() horsPlan: boolean;
  /** CREATION (1re visite d'une pharmacie créée), STANDARD, AUTO (créée par un module tiers). */
  @StringColumn(20, { nullable: false, default: 'STANDARD' }) typeVisite: string;
  @StringColumn(50) motifHorsPlan: string | null;
  @DateTimeColumn() debut: Date | null;
  @DateTimeColumn() fin: Date | null;
  @Column(gps) latitudeDebut: number | null;
  @Column(gps) longitudeDebut: number | null;
  @Column({ type: 'int', nullable: true }) distanceClientM: number | null;
  @BoolColumn() horsZone: boolean;
  @JsonColumn() activites: ActivitesVisite | null;
  @TextColumn() commentaire: string | null;
}
