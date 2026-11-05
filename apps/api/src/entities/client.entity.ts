import { Column, Entity, Index } from 'typeorm';
import { BoolColumn, DateColumn, JsonColumn, MoneyColumn, StringColumn, UuidColumn } from '../database/columns';
import { SyncEntity } from './base.entity';

/** Fiche client (pharmacie) – CDC §6 révisé par la Gap Analysis. */
@Entity('client')
export class Client extends SyncEntity {
  /** Code client numérique auto-incrémenté (attribué par le serveur). */
  @Index({ unique: true })
  @Column({ type: 'int', nullable: false })
  code: number;

  @Index()
  @StringColumn(30)
  codeX3: string | null;

  @StringColumn(20, { nullable: false, default: 'CREE_NON_VALIDE' })
  statut: string;

  @StringColumn(30)
  categorie: string | null;

  @Index()
  @StringColumn(200, { nullable: false })
  raisonSociale: string;

  // --- Identification administrative (non modifiable par le RP, source X3)
  @DateColumn() dateInstallation: string | null;
  @StringColumn(30) identifiantFiscal: string | null;
  @StringColumn(30) registreCommerce: string | null;
  @StringColumn(30) patente: string | null;
  @StringColumn(30) ice: string | null;
  @StringColumn(30) numeroAutorisation: string | null;
  @DateColumn() dateAutorisation: string | null;
  /** « Sage X3 » ou nom du créateur CRM. */
  @StringColumn(100) operateurCreation: string | null;
  @UuidColumn() codeClientRemplacant: string | null;

  // --- Localisation / personnel
  @StringColumn(300) adresse: string | null;
  @StringColumn(80) ville: string | null;
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: { to: (v) => v, from: (v) => (v == null ? v : Number(v)) } })
  latitude: number | null;
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true, transformer: { to: (v) => v, from: (v) => (v == null ? v : Number(v)) } })
  longitude: number | null;
  @StringColumn(30) telephone1: string | null;
  @StringColumn(30) telephone2: string | null;
  @StringColumn(30) fax: string | null;
  /** [{ nom, prenom, sexe }] */
  @JsonColumn() assistants: { nom: string; prenom?: string; sexe?: string }[] | null;
  @JsonColumn() vendeurs: { nom: string; prenom?: string; sexe?: string }[] | null;

  // --- Gestionnaire (pharmacien responsable)
  @StringColumn(150) pharmacienNom: string | null;
  @StringColumn(1) pharmacienSexe: string | null;
  @DateColumn() pharmacienDateNaissance: string | null;
  @StringColumn(20) pharmacienCin: string | null;
  @StringColumn(30) gsm1: string | null;
  @StringColumn(30) gsm2: string | null;
  @StringColumn(150) email1: string | null;
  @StringColumn(150) email2: string | null;
  @BoolColumn() neSouhaitePasPartagerGsm: boolean;
  @BoolColumn() neSouhaitePasPartagerEmail: boolean;

  // --- Identification Cooper
  @Index() @UuidColumn() sousSecteurId: string | null;
  /** Chemin matérialisé du nœud, dénormalisé pour le filtrage par périmètre. */
  @Index() @StringColumn(900) secteurChemin: string | null;
  @StringColumn(50) uniteGeoIms: string | null;
  @Index() @UuidColumn() rpId: string | null;
  @StringColumn(30) modaliteReglement: string | null;
  @StringColumn(1) ciblage: string | null;
  @StringColumn(50) leaderOpinion: string | null;
  @BoolColumn() orateur: boolean;
  @StringColumn(20) emplacement: string | null;
  @StringColumn(20) solvabilite: string | null;
  @StringColumn(30) caGlobalEstime: string | null;
  @StringColumn(30) politiqueCommerciale: string | null;
  @StringColumn(50) logicielPharmacie: string | null;
  @MoneyColumn({ nullable: true, default: null }) moq: number | null;

  // --- Données X3 (lecture seule)
  @BoolColumn() bloque: boolean;
  /** NONE | PRECONTENTIEUX | CONTENTIEUX */
  @StringColumn(20) contentieux: string | null;
  @MoneyColumn({ nullable: true, default: null }) plafondEncours: number | null;
  @MoneyColumn({ nullable: true, default: null }) encoursCommercial: number | null;

  @UuidColumn() createurId: string | null;
}
