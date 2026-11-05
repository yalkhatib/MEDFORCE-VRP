import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { MODES_ACCES_CLIENTS, NIVEAUX_SECTORISATION, ROLES } from '@medforce/core';

export class SecteurDto {
  @IsOptional() @IsUUID() id?: string;
  @IsIn(NIVEAUX_SECTORISATION as unknown as string[]) niveau: string;
  @IsString() @MaxLength(30) code: string;
  @IsString() @MaxLength(150) designation: string;
  @IsOptional() @IsUUID() parentId?: string | null;
}

/** Import de l'arborescence (fichier Excel converti côté back-office) : parent référencé par code. */
export class SecteurImportLigne {
  @IsIn(NIVEAUX_SECTORISATION as unknown as string[]) niveau: string;
  @IsString() code: string;
  @IsString() designation: string;
  @IsOptional() @IsString() codeParent?: string | null;
}
export class SecteurImportDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => SecteurImportLigne) lignes: SecteurImportLigne[];
}

export class UtilisateurDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() @MaxLength(20) codeRp: string;
  @IsString() login: string;
  @IsOptional() @IsString() password?: string;
  @IsString() nom: string;
  @IsString() prenom: string;
  @IsIn(ROLES as unknown as string[]) role: string;
  @IsOptional() @IsString() matricule?: string;
  @IsOptional() @IsString() sexe?: string;
  @IsOptional() @IsBoolean() estResponsable?: boolean;
  @IsOptional() @IsBoolean() travailleSurTerrain?: boolean;
  @IsOptional() @IsUUID() responsableId?: string | null;
  @IsOptional() @IsIn(MODES_ACCES_CLIENTS as unknown as string[]) modeAccesClients?: string;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) secteursIds?: string[];
  @IsOptional() @IsString() categorie?: string;
  @IsOptional() @IsString() codeX3?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() gsmProfessionnel?: string;
  @IsOptional() @IsString() villeResidence?: string;
  @IsOptional() @IsNumber() dhKmVilleAVille?: number;
  @IsOptional() @IsNumber() dhKmUrbainResidence?: number;
  @IsOptional() @IsNumber() dhKmUrbainAutres?: number;
  @IsOptional() @IsInt() @Min(1) anneesConsultation?: number;
  @IsOptional() @IsIn(['ACTIF', 'INACTIF']) statut?: string;
}

export class GammeDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() code: string;
  @IsString() libelle: string;
}

export class ProduitDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() code: string;
  @IsString() designation: string;
  @IsOptional() @IsString() codeGamme?: string;
  @IsOptional() @IsString() origine?: string;
  @IsOptional() @IsString() categorie?: string;
  @IsNumber() tauxTva: number;
  @IsOptional() @IsNumber() pfHT?: number;
  @IsNumber() pphHT: number;
  @IsOptional() @IsNumber() pphTTC?: number;
  @IsOptional() @IsNumber() ppvTTC?: number;
  @IsOptional() @IsNumber() phoHT?: number;
  @IsOptional() @IsBoolean() vendable?: boolean;
  @IsOptional() @IsBoolean() echantillon?: boolean;
  @IsOptional() @IsInt() colisage?: number;
  @IsOptional() @IsInt() priorite?: number;
  @IsOptional() @IsNumber() stockDisponible?: number | null;
  @IsOptional() @IsString() datePeremptionMin?: string | null;
}
export class ProduitImportDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ProduitDto) produits: ProduitDto[];
}

export class PackDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() numero: string;
  @IsString() designation: string;
  @IsIn(['PANACHE', 'PAR_PRODUIT', 'RESTE_GAMME', 'UG_GLOBALES', 'CLE']) typeCondition: string;
  @IsOptional() @IsString() categoriePack?: string;
  @IsString() dateDebut: string;
  @IsString() dateFin: string;
  @IsOptional() @IsBoolean() actif?: boolean;
  @IsIn(['QUANTITE', 'VALEUR_HT', 'VALEUR_TTC']) baseSeuil: string;
  @IsOptional() @IsBoolean() unitaire?: boolean;
  @IsOptional() @IsInt() nombreMinCores?: number | null;
  @IsOptional() @IsInt() priorite?: number | null;
  @IsOptional() @IsString() dateDebutCalcul?: string | null;
  @IsOptional() @IsString() dateFinCalcul?: string | null;
  @IsOptional() @IsInt() maxApplicationsParClient?: number | null;
  @IsArray() produits: any[];
  @IsOptional() @IsArray() groupes?: any[];
  @IsOptional() @IsArray() packsSeuil?: any[];
  @IsArray() conditions: any[];
  @IsOptional() @IsArray() produitsUG?: any[];
  @IsOptional() eligibilite?: any;
  @IsOptional() @IsArray() clientsExclus?: string[];
}
