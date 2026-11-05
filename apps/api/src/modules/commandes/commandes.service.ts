import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Anomalie,
  calculerCommande,
  ContexteCalcul,
  Pack,
  PackSaisi,
  ResultatCommande,
  STATUTS_COMMANDE_MODIFIABLES_RP,
  StatutCommande,
  suggererPaliers,
} from '@medforce/core';
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { AuthUser } from '../../common/auth';
import { badRequest, conflict, notFound } from '../../common/errors';
import { ScopeService } from '../../common/scope.service';
import { nextCounter } from '../../database/dialect';
import { Client, Commande, CommandeLigne, PackEntity, Produit } from '../../entities';
import { ClientsService } from '../clients/clients.service';

export interface CommandeInput {
  id?: string;
  clientId: string;
  dateCommande?: string;
  dateLivraisonSouhaitee?: string | null;
  modeReglement?: string | null;
  priorite?: string | null;
  transporteur?: string | null;
  instanceJours?: number | null;
  commentaire?: string | null;
  numeroProvisoire?: string | null;
  visiteId?: string | null;
  origine?: 'MOBILE' | 'BACKOFFICE';
  packs: PackSaisi[];
}

/** Transitions autorisées du cycle de vie (proposition C5). */
const TRANSITIONS: Record<string, StatutCommande[]> = {
  BROUILLON: ['SAISIE', 'EN_ATTENTE_DEROGATION', 'ANNULEE'],
  CONFIRMEE_RP: ['SAISIE', 'ANNULEE'],
  EN_ATTENTE_DEROGATION: ['SAISIE', 'BROUILLON', 'ANNULEE'],
  SAISIE: ['EN_COURS', 'ANNULEE'],
  EN_COURS: ['VALIDEE', 'SAISIE', 'ANNULEE'],
  VALIDEE: ['TRANSFEREE_X3'],
  TRANSFEREE_X3: ['LIVREE_PARTIEL', 'LIVREE', 'FACTUREE'],
  LIVREE_PARTIEL: ['LIVREE', 'FACTUREE'],
  LIVREE: ['FACTUREE'],
};

export function toCorePack(p: PackEntity): Pack {
  return {
    id: p.id,
    numero: p.numero,
    designation: p.designation,
    typeCondition: p.typeCondition as Pack['typeCondition'],
    categoriePack: p.categoriePack,
    dateDebut: String(p.dateDebut).slice(0, 10),
    dateFin: String(p.dateFin).slice(0, 10),
    actif: p.actif,
    baseSeuil: p.baseSeuil as Pack['baseSeuil'],
    unitaire: p.unitaire,
    nombreMinCores: p.nombreMinCores,
    produits: p.produits ?? [],
    groupes: p.groupes ?? [],
    packsSeuil: p.packsSeuil ?? [],
    conditions: p.conditions ?? [],
    produitsUG: p.produitsUG ?? [],
    eligibilite: p.eligibilite,
    priorite: p.priorite,
    dateDebutCalcul: p.dateDebutCalcul ? String(p.dateDebutCalcul).slice(0, 10) : null,
    dateFinCalcul: p.dateFinCalcul ? String(p.dateFinCalcul).slice(0, 10) : null,
    clientsExclus: p.clientsExclus ?? [],
    maxApplicationsParClient: p.maxApplicationsParClient,
  };
}

@Injectable()
export class CommandesService {
  constructor(
    @InjectRepository(Commande) private readonly repo: Repository<Commande>,
    private readonly ds: DataSource,
    private readonly clients: ClientsService,
    private readonly scope: ScopeService,
  ) {}

  /** Montant minimum : 500 DH pour Casablanca, 2000 DH ailleurs (paramétrable). */
  montantMinimum(client: Client): number {
    const casa = (client.ville ?? '').toLowerCase().includes('casa');
    return Number(casa ? process.env.MIN_COMMANDE_CASA ?? 500 : process.env.MIN_COMMANDE_AUTRES ?? 2000);
  }

