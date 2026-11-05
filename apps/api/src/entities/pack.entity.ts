import { Column, Entity, Index } from 'typeorm';
import type { ConditionPalier, ContrainteGroupe, Eligibilite, PackProduit, PackSeuil, ProduitUG } from '@medforce/core';
import { BoolColumn, DateColumn, JsonColumn, StringColumn } from '../database/columns';
import { SyncEntity } from './base.entity';

/** Pack de conditions commerciales. Les sous-structures sont stockées en JSON portable. */
@Entity('pack')
export class PackEntity extends SyncEntity {
  @Index({ unique: true })
  @StringColumn(30, { nullable: false })
  numero: string;

  @StringColumn(200, { nullable: false })
  designation: string;

  @StringColumn(20, { nullable: false })
  typeCondition: string;

  @StringColumn(50) categoriePack: string | null;
  @DateColumn({ nullable: false }) dateDebut: string;
  @DateColumn({ nullable: false }) dateFin: string;
  @BoolColumn({ default: true }) actif: boolean;
  @StringColumn(20, { nullable: false, default: 'VALEUR_HT' }) baseSeuil: string;
  @BoolColumn() unitaire: boolean;
  @Column({ type: 'int', nullable: true }) nombreMinCores: number | null;
  @Column({ type: 'int', nullable: true }) priorite: number | null;
  @DateColumn() dateDebutCalcul: string | null;
  @DateColumn() dateFinCalcul: string | null;
  @Column({ type: 'int', nullable: true }) maxApplicationsParClient: number | null;

  @JsonColumn({ nullable: false }) produits: PackProduit[];
  @JsonColumn({ nullable: false }) groupes: ContrainteGroupe[];
  @JsonColumn({ nullable: false }) packsSeuil: PackSeuil[];
  @JsonColumn({ nullable: false }) conditions: ConditionPalier[];
  @JsonColumn({ nullable: false }) produitsUG: ProduitUG[];
  @JsonColumn() eligibilite: Eligibilite | null;
  @JsonColumn() clientsExclus: string[] | null;
}
