import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('sync_counter')
export class SyncCounter {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'bigint', default: 0 })
  value: string;
}