  async contexte(m: EntityManager, client: Client, saisie: PackSaisi[], excludeCommandeId?: string): Promise<ContexteCalcul> {
    const packIds = [...new Set(saisie.map((s) => s.packId))];
    const packs = packIds.length ? await m.findBy(PackEntity, { id: In(packIds) }) : [];
    // Packs référencés (seuil / éligibilité) nécessaires au calcul.
    const refs = new Set<string>();
    for (const p of packs) {
      (p.packsSeuil ?? []).forEach((r) => refs.add(r.packId));
      (p.eligibilite?.packs ?? []).forEach((r) => refs.add(r.packId));
    }
    const manquants = [...refs].filter((id) => !packIds.includes(id));
    if (manquants.length) packs.push(...(await m.findBy(PackEntity, { id: In(manquants) })));

    const produitIds = new Set<string>();
    for (const s of saisie) {
      s.lignes.forEach((l) => produitIds.add(l.produitId));
      (s.ug ?? []).forEach((u) => produitIds.add(u.produitId));
    }
    for (const p of packs) (p.produitsUG ?? []).forEach((u) => produitIds.add(u.produitId));
    const produits = produitIds.size ? await m.findBy(Produit, { id: In([...produitIds]) }) : [];

    const historiques = await m.find(Commande, {
      where: { clientId: client.id, statut: Not(In(['BROUILLON', 'ANNULEE'])), deletedAt: IsNull(), ...(excludeCommandeId ? { id: Not(excludeCommandeId) } : {}) },
    });
    const applicationsConsommees: Record<string, number> = {};
    const cumulsHistoriques: Record<string, number> = {};
    for (const p of packs) {
      const core = toCorePack(p);
      const dansValidite = historiques.filter((c) => c.dateCommande >= core.dateDebut && c.dateCommande <= core.dateFin && c.saisie.some((s) => s.packId === p.id));
      applicationsConsommees[p.id] = dansValidite.length;
      if (core.typeCondition === 'CLE') {
        // Cumul des packs du bloc « packs pour calcul du seuil » sur la période de calcul (base = brut HT ou quantités).
        const refsSeuil = new Set(core.packsSeuil.map((r) => r.packId));
        const periode = historiques.filter(
          (c) => (!core.dateDebutCalcul || c.dateCommande >= core.dateDebutCalcul) && (!core.dateFinCalcul || c.dateCommande <= core.dateFinCalcul),
        );
        const lignes = periode.length
          ? await m.findBy(CommandeLigne, { commandeId: In(periode.map((c) => c.id)), packId: In([...refsSeuil]), gratuit: false })
          : [];
        cumulsHistoriques[p.id] = lignes.reduce((acc, l) => acc + (core.baseSeuil === 'QUANTITE' ? l.qte : core.baseSeuil === 'VALEUR_TTC' ? l.montantBrutHT * (1 + l.tauxTva / 100) : l.montantBrutHT), 0);
      }
    }

    return {
      packs: packs.map(toCorePack),
      produits: produits.map((p) => ({ id: p.id, designation: p.designation, prixHT: p.pphHT, tauxTva: p.tauxTva })),
      cumulsHistoriques,
      applicationsConsommees,
      montantMinimumCommande: this.montantMinimum(client),
    };
  }

  /** Contrôles client ajoutés aux anomalies du moteur. */
  private anomaliesClient(client: Client): Anomalie[] {
    const a: Anomalie[] = [];
    if (client.bloque) a.push({ code: 'CLIENT_BLOQUE', bloquante: true, message: 'Client bloqué dans Sage X3 : commande impossible.' });
    if (client.solvabilite === 'INSOLVABLE') a.push({ code: 'CLIENT_INSOLVABLE', bloquante: false, message: 'Attention : client insolvable.' });
    return a;
  }

  async simuler(user: AuthUser, input: CommandeInput) {
    const client = await this.clients.get(user, input.clientId);
    const date = input.dateCommande ?? new Date().toISOString().slice(0, 10);
    const ctx = await this.contexte(this.ds.manager, client, input.packs, input.id);
    const commande = { clientId: client.id, dateCommande: date, packs: input.packs };
    const resultat = calculerCommande(commande, ctx);
    const extra = this.anomaliesClient(client);
    return {
      ...resultat,
      anomalies: [...extra, ...resultat.anomalies],
      valide: resultat.valide && !extra.some((x) => x.bloquante),
      suggestions: suggererPaliers(commande, ctx),
    };
  }

