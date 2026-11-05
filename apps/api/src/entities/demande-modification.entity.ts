import { Entity, Index } from 'typeorm';
import { DateTimeColumn, JsonColumn, StringColumn, TextColumn, UuidColumn } from '../database/columns';
import { SyncEntity } from './base.entity';

/** Circuit de validation des créations / modifications de fiches clients (CDC §6.3). */
@Entity('demande_modification')
export class DemandeModification extends SyncEntity {
  /** CREATION | MODIFICATION */
  @StringColumn(20, { nullable: false })
  type: string;

  @Index()
  @UuidColumn({ nullable: false })
  clientId: string;

  /** { champ: { ancien, nouveau } } */
  @JsonColumn({ nullable: false })
  changements: Record<string, { ancien: unknown; nouveau: unknown }>;

  @StringColumn(20, { nullable: false, default: 'EN_ATTENTE' })
  statut: string;

  @Index()
  @UuidColumn({ nullable: false })
  demandeurId: string;

  @UuidColumn() prevalidateurId: string | null;
  @DateTimeColumn() datePrevalidation: Date | null;
  @UuidColumn() validateurId: string | null;
  @DateTimeColumn() dateValidation: Date | null;
  @TextColumn() motifRejet: string | null;
  /** En cas de doublon : client vers lequel réaffecter les visites (Gap Analysis). */
  @UuidColumn() clientReaffectationId: string | null;
}
