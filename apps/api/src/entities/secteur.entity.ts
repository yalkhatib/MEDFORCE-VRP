import { Entity, Index } from 'typeorm';
import { StringColumn, UuidColumn } from '../database/columns';
import { SyncEntity } from './base.entity';

/**
 * Nœud de l'arborescence de sectorisation (Grande Région > Secteur > Sous-Secteur > Ville > Sous-Ville).
 * `chemin` = chemin matérialisé « /id1/id2/…/ » pour requêter les descendants de façon portable (LIKE).
 */
@Entity('secteur')
@Index(['niveau', 'code'], { unique: true })
export class Secteur extends SyncEntity {
  @StringColumn(20, { nullable: false })
  niveau: string;

  @StringColumn(30, { nullable: false })
  code: string;

  @StringColumn(150, { nullable: false })
  designation: string;

  @UuidColumn()
  parentId: string | null;

  @Index()
  @StringColumn(900, { nullable: false })
  chemin: string;
}
