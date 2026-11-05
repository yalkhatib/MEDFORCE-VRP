import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { Secteur, Utilisateur } from '../entities';
import { AuthUser } from './auth';

/**
 * Périmètre de données d'un utilisateur :
 *  - ADMIN / DPP / TELEPHONISTE / VALIDATEUR : national ;
 *  - responsables : leurs clients + ceux des RP sous leur responsabilité (récursif) ;
 *  - RP : clients des secteurs affectés et/ou du portefeuille selon `modeAccesClients`,
 *    + clients créés par lui-même non encore validés.
 */
@Injectable()
export class ScopeService {
  constructor(
    @InjectRepository(Utilisateur) private readonly users: Repository<Utilisateur>,
    @InjectRepository(Secteur) private readonly secteurs: Repository<Secteur>,
  ) {}

  isNational(user: AuthUser): boolean {
    return ['ADMIN', 'DPP', 'COORDINATEUR', 'TELEPHONISTE', 'VALIDATEUR_COMMANDES'].includes(user.role);
  }

  /** Ids de l'utilisateur et de ses subordonnés (récursif). */
  async equipe(userId: string): Promise<string[]> {
    const all = await this.users.find({ select: ['id', 'responsableId'] });
    const result = new Set([userId]);
    let ajout = true;
    while (ajout) {
      ajout = false;
      for (const u of all) if (u.responsableId && result.has(u.responsableId) && !result.has(u.id)) (result.add(u.id), (ajout = true));
    }
    return [...result];
  }

  /** Applique le filtre de périmètre client à un QueryBuilder sur l'alias `alias`. */
  async appliquerPerimetreClients(qb: SelectQueryBuilder<any>, user: AuthUser, alias = 'c'): Promise<SelectQueryBuilder<any>> {
    if (this.isNational(user)) return qb;
    const ids = await this.equipe(user.id);
    const membres = await this.users.find({ where: { id: In(ids) } });
    const secteurIds = new Set<string>();
    const portefeuille: string[] = [];
    for (const m of membres) {
      if (m.modeAccesClients !== 'PORTEFEUILLE') (m.secteursIds ?? []).forEach((s) => secteurIds.add(s));
      if (m.modeAccesClients !== 'SECTEUR') portefeuille.push(m.id);
    }
    const noeuds = secteurIds.size ? await this.secteurs.find({ where: { id: In([...secteurIds]) } }) : [];
    return qb.andWhere(
      new Brackets((w) => {
        w.where(`${alias}.createurId IN (:...scopeEquipe)`, { scopeEquipe: ids });
        if (portefeuille.length) w.orWhere(`${alias}.rpId IN (:...scopePortefeuille)`, { scopePortefeuille: portefeuille });
        noeuds.forEach((n, i) => w.orWhere(`${alias}.secteurChemin LIKE :scopeChemin${i}`, { [`scopeChemin${i}`]: `${n.chemin}%` }));
      }),
    );
  }
}
