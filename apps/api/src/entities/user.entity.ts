import { Column, Entity, Index } from 'typeorm';
import { BoolColumn, DateColumn, DateTimeColumn, JsonColumn, MoneyColumn, StringColumn, UuidColumn } from '../database/columns';
import { SyncEntity } from './base.entity';

@Entity('utilisateur')
export class Utilisateur extends SyncEntity {
  @Index({ unique: true })
  @StringColumn(20, { nullable: false })
  codeRp: string;

  @StringColumn(30)
  matricule: string | null;

  @Index({ unique: true })
  @StringColumn(80, { nullable: false })
  login: string;

  @StringColumn(100, { nullable: false, select: false })
  passwordHash: string;

  @StringColumn(80, { nullable: false })
  nom: string;

  @StringColumn(80, { nullable: false })
  prenom: string;

  @StringColumn(1)
  sexe: string | null;

  @DateColumn()
  dateNaissance: string | null;

  @StringColumn(30, { nullable: false, default: 'RP' })
  role: string;

  @StringColumn(20, { nullable: false, default: 'ACTIF' })
  statut: string;

  @BoolColumn()
  estResponsable: boolean;

  @BoolColumn({ default: true })
  travailleSurTerrain: boolean;

  @UuidColumn()
  responsableId: string | null;

  /** SECTEUR | PORTEFEUILLE | LES_DEUX */
  @StringColumn(20, { nullable: false, default: 'SECTEUR' })
  modeAccesClients: string;

  /** Nœuds de sectorisation affectés (ids). Historisés dans affectation_histo. */
  @JsonColumn()
  secteursIds: string[] | null;

  @StringColumn(30)
  categorie: string | null;

  @StringColumn(30)
  codeX3: string | null;

  @StringColumn(30)
  gsmProfessionnel: string | null;

  @StringColumn(150)
  email: string | null;

  @StringColumn(80)
  villeResidence: string | null;

  @MoneyColumn()
  dhKmVilleAVille: number;

  @MoneyColumn()
  dhKmUrbainResidence: number;

  @MoneyColumn()
  dhKmUrbainAutres: number;

  /** Nombre d'années de consultation autorisées (paramétrage Gap Analysis). */
  @Column({ type: 'int', default: 2 })
  anneesConsultation: number;

  @DateColumn()
  dateEmbauche: string | null;

  @DateTimeColumn()
  derniereConnexion: Date | null;

  @Column({ type: 'int', default: 0 })
  echecsConnexion: number;
}
