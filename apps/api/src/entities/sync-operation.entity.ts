import { Entity, Index, PrimaryColumn, CreateDateColumn } from 'typeorm';
import { JsonColumn, StringColumn, UuidColumn, dateTimeType } from '../database/columns';
import { uuidTransformer } from '../database/columns';

/** Journal d'idempotence des opérations poussées par les tablettes. */
@Entity('sync_operation')
export class SyncOperationLog {
  @PrimaryColumn({ type: 'uuid', transformer: uuidTransformer }) opId: string;
  @Index() @UuidColumn({ nullable: false }) userId: string;
  @StringColumn(100) deviceId: string | null;
  @StringColumn(40, { nullable: false }) tableName: string;
  @UuidColumn({ nullable: false }) entityId: string;
  @StringColumn(20, { nullable: false }) statut: string;
  @JsonColumn() resultat: unknown;
  @CreateDateColumn({ type: dateTimeType() as any }) recuLe: Date;
}

/** Journal d'audit champ par champ (exigence NF2). */
@Entity('audit_log')
export class AuditLog {
  @PrimaryColumn({ type: 'uuid', transformer: uuidTransformer }) id: string;
  @Index() @StringColumn(40, { nullable: false }) entite: string;
  @Index() @UuidColumn({ nullable: false }) entiteId: string;
  @StringColumn(20, { nullable: false }) action: string;
  @JsonColumn() changements: unknown;
  @UuidColumn() auteurId: string | null;
  @StringColumn(100) source: string | null;
  @CreateDateColumn({ type: dateTimeType() as any }) date: Date;
}
