import { Column, CreateDateColumn, Index, PrimaryColumn, UpdateDateColumn, VersionColumn } from 'typeorm';
import { dateTimeType } from '../database/columns';
import { uuidTransformer } from '../database/columns';
import { DateTimeColumn, UuidColumn } from '../database/columns';

/**
 * Entité synchronisable : id généré par l'émetteur (mobile ou serveur), version optimiste,
 * syncSeq = curseur de pull attribué par le serveur à chaque écriture (cf. SyncSeqSubscriber).
 */
export abstract class SyncEntity {
  @PrimaryColumn({ type: 'uuid', transformer: uuidTransformer })
  id: string;

  @VersionColumn({ default: 1 })
  version: number;

  @Index()
  @Column({ type: 'bigint', default: 0 })
  syncSeq: string;

  @CreateDateColumn({ type: dateTimeType() as any })
  createdAt: Date;

  @UpdateDateColumn({ type: dateTimeType() as any })
  updatedAt: Date;

  @UuidColumn()
  createdBy: string | null;

  @UuidColumn()
  updatedBy: string | null;

  @DateTimeColumn()
  deletedAt: Date | null;
}
