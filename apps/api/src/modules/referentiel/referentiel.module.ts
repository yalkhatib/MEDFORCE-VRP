import { randomUUID } from 'crypto';
import { Body, Controller, Delete, Get, Injectable, Module, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { niveauEnfant, NiveauSectorisation } from '@medforce/core';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { AuthUser, CurrentUser, Roles } from '../../common/auth';
import { badRequest, notFound } from '../../common/errors';
import { AffectationHisto, Client, Gamme, PackEntity, Produit, Secteur, Utilisateur } from '../../entities';
import { AuthService } from '../auth/auth.module';
import { GammeDto, PackDto, ProduitDto, ProduitImportDto, SecteurDto, SecteurImportDto, UtilisateurDto } from './dto';

@Injectable()
export class SecteurService {
  constructor(
    @InjectRepository(Secteur) private readonly repo: Repository<Secteur>,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    private readonly ds: DataSource,
  ) {}

  liste() {
    return this.repo.find({ where: { deletedAt: IsNull() }, order: { chemin: 'ASC' } });
  }

  async enregistrer(dto: SecteurDto, auteur: string) {
    const parent = dto.parentId ? await this.repo.findOneBy({ id: dto.parentId }) : null;
    if (dto.parentId && !parent) throw notFound('Nœud parent');
    if (parent && niveauEnfant(parent.niveau as NiveauSectorisation) !== dto.niveau)
      throw badRequest(`Un nœud ${dto.niveau} ne peut pas être rattaché à un nœud ${parent.niveau}.`);
    if (!parent && dto.niveau !== 'GRANDE_REGION') throw badRequest('Seule une Grande Région peut être un nœud racine.');

    return this.ds.transaction(async (m) => {
      const existant = dto.id ? await m.findOneBy(Secteur, { id: dto.id }) : null;
      const s = existant ?? m.create(Secteur, { id: dto.id, createdBy: auteur });
      const ancienChemin = existant?.chemin;
      Object.assign(s, { niveau: dto.niveau, code: dto.code, designation: dto.designation, parentId: parent?.id ?? null, updatedBy: auteur });
      if (!s.id) s.id = randomUUID();
      s.chemin = `${parent?.chemin ?? '/'}${s.id}/`;
      const saved = await m.save(s);
      // Déplacement d'un nœud : répercussion sur les descendants et les clients (modification en masse, CDC §6.3).
      if (ancienChemin && ancienChemin !== saved.chemin) {
        const desc = await m.createQueryBuilder(Secteur, 's').where('s.chemin LIKE :p', { p: `${ancienChemin}%` }).andWhere('s.id <> :id', { id: s.id }).getMany();
        for (const d of desc) {
          d.chemin = saved.chemin + d.chemin.slice(ancienChemin.length);
          await m.save(d);
        }
        const cl = await m.createQueryBuilder(Client, 'c').where('c.secteurChemin LIKE :p', { p: `${ancienChemin}%` }).getMany();
        for (const c of cl) {
          c.secteurChemin = saved.chemin + (c.secteurChemin ?? '').slice(ancienChemin.length);
          await m.save(c);
        }
      }
      return saved;
    });
  }

  /** Import de l'arborescence géographique (Gap Analysis : import depuis Excel). Upsert par (niveau, code). */
  async importer(dto: SecteurImportDto, auteur: string) {
    const ordre = ['GRANDE_REGION', 'SECTEUR', 'SOUS_SECTEUR', 'VILLE', 'SOUS_VILLE'];
    const lignes = [...dto.lignes].sort((a, b) => ordre.indexOf(a.niveau) - ordre.indexOf(b.niveau));
    let crees = 0;
    let maj = 0;
    for (const l of lignes) {
      const parentNiveau = ordre[ordre.indexOf(l.niveau) - 1];
      const parent = l.codeParent ? await this.repo.findOneBy({ niveau: parentNiveau, code: l.codeParent }) : null;
      if (l.codeParent && !parent) throw badRequest(`Parent ${parentNiveau} ${l.codeParent} introuvable pour ${l.niveau} ${l.code}.`);
      const existant = await this.repo.findOneBy({ niveau: l.niveau, code: l.code });
      await this.enregistrer({ id: existant?.id, niveau: l.niveau, code: l.code, designation: l.designation, parentId: parent?.id ?? null }, auteur);
      existant ? maj++ : crees++;
    }
    return { crees, misAJour: maj };
  }
}

@Controller('secteurs')
class SecteurController {
  constructor(private readonly svc: SecteurService) {}
  @Get() liste() {
    return this.svc.liste();
  }
  @Roles('COORDINATEUR') @Post() creer(@Body() dto: SecteurDto, @CurrentUser() u: AuthUser) {
    return this.svc.enregistrer(dto, u.id);
  }
  @Roles('COORDINATEUR') @Put(':id') maj(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SecteurDto, @CurrentUser() u: AuthUser) {
    return this.svc.enregistrer({ ...dto, id }, u.id);
  }
  @Roles('COORDINATEUR') @Post('import') importer(@Body() dto: SecteurImportDto, @CurrentUser() u: AuthUser) {
    return this.svc.importer(dto, u.id);
  }
}

@Controller('utilisateurs')
class UtilisateurController {
  constructor(@InjectRepository(Utilisateur) private readonly repo: Repository<Utilisateur>, private readonly ds: DataSource) {}

  @Get() liste(@Query('role') role?: string) {
    return this.repo.find({ where: { deletedAt: IsNull(), ...(role ? { role } : {}) }, order: { nom: 'ASC' } });
  }

  @Get(':id') async un(@Param('id', ParseUUIDPipe) id: string) {
    return (await this.repo.findOneBy({ id })) ?? Promise.reject(notFound('Utilisateur'));
  }

  @Roles('COORDINATEUR') @Post() creer(@Body() dto: UtilisateurDto, @CurrentUser() u: AuthUser) {
    return this.enregistrer(dto, u);
  }

  @Roles('COORDINATEUR') @Put(':id') maj(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UtilisateurDto, @CurrentUser() u: AuthUser) {
    return this.enregistrer({ ...dto, id }, u);
  }

  private enregistrer(dto: UtilisateurDto, auteur: AuthUser) {
    return this.ds.transaction(async (m) => {
      const existant = dto.id ? await m.findOneBy(Utilisateur, { id: dto.id }) : null;
      if (!existant && !dto.password) throw badRequest('Mot de passe obligatoire à la création.');
      const { password, ...data } = dto;
      const u = existant ?? m.create(Utilisateur, { createdBy: auteur.id });
      const anciensSecteurs = existant?.secteursIds ?? [];
      Object.assign(u, data, { updatedBy: auteur.id });
      if (password) u.passwordHash = AuthService.hash(password);
      const saved = await m.save(u);
      const nouveaux = saved.secteursIds ?? [];
      if (JSON.stringify([...anciensSecteurs].sort()) !== JSON.stringify([...nouveaux].sort()))
        await m.save(
          m.create(AffectationHisto, { type: 'UTILISATEUR_SECTEURS', cibleId: saved.id, ancienneValeur: anciensSecteurs, nouvelleValeur: nouveaux, dateEffet: new Date(), auteurId: auteur.id }),
        );
      delete (saved as any).passwordHash;
      return saved;
    });
  }

  @Get(':id/historique-affectations') historique(@Param('id', ParseUUIDPipe) id: string) {
    return this.ds.getRepository(AffectationHisto).find({ where: { cibleId: id }, order: { dateEffet: 'DESC' } });
  }
}

@Controller()
class CatalogueController {
  constructor(
    @InjectRepository(Gamme) private readonly gammes: Repository<Gamme>,
    @InjectRepository(Produit) private readonly produits: Repository<Produit>,
    @InjectRepository(PackEntity) private readonly packs: Repository<PackEntity>,
  ) {}

  @Get('gammes') listeGammes() {
    return this.gammes.find({ where: { deletedAt: IsNull() }, order: { libelle: 'ASC' } });
  }

  @Roles('COORDINATEUR') @Post('gammes') async gamme(@Body() dto: GammeDto, @CurrentUser() u: AuthUser) {
    const g = (await this.gammes.findOneBy({ code: dto.code })) ?? this.gammes.create({ createdBy: u.id });
    return this.gammes.save(Object.assign(g, dto, { updatedBy: u.id }));
  }

  @Get('produits') listeProduits(@Query('vendable') vendable?: string) {
    return this.produits.find({
      where: { deletedAt: IsNull(), ...(vendable === 'true' ? { vendable: true } : {}) },
      order: { priorite: 'DESC', designation: 'ASC' },
    });
  }

  /** Synchronisation produits depuis Sage X3 (upsert par code, gamme référencée par code). */
  @Roles('COORDINATEUR') @Post('produits/import') async importer(@Body() dto: ProduitImportDto, @CurrentUser() u: AuthUser) {
    const codesGammes = [...new Set(dto.produits.map((p) => p.codeGamme).filter(Boolean))] as string[];
    const gammes = codesGammes.length ? await this.gammes.findBy({ code: In(codesGammes) }) : [];
    const parCode = new Map(gammes.map((g) => [g.code, g.id]));
    let n = 0;
    for (const p of dto.produits) {
      const ex = (await this.produits.findOneBy({ code: p.code })) ?? this.produits.create({ createdBy: u.id });
      const { codeGamme, id, ...data } = p;
      Object.assign(ex, data, { gammeId: codeGamme ? parCode.get(codeGamme) ?? null : ex.gammeId ?? null, updatedBy: u.id });
      await this.produits.save(ex);
      n++;
    }
    return { traites: n };
  }

  @Roles('COORDINATEUR') @Post('produits') async produit(@Body() dto: ProduitDto, @CurrentUser() u: AuthUser) {
    return this.importer({ produits: [dto] }, u);
  }

  @Get('packs') listePacks(@Query('actifs') actifs?: string) {
    return this.packs.find({ where: { deletedAt: IsNull(), ...(actifs === 'true' ? { actif: true } : {}) }, order: { numero: 'ASC' } });
  }

  @Get('packs/:id') async pack(@Param('id', ParseUUIDPipe) id: string) {
    return (await this.packs.findOneBy({ id })) ?? Promise.reject(notFound('Pack'));
  }

  @Roles('COORDINATEUR') @Post('packs') creerPack(@Body() dto: PackDto, @CurrentUser() u: AuthUser) {
    return this.enregistrerPack(dto, u);
  }

  @Roles('COORDINATEUR') @Put('packs/:id') majPack(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PackDto, @CurrentUser() u: AuthUser) {
    return this.enregistrerPack({ ...dto, id }, u);
  }

  @Roles('COORDINATEUR') @Delete('packs/:id') async desactiver(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    const p = await this.packs.findOneBy({ id });
    if (!p) throw notFound('Pack');
    return this.packs.save(Object.assign(p, { actif: false, updatedBy: u.id }));
  }

  private async enregistrerPack(dto: PackDto, u: AuthUser) {
    if (dto.dateFin < dto.dateDebut) throw badRequest('La date de fin doit être postérieure à la date de début.');
    if (dto.typeCondition === 'CLE' && dto.priorite != null) {
      const meme = await this.packs.findOneBy({ typeCondition: 'CLE', priorite: dto.priorite, actif: true });
      if (meme && meme.id !== dto.id) throw badRequest('Deux conditions clé actives ne peuvent pas avoir la même priorité.');
    }
    const p = (dto.id && (await this.packs.findOneBy({ id: dto.id }))) || this.packs.create({ id: dto.id, createdBy: u.id });
    Object.assign(p, { groupes: [], packsSeuil: [], produitsUG: [], ...dto, updatedBy: u.id });
    if (p.packsSeuil.length === 0 && p.id) p.packsSeuil = [{ packId: p.id, base: 'AVANT_REMISE' }];
    const saved = await this.packs.save(p);
    // À la création, le bloc « Packs pour calcul du seuil » est initialisé par le pack lui-même (CDC §13).
    if (saved.packsSeuil.length === 0) {
      saved.packsSeuil = [{ packId: saved.id, base: 'AVANT_REMISE' }];
      return this.packs.save(saved);
    }
    return saved;
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Secteur, Utilisateur, AffectationHisto, Gamme, Produit, PackEntity, Client])],
  controllers: [SecteurController, UtilisateurController, CatalogueController],
  providers: [SecteurService],
  exports: [SecteurService],
})
export class ReferentielModule {}