  private async appliquerCalcul(m: EntityManager, c: Commande, client: Client): Promise<ResultatCommande> {
    const ctx = await this.contexte(m, client, c.saisie, c.id);
    const r = calculerCommande({ clientId: client.id, dateCommande: c.dateCommande, packs: c.saisie }, ctx);
    const extra = this.anomaliesClient(client);
    Object.assign(c, {
      anomalies: [...extra, ...r.anomalies],
      valide: r.valide && !extra.some((x) => x.bloquante),
      totalBrutHT: r.totalBrutHT,
      totalRemiseHT: r.totalRemiseHT,
      totalNetHT: r.totalNetHT,
      totalTVA: r.totalTVA,
      totalNetTTC: r.totalNetTTC,
      totalQuantite: r.totalQuantite,
      totalUG: r.totalUG,
    });
    return r;
  }

  private async regenererLignes(m: EntityManager, c: Commande, r: ResultatCommande, userId: string) {
    await m.delete(CommandeLigne, { commandeId: c.id });
    for (const p of r.packs)
      for (const l of [...p.lignes, ...p.lignesUG])
        await m.save(
          m.create(CommandeLigne, {
            commandeId: c.id,
            packId: p.packId,
            produitId: l.produitId,
            qte: l.qte,
            gratuit: l.gratuit,
            prixUnitaireHT: l.prixUnitaireHT,
            tauxTva: l.tauxTva,
            tauxRemise: l.tauxRemise,
            montantBrutHT: l.montantBrutHT,
            montantRemiseHT: l.montantRemiseHT,
            montantNetHT: l.montantNetHT,
            montantNetTTC: l.montantNetTTC,
            createdBy: userId,
          }),
        );
  }

  private historiser(c: Commande, statut: string, par: string | null, motif?: string) {
    c.historiqueStatuts = [...(c.historiqueStatuts ?? []), { statut, date: new Date().toISOString(), par, ...(motif ? { motif } : {}) }];
  }

