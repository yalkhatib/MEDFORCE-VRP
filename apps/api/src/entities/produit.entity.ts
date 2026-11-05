import { Column, Entity, Index } from 'typeorm';
import { BoolColumn, MoneyColumn, StringColumn, UuidColumn } from '../database/columns';
import { SyncEntity } from './base.entity';

@Entity('gamme')
export class Gamme extends SyncEntity {
  @Index({ unique: true })
  @StringColumn(30, { nullable: false })
  code: string;

  @StringColumn(150, { nullable: false })
  libelle: string;
}

/** Produit (présentation) – importé de Sage X3. */
@Entity('produit')
export class Produit extends SyncEntity {
  @Index({ unique: true })
  @StringColumn(30, { nullable: false })
  code: string;

  @StringColumn(200, { nullable: false })
  designation: string;

  @UuidColumn() gammeId: string | null;
  @StringColumn(30) origine: string | null;
  /** OTC, OTX, RX, IMPORTE… */
  @StringColumn(20) categorie: string | null;
  @MoneyColumn() tauxTva: number;
  @MoneyColumn() pfHT: number;
  @MoneyColumn() pphHT: number;
  @MoneyColumn() pphTTC: number;
  @MoneyColumn() ppvTTC: number;
  @MoneyColumn() phoHT: number;
  @BoolColumn({ default: true }) vendable: boolean;
  @BoolColumn() echantillon: boolean;
  @Column({ type: 'int', default: 1 }) colisage: number;
  @Column({ type: 'int', default: 0 }) priorite: number;
  /** Stock et péremption min synchronisés depuis X3. */
  @MoneyColumn({ nullable: true, default: null }) stockDisponible: number | null;
  @StringColumn(10) datePeremptionMin: string | null;
}
