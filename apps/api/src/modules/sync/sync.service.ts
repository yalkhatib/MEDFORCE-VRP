import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  PullResponse,
  PushRequest,
  SyncOperation,
  SyncOpResult,
  SyncRow,
  STATUTS_COMMANDE_MODIFIABLES_RP,
  StatutCommande,
  TableSync,
} from '@medforce/core';
import { DataSource, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { AuthUser } from '../../common/auth';
import { ScopeService } from '../../common/scope.service';
import { Client, Commande, DemandeModification, Gamme, PackEntity, Planification, Produit, Secteur, SyncOperationLog, Visite } from '../../entities';
import { SyncEntity } from '../../entities/base.entity';
import { ClientsService } from '../clients/clients.service';
import { CommandesService } from '../commandes/commandes.service';
import { PlanificationService } from '../planification/planification.service';

type Source = { entity: new () => SyncEntity; filtre?: (qb: SelectQueryBuilder<ObjectLiteral>, u: AuthUser) => Promise<unknown> | unknown };

@Injectable()
export class SyncService {
  private readonly sources: Record<TableSync, Source>;

  constructor(
    private readonly ds: DataSource,
    private readonly scope: ScopeService,
    private readonly clients: ClientsService,
    private readonly commandes: CommandesService,
    private readonly planif: PlanificationService,
    @InjectRepository(SyncOperationLog) private readonly ops: Repository<SyncOperationLog>,
  ) {
    const parRp = (qb: SelectQueryBuilder<ObjectLiteral>, u: AuthUser) => qb.andWhere('t.rpId = :uid', { uid: u.id });
    this.sources = {
      secteurs: { entity: Secteur },
      gammes: { entity: Gamme },
      produits: { entity: Produit },
      packs: { entity: PackEntity },
      clients: { entity: Client, filtre: (qb, u) => this.scope.appliquerPerimetreClients(qb, u, 't') },
      planifications: { entity: Planification, filtre: parRp },
      visites: { entity: Visite, filtre: parRp },
      commandes: { entity: Commande, filtre: parRp },
      demandesModification: { entity: DemandeModification, filtre: (qb, u) => qb.andWhere('t.demandeurId = :uid', { uid: u.id }) },
    };
  }

  static toRow(e: SyncEntity): SyncRow {
    const { passwordHash, ...rest } = e as any;
    return { ...rest, syncSeq: String(e.syncSeq) };
  }

  /** Pull incrémental : renvoie les `limit` plus petits syncSeq > cursor, toutes tables confondues. */
  async pull(user: AuthUser, cursor = '0', limit = 500): Promise<PullResponse> {
    const lim = Math.min(Math.max(limit, 1), 2000);
    const lots: { table: TableSync; row: SyncRow }[] = [];
    let tronque = false;
    for (const [table, src] of Object.entries(this.sources) as [TableSync, Source][]) {
      const qb = this.ds.getRepository(src.entity).createQueryBuilder('t').where('t.syncSeq > :cursor', { cursor });
      if (src.filtre) await src.filtre(qb, user);
      const rows = await qb.orderBy('t.syncSeq', 'ASC').take(lim).getMany();
      if (rows.length >= lim) tronque = true;
      rows.forEach((r) => lots.push({ table, row: SyncService.toRow(r) }));
    }
    lots.sort((a, b) => (BigInt(a.row.syncSeq) < BigInt(b.row.syncSeq) ? -1 : 1));
    const page = lots.slice(0, lim);
    const changes: PullResponse['changes'] = {};
    for (const { table, row } of page) (changes[table] ??= []).push(row);
    return {
      cursor: page.length ? page[page.length - 1].row.syncSeq : cursor,
      hasMore: tronque || lots.length > lim,
      changes,
      tombstones: {},
      serverTime: new Date().toISOString(),
    };
  }

  async push(user: AuthUser, req: PushRequest): Promise<{ results: SyncOpResult[] }> {
    const results: SyncOpResult[] = [];
    for (const op of req.operations) results.push(await this.appliquer(user, req.deviceId, op));
    return { results };
  }

  private async appliquer(user: AuthUser, deviceId: string, op: SyncOperation): Promise<SyncOpResult> {
    const deja = await this.ops.findOneBy({ opId: op.opId });
    if (deja) return { ...(deja.resultat as SyncOpResult), statut: 'DEJA_APPLIQUEE' };

    let result: SyncOpResult;
    try {
      result = await this.executer(user, op);
    } catch (e) {
      const motif = e instanceof HttpException ? JSON.stringify(e.getResponse()) : (e as Error).message;
      result = { opId: op.opId, statut: 'REJETEE', motif, row: await this.courant(op) };
    }
    await this.ops.save(this.ops.create({ opId: op.opId, userId: user.id, deviceId, tableName: op.table, entityId: op.id, statut: result.statut, resultat: result }));
    return result;
  }

  private async courant(op: SyncOperation): Promise<SyncRow | undefined> {
    const entity = this.sources[op.table]?.entity;
    if (!entity) return undefined;
    const e = await this.ds.getRepository(entity).findOneBy({ id: op.id } as any);
    return e ? SyncService.toRow(e) : undefined;
  }

  private async executer(user: AuthUser, op: SyncOperation): Promise<SyncOpResult> {
    const p = (op.payload ?? {}) as any;
    const ok = (row: SyncEntity): SyncOpResult => ({ opId: op.opId, statut: 'APPLIQUEE', row: SyncService.toRow(row) });

    switch (op.table) {
      case 'visites': {
        if (op.action === 'DELETE') throw new Error('Suppression de visite non autorisée depuis le mobile.');
        return ok(await this.planif.enregistrerVisite(user, { ...p, id: op.id }));
      }
      case 'commandes': {
        const existante = await this.ds.getRepository(Commande).findOneBy({ id: op.id });
        if (existante && !STATUTS_COMMANDE_MODIFIABLES_RP.includes(existante.statut as StatutCommande))
          return { opId: op.opId, statut: 'CONFLIT', motif: `Commande déjà en traitement (${existante.statut}).`, row: SyncService.toRow(existante) };
        if (op.action === 'DELETE') {
          if (!existante) return { opId: op.opId, statut: 'APPLIQUEE' };
          return ok(await this.commandes.changerStatut(user, op.id, 'ANNULEE', { motif: p.motif ?? 'Annulée par le RP' }));
        }
        let c = await this.commandes.enregistrer(user, { ...p, id: op.id, origine: 'MOBILE' });
        // Confirmation RP (ou demande de dérogation) faite hors ligne.
        if (p.statutCible && p.statutCible !== c.statut) c = await this.commandes.changerStatut(user, c.id, p.statutCible, { motifDerogation: p.motifDerogation });
        return ok(c);
      }
      case 'clients': {
        const existe = await this.ds.getRepository(Client).findOneBy({ id: op.id });
        if (existe) throw new Error('Client existant : utiliser une demande de modification.');
        return ok(await this.clients.creer(user, { ...p, id: op.id }));
      }
      case 'demandesModification': {
        if (!p.clientId || !p.changements) throw new Error('clientId et changements requis.');
        return ok(await this.clients.demanderModification(user, p.clientId, p.changements, op.id));
      }
      default:
        throw new Error(`Table ${op.table} non modifiable depuis le mobile.`);
    }
  }
}
