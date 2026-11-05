import { Entity, Index } from 'typeorm';
import { DateTimeColumn, JsonColumn, StringColumn, UuidColumn } from '../database/columns';
import { SyncEntity } from './base.entity';

/** Historique des affectations (secteurs ↔ RP, RP ↔ client). */
@Entity('affectation_histo')
export class AffectationHisto extends SyncEntity {
  /** UTILISATEUR_SECTEURS | CLIENT_RP */
  @StringColumn(30, { nullable: false })
  type: string;

  @Index()
  @UuidColumn({ nullable: false })
  cibleId: string;

  @JsonColumn()
  ancienneValeur: unknown;

  @JsonColumn()
  nouvelleValeur: unknown;

  @DateTimeColumn({ nullable: false })
  dateEffet: Date;

  @UuidColumn()
  auteurId: string | null;
}