  /** Création ou mise à jour d'une commande tant qu'elle est modifiable par le RP. */
  async enregistrer(user: AuthUser, input: CommandeInput, m: EntityManager = this.ds.manager): Promise<Commande> {
    const client = await this.clients.get(user, input.clientId);
    return m.transaction(async (tx) => {
      const existante = input.id ? await tx.findOneBy(Commande, { id: input.id }) : null;
      if (existante && !STATUTS_COMMANDE_MODIFIABLES_RP.includes(existante.statut as StatutCommande) && user.role === 'RP')
        throw conflict(`Commande au statut ${existante.statut} : modification impossible.`);
      const c =
        existante ??
        tx.create(Commande, {
          id: input.id,
          numero: `CMD${String(await nextCounter(tx, 'commande_numero')).padStart(8, '0')}`,
          rpId: user.id,
          rpAffecteId: client.rpId,
          sousSecteurId: client.sousSecteurId,
          statut: 'BROUILLON',
          origine: input.origine ?? (user.role === 'RP' ? 'MOBILE' : 'BACKOFFICE'),
          createdBy: user.id,
          historiqueStatuts: [{ statut: 'BROUILLON', date: new Date().toISOString(), par: user.id }],
        });
      Object.assign(c, {
        clientId: client.id,
        dateCommande: input.dateCommande ?? c.dateCommande ?? new Date().toISOString().slice(0, 10),
        dateLivraisonSouhaitee: input.dateLivraisonSouhaitee ?? c.dateLivraisonSouhaitee ?? null,
        modeReglement: input.modeReglement ?? c.modeReglement ?? client.modaliteReglement ?? null,
        priorite: input.priorite ?? c.priorite ?? null,
        transporteur: input.transporteur ?? c.transporteur ?? null,
        instanceJours: input.instanceJours ?? c.instanceJours ?? null,
        commentaire: input.commentaire ?? c.commentaire ?? null,
        numeroProvisoire: input.numeroProvisoire ?? c.numeroProvisoire ?? null,
        visiteId: input.visiteId ?? c.visiteId ?? null,
        saisie: input.packs,
        updatedBy: user.id,
      });
      if (!c.dateLivraisonSouhaitee) {
        const d = new Date(`${c.dateCommande}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1); // par défaut J+1 (24 h)
        c.dateLivraisonSouhaitee = d.toISOString().slice(0, 10);
      }
      const r = await this.appliquerCalcul(tx, c, client);
      const saved = await tx.save(c);
      await this.regenererLignes(tx, saved, r, user.id);
      return saved;
    });
  }

  async get(user: AuthUser, id: string) {
    const c = await this.repo.findOneBy({ id });
    if (!c) throw notFound('Commande');
    if (!this.scope.isNational(user) && !(await this.scope.equipe(user.id)).includes(c.rpId)) throw notFound('Commande');
    const lignes = await this.ds.getRepository(CommandeLigne).find({ where: { commandeId: id } });
    return { ...c, lignes };
  }

  async liste(user: AuthUser, f: { statut?: string; clientId?: string; rpId?: string }) {
    const qb = this.repo.createQueryBuilder('c').where('c.deletedAt IS NULL');
    if (!this.scope.isNational(user)) qb.andWhere('c.rpId IN (:...equipe)', { equipe: await this.scope.equipe(user.id) });
    if (f.statut) qb.andWhere('c.statut IN (:...statuts)', { statuts: f.statut.split(',') });
    if (f.clientId) qb.andWhere('c.clientId = :cl', { cl: f.clientId });
    if (f.rpId) qb.andWhere('c.rpId = :rp', { rp: f.rpId });
    return qb.orderBy('c.dateCommande', 'DESC').addOrderBy('c.numero', 'DESC').take(500).getMany();
  }

  /**
   * Changement de statut. Confirmation RP : si la commande n'est pas conforme, une dérogation peut être
   * demandée (statut EN_ATTENTE_DEROGATION) ; elle est accordée par un responsable.
   */
  async changerStatut(user: AuthUser, id: string, cible: StatutCommande, opts: { motif?: string; motifDerogation?: string } = {}, m: EntityManager = this.ds.manager) {
    return m.transaction(async (tx) => {
      const c = await tx.findOneBy(Commande, { id });
      if (!c) throw notFound('Commande');
      if (!(TRANSITIONS[c.statut] ?? []).includes(cible)) throw conflict(`Transition ${c.statut} → ${cible} non autorisée.`);
      const client = await tx.findOneByOrFail(Client, { id: c.clientId });
      const r = await this.appliquerCalcul(tx, c, client);

      if (cible === 'SAISIE' && c.statut !== 'EN_COURS') {
        if (c.statut === 'EN_ATTENTE_DEROGATION') {
          if (user.role === 'RP') throw badRequest('La dérogation doit être accordée par un responsable.');
          c.derogationValideeParId = user.id;
        } else if (!c.valide) {
          throw badRequest('Commande non conforme : corriger ou demander une dérogation.', c.anomalies);
        }
        c.dateConfirmationRp = c.dateConfirmationRp ?? new Date();
      }
      if (cible === 'EN_ATTENTE_DEROGATION') {
        if (!opts.motifDerogation) throw badRequest('Motif de dérogation obligatoire (tarif, plafond, délai, mode de règlement, quantité).');
        c.motifDerogation = opts.motifDerogation;
        c.dateConfirmationRp = new Date();
      }
      if (cible === 'EN_COURS') c.traiteParId = user.id;
      if (cible === 'VALIDEE') {
        if (!['ADMIN', 'VALIDATEUR_COMMANDES'].includes(user.role)) throw badRequest('Droit de validation des commandes requis.');
        if (!c.valide && !c.derogationValideeParId) throw badRequest('Conditions commerciales non respectées.', c.anomalies);
        c.dateValidation = new Date();
      }
      if (cible === 'ANNULEE' && !opts.motif) throw badRequest("Motif d'annulation obligatoire.");

      c.statut = cible;
      c.updatedBy = user.id;
      this.historiser(c, cible, user.id, opts.motif ?? opts.motifDerogation);
      const saved = await tx.save(c);
      await this.regenererLignes(tx, saved, r, user.id);
      return saved;
    });
  }
}
