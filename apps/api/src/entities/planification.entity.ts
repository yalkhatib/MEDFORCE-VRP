import { Column, Entity, Index } from 'typeorm';
import { BoolColumn, DateColumn, JsonColumn, StringColumn, UuidColumn } from '../database/columns';
import { SyncEntity } from './base.entity';

export interface SemaineCycle {
  numero: number;
  /** Nœuds de sectorisation de la semaine. */
  noeuds: string[];
  /** Nœuds par jour (1 = lundi … 7 = dimanche), égaux ou inférieurs à ceux de la semaine. */
  jours: Record<string, string[]>;
}

/** Cycle de tournée d'un RP (un seul actif à la fois). */
@Entity('cycle')
export class Cycle extends SyncEntity {
  @Index() @UuidColumn({ nullable: false }) rpId: string;
  @StringColumn(150, { nullable: false }) libelle: string;
  @BoolColumn() actif: boolean;
  @DateColumn() dateDesactivation: string | null;
  @JsonColumn({ nullable: false }) semaines: SemaineCycle[];
}

export interface SemainePlan {
  semaine: string;
  semaineCycle: number;
  noeuds: string[];
  jours: Record<string, string[]>;
}

/** Planification de tournée : application du cycle sur une plage de semaines. */
@Entity('planification')
export class Planification extends SyncEntity {
  @Index() @UuidColumn({ nullable: false }) rpId: string;
  @UuidColumn({ nullable: false }) cycleId: string;
  @StringColumn(7, { nullable: false }) semaineDebut: string;
  @Column({ type: 'int', nullable: false }) nombreSemaines: number;
  @Column({ type: 'int', nullable: false, default: 1 }) premiereSemaineCycle: number;
  @StringColumn(20, { nullable: false, default: 'BROUILLON' }) statut: string;
  /** Flag « modifiée après validation » (Gap Analysis). */
  @BoolColumn() modifieeApresValidation: boolean;
  @JsonColumn({ nullable: false }) semaines: SemainePlan[];
  @UuidColumn() validateurId: string | null;
}
