import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CHAMPS_CLIENT_MODIFIABLES } from '@medforce/core';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { AuthUser, ROLES_SUPERVISION } from '../../common/auth';
import { ScopeService } from '../../common/scope.service';
import { badRequest, conflict, notFound } from '../../common/errors';
import { nextCounter } from '../../database/dialect';
import { ilike } from '../../database/dialect';
import { AffectationHisto, Client, DemandeModification, Secteur, Utilisateur, Visite } from '../../entities';

export interface FiltreClients {
  q?: string;
  rpId?: string;
  statut?: string;
  ciblage?: string;
  secteurId?: string;
  page?: number;
  taille?: number;
}

/** Champs que seul le back-office (ou X3) peut renseigner. */
const CHAMPS_BACKOFFICE = ['raisonSociale', 'categorie', 'codeX3', 'identifiantFiscal', 'registreCommerce', 'patente', 'ice', 'numeroAutorisation', 'dateAutorisation', 'dateInstallation', 'ville', 'rpId'];

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client) private readonly repo: Repository<Client>,
    @InjectRepository(DemandeModification) private readonly demandes: Repository<DemandeModification>,
    private readonly scope: ScopeService,
    private readonly ds: DataSource,
  ) {}

  async liste(user: AuthUser, f: FiltreClients) {
    const taille = Math.min(Number(f.taille) || 50, 500);
    const page = Math.max(Number(f.page) || 1, 1);
    const qb = this.repo.createQueryBuilder('c').where('c.deletedAt IS NULL');
    await this.scope.appliquerPerimetreClients(qb, user);
    if (f.q) qb.andWhere(`(${ilike('c.raisonSociale', 'q')} OR ${ilike('c.pharmacienNom', 'q')} OR c.codeX3 = :qExact)`, { q: `%${f.q}%`, qExact: f.q });
    if (f.rpId) qb.andWhere('c.rpId = :rpId', { rpId: f.rpId });
    if (f.statut) qb.andWhere('c.statut = :statut', { statut: f.statut });
    if (f.ciblage) qb.andWhere('c.ciblage = :ciblage', { ciblage: f.ciblage });
    if (f.secteurId) {
      const s = await this.ds.getRepository(Secteur).findOneBy({ id: f.secteurId });
      if (s) qb.andWhere('c.secteurChemin LIKE :chemin', { chemin: `${s.chemin}%` });
    }
    const [items, total] = await qb.orderBy('c.raisonSociale', 'ASC').addOrderBy('c.id', 'ASC').skip((page - 1) * taille).take(taille).getManyAndCount();
    return { items, total, page, taille };
  }

  async get(user: AuthUser, id: string) {
    const qb = this.repo.createQueryBuilder('c').where('c.id = :id', { id });
    await this.scope.appliquerPerimetreClients(qb, user);
    const c = await qb.getOne();
    if (!c) throw notFound('Client');
    return c;
  }

  private async resoudreSecteur(m: EntityManager, sousSecteurId?: string | null) {
    if (!sousSecteurId) return null;
    const s = await m.findOneBy(Secteur, { id: sousSecteurId });
    if (!s) throw badRequest('Nœud de sectorisation inconnu.');
    return s;
  }

  /**
   * Création d'un client (mobile ou back-office). Le client est créé « non validé » et une demande
   * de création part dans le circuit de validation. Le RP créateur peut le visiter immédiatement.
   */
  async creer(user: AuthUser, data: Partial<Client>, m: EntityManager = this.ds.manager) {
    if (!data.raisonSociale) throw badRequest('La raison sociale est obligatoire.');
    return m.transaction(async (tx) => {
      if (data.id && (await tx.findOneBy(Client, { id: data.id }))) throw conflict('Client déjà existant.');
      const secteur = await this.resoudreSecteur(tx, data.sousSecteurId);
      const createur = await tx.findOneBy(Utilisateur, { id: user.id });
      const supervision = ROLES_SUPERVISION.includes(user.role);
      const c = tx.create(Client, {
        ...this.filtrer(data, supervision),
        raisonSociale: data.raisonSociale,
        id: data.id,
        code: Number(await nextCounter(tx, 'client_code')),
        statut: 'CREE_NON_VALIDE',
        secteurChemin: secteur?.chemin ?? null,
        rpId: data.rpId ?? (user.role === 'RP' ? user.id : null),
        createurId: user.id,
        operateurCreation: createur ? `${createur.prenom} ${createur.nom}` : user.login,
        createdBy: user.id,
        updatedBy: user.id,
      });
      const saved = await tx.save(c);
      await tx.save(
        tx.create(DemandeModification, {
          type: 'CREATION',
          clientId: saved.id,
          changements: {},
          statut: 'EN_ATTENTE',
          demandeurId: user.id,
          createdBy: user.id,
        }),
      );
      return saved;
    });
  }

  private filtrer(data: Partial<Client>, supervision: boolean): Partial<Client> {
    const autorises = new Set<string>([...CHAMPS_CLIENT_MODIFIABLES, ...(supervision ? CHAMPS_BACKOFFICE : [])]);
    return Object.fromEntries(Object.entries(data).filter(([k]) => autorises.has(k))) as Partial<Client>;
  }

  /**
   * Demande de modification : seuls les champs modifiables sont acceptés ; l'ancienne et la nouvelle
   * valeur sont conservées pour l'écran de validation.
   */
  async demanderModification(user: AuthUser, clientId: string, data: Record<string, unknown>, id?: string, m: EntityManager = this.ds.manager) {
    const client = await this.get(user, clientId);
    const autorises = new Set<string>([...CHAMPS_CLIENT_MODIFIABLES, ...(ROLES_SUPERVISION.includes(user.role) ? CHAMPS_BACKOFFICE : [])]);
    const refuses = Object.keys(data).filter((k) => !autorises.has(k));
    if (refuses.length) throw badRequest(`Champs non modifiables : ${refuses.join(', ')}`);
    const changements: DemandeModification['changements'] = {};
    for (const [k, v] of Object.entries(data)) {
      const ancien = (client as any)[k] ?? null;
      if (JSON.stringify(ancien) !== JSON.stringify(v ?? null)) changements[k] = { ancien, nouveau: v ?? null };
    }
    if (Object.keys(changements).length === 0) throw badRequest('Aucune modification.');
    return m.save(
      m.create(DemandeModification, { id, type: 'MODIFICATION', clientId, changements, statut: 'EN_ATTENTE', demandeurId: user.id, createdBy: user.id }),
    );
  }

  async listeDemandes(user: AuthUser, statut?: string) {
    const where: any = { deletedAt: IsNull() };
    if (statut) where.statut = statut;
    if (!this.scope.isNational(user)) where.demandeurId = In(await this.scope.equipe(user.id));
    return this.demandes.find({ where, order: { createdAt: 'DESC' }, take: 500 });
  }

  /**
   * Circuit de validation : pré-validation par un responsable hiérarchique du demandeur, puis validation
   * définitive par le back-office (coordinateur / admin).
   */
  async traiterDemande(user: AuthUser, id: string, decision: 'PREVALIDER' | 'VALIDER' | 'REJETER', opts: { motif?: string; clientReaffectationId?: string } = {}) {
    return this.ds.transaction(async (m) => {
      const d = await m.findOneBy(DemandeModification, { id });
      if (!d) throw notFound('Demande');
      if (!['EN_ATTENTE', 'PRE_VALIDEE'].includes(d.statut)) throw conflict('Demande déjà traitée.');
      const client = await m.findOneByOrFail(Client, { id: d.clientId });

      if (decision === 'PREVALIDER') {
        const equipe = await this.scope.equipe(user.id);
        if (!equipe.includes(d.demandeurId) || d.demandeurId === user.id) throw badRequest('Seul un responsable hiérarchique du demandeur peut pré-valider.');
        Object.assign(d, { statut: 'PRE_VALIDEE', prevalidateurId: user.id, datePrevalidation: new Date(), updatedBy: user.id });
        return m.save(d);
      }
      if (!['ADMIN', 'COORDINATEUR'].includes(user.role)) throw badRequest('Validation réservée au back-office.');

      if (decision === 'REJETER') {
        Object.assign(d, { statut: 'REJETEE', validateurId: user.id, dateValidation: new Date(), motifRejet: opts.motif ?? null, updatedBy: user.id });
        if (d.type === 'CREATION') {
          // Doublon : réaffectation des visites réalisées vers le bon compte client (Gap Analysis).
          if (opts.clientReaffectationId) {
            const visites = await m.findBy(Visite, { clientId: client.id });
            for (const v of visites) await m.save(Object.assign(v, { clientId: opts.clientReaffectationId, updatedBy: user.id }));
            d.clientReaffectationId = opts.clientReaffectationId;
          }
          Object.assign(client, { statut: 'ANNULE', deletedAt: new Date(), updatedBy: user.id });
          await m.save(client);
        }
        return m.save(d);
      }

      // VALIDER
      if (d.type === 'CREATION') {
        client.statut = client.codeX3 ? 'ACTIF' : 'VALIDE_SANS_X3';
      } else {
        const ancienRp = client.rpId;
        for (const [k, { nouveau }] of Object.entries(d.changements)) (client as any)[k] = nouveau;
        if ('sousSecteurId' in d.changements) client.secteurChemin = (await this.resoudreSecteur(m, client.sousSecteurId))?.chemin ?? null;
        if (ancienRp !== client.rpId) await this.historiserRp(m, client.id, ancienRp, client.rpId, user.id);
      }
      client.updatedBy = user.id;
      await m.save(client);
      Object.assign(d, { statut: 'VALIDEE', validateurId: user.id, dateValidation: new Date(), updatedBy: user.id });
      return m.save(d);
    });
  }

  private historiserRp(m: EntityManager, clientId: string, ancien: string | null, nouveau: string | null, auteurId: string) {
    return m.save(m.create(AffectationHisto, { type: 'CLIENT_RP', cibleId: clientId, ancienneValeur: ancien, nouvelleValeur: nouveau, dateEffet: new Date(), auteurId }));
  }

  /** Affectation en masse des clients à un RP : écrase l'affectation, historique conservé. */
  async affecterEnMasse(user: AuthUser, clientIds: string[], rpId: string) {
    return this.ds.transaction(async (m) => {
      const rp = await m.findOneBy(Utilisateur, { id: rpId });
      if (!rp) throw notFound('RP');
      const clients = await m.findBy(Client, { id: In(clientIds) });
      for (const c of clients) {
        if (c.rpId === rpId) continue;
        await this.historiserRp(m, c.id, c.rpId, rpId, user.id);
        await m.save(Object.assign(c, { rpId, updatedBy: user.id }));
      }
      return { affectes: clients.length };
    });
  }

  historiqueAffectations(clientId: string) {
    return this.ds.getRepository(AffectationHisto).find({ where: { cibleId: clientId, type: 'CLIENT_RP' }, order: { dateEffet: 'DESC' } });
  }

  /** Mise à jour des données issues de Sage X3 (synchronisation partielle). Rapprochement par code interne. */
  async majDepuisX3(lignes: Partial<Client>[], auteurId: string) {
    let maj = 0;
    let ignores = 0;
    for (const l of lignes) {
      const c = l.code != null ? await this.repo.findOneBy({ code: Number(l.code) }) : null;
      if (!c) {
        ignores++; // pas de code interne ou code inexistant : pas de mise à jour (Gap Analysis)
        continue;
      }
      const champsX3 = ['codeX3', 'raisonSociale', 'categorie', 'identifiantFiscal', 'registreCommerce', 'patente', 'ice', 'numeroAutorisation', 'dateAutorisation', 'bloque', 'contentieux', 'plafondEncours', 'encoursCommercial'];
      for (const k of champsX3) if (k in l) (c as any)[k] = (l as any)[k];
      if (c.codeX3 && c.statut === 'VALIDE_SANS_X3') c.statut = 'ACTIF';
      c.updatedBy = auteurId;
      await this.repo.save(c);
      maj++;
    }
    return { misAJour: maj, ignores };
  }
}
