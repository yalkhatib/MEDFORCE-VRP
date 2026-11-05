import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { chevauchement, dateDuJour, genererPlanTournee, semaineCloturee, semaineFin, semaineIso } from '@medforce/core';
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { AuthUser } from '../../common/auth';
import { badRequest, conflict, notFound } from '../../common/errors';
import { ScopeService } from '../../common/scope.service';
import { Client, Cycle, Planification, Secteur, Visite } from '../../entities';
import { SemaineCycle, SemainePlan } from '../../entities/planification.entity';

const aujourdHui = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class PlanificationService {
  constructor(
    @InjectRepository(Cycle) private readonly cycles: Repository<Cycle>,
    @InjectRepository(Planification) private readonly plans: Repository<Planification>,
    @InjectRepository(Visite) private readonly visitesRepo: Repository<Visite>,
    private readonly scope: ScopeService,
    private readonly ds: DataSource,
  ) {}

  // ---------------------------------------------------------------- Cycles
  listeCycles(rpId: string) {
    return this.cycles.find({ where: { rpId, deletedAt: IsNull() }, order: { createdAt: 'DESC' } });
  }

  async enregistrerCycle(user: AuthUser, data: { id?: string; rpId: string; libelle: string; actif?: boolean; semaines: SemaineCycle[] }) {
    if (!data.semaines?.length) throw badRequest('Le cycle doit comporter au moins une semaine.');
    data.semaines.forEach((s, i) => (s.numero = i + 1));
    return this.ds.transaction(async (m) => {
      const c = (data.id && (await m.findOneBy(Cycle, { id: data.id }))) || m.create(Cycle, { id: data.id, createdBy: user.id });
      Object.assign(c, { rpId: data.rpId, libelle: data.libelle, semaines: data.semaines, updatedBy: user.id });
      if (data.actif) await this.activer(m, c, user.id);
      return m.save(c);
    });
  }

  /** Un seul cycle actif à la fois par RP : l'activation désactive (avec date) les autres. */
  private async activer(m: EntityManager, c: Cycle, userId: string) {
    const autres = await m.findBy(Cycle, { rpId: c.rpId, actif: true, ...(c.id ? { id: Not(c.id) } : {}) });
    for (const a of autres) await m.save(Object.assign(a, { actif: false, dateDesactivation: aujourdHui(), updatedBy: userId }));
    c.actif = true;
    c.dateDesactivation = null;
  }

  async dupliquerCycle(user: AuthUser, id: string) {
    const c = await this.cycles.findOneBy({ id });
    if (!c) throw notFound('Cycle');
    return this.cycles.save(this.cycles.create({ rpId: c.rpId, libelle: `${c.libelle} (copie)`, actif: false, semaines: c.semaines, createdBy: user.id }));
  }

  // ---------------------------------------------------------- Planifications
  listePlans(rpId: string) {
    return this.plans.find({ where: { rpId, deletedAt: IsNull() }, order: { semaineDebut: 'ASC' } });
  }

  async creerPlan(user: AuthUser, data: { id?: string; rpId: string; semaineDebut: string; nombreSemaines: number; premiereSemaineCycle?: number }) {
    const cycle = await this.cycles.findOneBy({ rpId: data.rpId, actif: true });
    if (!cycle) throw badRequest('Aucun cycle actif pour ce RP.');
    const existants = await this.plans.find({ where: { rpId: data.rpId, deletedAt: IsNull(), statut: Not('SUPPRIMEE') } });
    const nouveau = { id: 'new', semaineDebut: data.semaineDebut, nombreSemaines: data.nombreSemaines };
    const conflit = existants.find((p) => chevauchement(p, nouveau));
    if (conflit) throw conflict(`Chevauchement avec la planification ${conflit.semaineDebut} → ${semaineFin(conflit)}.`);
    const semaines = this.construireSemaines(cycle, data.semaineDebut, data.nombreSemaines, data.premiereSemaineCycle ?? 1);
    return this.plans.save(
      this.plans.create({
        id: data.id,
        rpId: data.rpId,
        cycleId: cycle.id,
        semaineDebut: data.semaineDebut,
        nombreSemaines: data.nombreSemaines,
        premiereSemaineCycle: data.premiereSemaineCycle ?? 1,
        statut: 'BROUILLON',
        semaines,
        createdBy: user.id,
      }),
    );
  }

  private construireSemaines(cycle: Cycle, debut: string, nb: number, premiere: number): SemainePlan[] {
    return genererPlanTournee({ semaineDebut: debut, nombreSemaines: nb, tailleCycle: cycle.semaines.length, premiereSemaineCycle: premiere }).map((s) => {
      const sc = cycle.semaines[s.semaineCycle - 1];
      return { semaine: s.semaine, semaineCycle: s.semaineCycle, noeuds: sc.noeuds, jours: sc.jours };
    });
  }

  async validerPlan(user: AuthUser, id: string) {
    const p = await this.plans.findOneBy({ id });
    if (!p) throw notFound('Planification');
    if (p.statut !== 'BROUILLON') throw conflict('Seule une planification brouillon peut être validée.');
    return this.plans.save(Object.assign(p, { statut: 'VALIDEE', validateurId: user.id, updatedBy: user.id }));
  }

  /**
   * Modification d'une semaine d'une planification : interdite si la semaine est clôturée.
   * Après validation, la planification est flaguée « modifiée après validation ».
   */
  async modifierSemaine(user: AuthUser, id: string, semaine: string, jours: Record<string, string[]>) {
    const p = await this.plans.findOneBy({ id });
    if (!p) throw notFound('Planification');
    if (semaineCloturee(semaine, aujourdHui())) throw conflict('Une semaine clôturée ne peut pas être modifiée.');
    const s = p.semaines.find((x) => x.semaine === semaine);
    if (!s) throw notFound('Semaine');
    s.jours = jours;
    s.noeuds = [...new Set([...s.noeuds, ...Object.values(jours).flat()])];
    p.semaines = [...p.semaines];
    if (p.statut !== 'BROUILLON') p.modifieeApresValidation = true;
    p.updatedBy = user.id;
    return this.plans.save(p);
  }

  /** Suppression d'une planification non entamée ; les visites planifiées non réalisées sont supprimées. */
  async supprimerPlan(user: AuthUser, id: string) {
    return this.ds.transaction(async (m) => {
      const p = await m.findOneBy(Planification, { id });
      if (!p) throw notFound('Planification');
      if (semaineIso(aujourdHui()) >= p.semaineDebut) throw conflict('Planification déjà entamée : suppression impossible.');
      const vis = await m.findBy(Visite, { planificationId: id, statut: 'PLANIFIEE' });
      for (const v of vis) await m.save(Object.assign(v, { deletedAt: new Date(), statut: 'ANNULEE', updatedBy: user.id }));
      return m.save(Object.assign(p, { statut: 'SUPPRIMEE', deletedAt: new Date(), updatedBy: user.id }));
    });
  }

  // ------------------------------------------------------- Visites planifiées
  /**
   * Planifie des visites pour une semaine. Les pharmacies hors des nœuds du plan de tournée sont acceptées
   * (pas de double validation) mais flaguées « hors plan » pour alerter le responsable (Gap Analysis).
   */
  async planifierVisites(user: AuthUser, data: { rpId: string; semaine: string; visites: { id?: string; clientId: string; jour: number; obligatoire?: boolean }[] }) {
    return this.ds.transaction(async (m) => {
      const plan = (await m.find(Planification, { where: { rpId: data.rpId, deletedAt: IsNull() } })).find(
        (p) => p.semaineDebut <= data.semaine && semaineFin(p) >= data.semaine && p.statut !== 'SUPPRIMEE',
      );
      const semainePlan = plan?.semaines.find((s) => s.semaine === data.semaine);
      const noeuds = semainePlan ? await m.findBy(Secteur, { id: In(semainePlan.noeuds.length ? semainePlan.noeuds : ['00000000-0000-0000-0000-000000000000']) }) : [];
      const clients = await m.findBy(Client, { id: In(data.visites.map((v) => v.clientId)) });
      const parId = new Map(clients.map((c) => [c.id, c]));
      const out: Visite[] = [];
      for (const v of data.visites) {
        const client = parId.get(v.clientId);
        if (!client) throw notFound(`Client ${v.clientId}`);
        if (v.jour < 1 || v.jour > 7) throw badRequest('Jour invalide (1 = lundi … 7 = dimanche).');
        const horsPlan = !noeuds.some((n) => (client.secteurChemin ?? '').startsWith(n.chemin));
        out.push(
          await m.save(
            m.create(Visite, {
              id: v.id,
              clientId: client.id,
              rpId: data.rpId,
              planificationId: plan?.id ?? null,
              semaine: data.semaine,
              datePrevue: dateDuJour(data.semaine, v.jour),
              statut: 'PLANIFIEE',
              obligatoire: !!v.obligatoire,
              horsPlan,
              createdBy: user.id,
            }),
          ),
        );
      }
      if (plan && plan.statut !== 'BROUILLON' && out.some((v) => v.horsPlan)) await m.save(Object.assign(plan, { modifieeApresValidation: true, updatedBy: user.id }));
      return out;
    });
  }

  async visites(user: AuthUser, f: { rpId?: string; du?: string; au?: string; clientId?: string }) {
    const qb = this.visitesRepo.createQueryBuilder('v').where('v.deletedAt IS NULL');
    const equipe = this.scope.isNational(user) ? null : await this.scope.equipe(user.id);
    if (equipe) qb.andWhere('v.rpId IN (:...equipe)', { equipe });
    if (f.rpId) qb.andWhere('v.rpId = :rp', { rp: f.rpId });
    if (f.clientId) qb.andWhere('v.clientId = :cl', { cl: f.clientId });
    if (f.du) qb.andWhere('v.datePrevue >= :du', { du: f.du });
    if (f.au) qb.andWhere('v.datePrevue <= :au', { au: f.au });
    return qb.orderBy('v.datePrevue', 'ASC').take(2000).getMany();
  }

  /**
   * Rapport de visite (mobile ou back-office). Une visite non planifiée est créée « hors plan » et rattachée
   * automatiquement à la planification si le sous-secteur est planifié dans la semaine.
   */
  async enregistrerVisite(user: AuthUser, data: Partial<Visite> & { clientId: string }, m: EntityManager = this.ds.manager) {
    return m.transaction(async (tx) => {
      const existante = data.id ? await tx.findOneBy(Visite, { id: data.id }) : null;
      if (existante && existante.rpId !== user.id && user.role === 'RP') throw notFound('Visite');
      const v = existante ?? tx.create(Visite, { id: data.id, rpId: user.id, statut: 'REALISEE', horsPlan: true, createdBy: user.id });
      const champs = ['clientId', 'statut', 'debut', 'fin', 'latitudeDebut', 'longitudeDebut', 'distanceClientM', 'horsZone', 'activites', 'commentaire', 'motifHorsPlan', 'typeVisite'] as const;
      for (const k of champs) if (k in data) (v as any)[k] = (data as any)[k];
      const date = (v.debut ? new Date(v.debut) : new Date()).toISOString().slice(0, 10);
      v.datePrevue = v.datePrevue ?? date;
      v.semaine = v.semaine ?? semaineIso(date);
      if (!existante) {
        const client = await tx.findOneBy(Client, { id: v.clientId });
        if (!client) throw notFound('Client');
        if (client.statut === 'CREE_NON_VALIDE' && client.createurId === user.id && !data.typeVisite) v.typeVisite = 'CREATION';
        const plan = (await tx.find(Planification, { where: { rpId: v.rpId, deletedAt: IsNull() } })).find((p) => p.semaines.some((s) => s.semaine === v.semaine));
        if (plan) {
          const s = plan.semaines.find((x) => x.semaine === v.semaine)!;
          const noeuds = s.noeuds.length ? await tx.findBy(Secteur, { id: In(s.noeuds) }) : [];
          if (noeuds.some((n) => (client.secteurChemin ?? '').startsWith(n.chemin))) v.planificationId = plan.id;
        }
      }
      v.updatedBy = user.id;
      return tx.save(v);
    });
  }
}
