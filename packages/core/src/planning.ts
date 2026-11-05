/**
 * Règles de planification des tournées (CDC §10, Gap Analysis « Planification des Tournées & Cycles »).
 * Les semaines sont identifiées au format ISO 8601 « AAAA-SS » (ex. 2026-41), comme dans MedForce.
 */

const MS_JOUR = 86_400_000;

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return utc(y, m - 1, d);
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Semaine ISO d'une date (lundi = premier jour). */
export function semaineIso(date: string | Date): string {
  const d = typeof date === 'string' ? parseDate(date) : utc(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const jour = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jour); // jeudi de la semaine
  const debutAnnee = utc(d.getUTCFullYear(), 0, 1);
  const num = Math.ceil(((d.getTime() - debutAnnee.getTime()) / MS_JOUR + 1) / 7);
  return `${d.getUTCFullYear()}-${String(num).padStart(2, '0')}`;
}

/** Lundi d'une semaine ISO. */
export function lundiSemaine(semaine: string): string {
  const [annee, num] = semaine.split('-').map(Number);
  const j4 = utc(annee, 0, 4);
  const lundiS1 = new Date(j4.getTime() - ((j4.getUTCDay() || 7) - 1) * MS_JOUR);
  return formatDate(new Date(lundiS1.getTime() + (num - 1) * 7 * MS_JOUR));
}

export function dimancheSemaine(semaine: string): string {
  return formatDate(new Date(parseDate(lundiSemaine(semaine)).getTime() + 6 * MS_JOUR));
}

export function ajouterSemaines(semaine: string, n: number): string {
  return semaineIso(new Date(parseDate(lundiSemaine(semaine)).getTime() + n * 7 * MS_JOUR));
}

export function ecartSemaines(de: string, a: string): number {
  return Math.round((parseDate(lundiSemaine(a)).getTime() - parseDate(lundiSemaine(de)).getTime()) / (7 * MS_JOUR));
}

/** Date d'un jour (1 = lundi … 7 = dimanche) dans une semaine ISO. */
export function dateDuJour(semaine: string, jour: number): string {
  return formatDate(new Date(parseDate(lundiSemaine(semaine)).getTime() + (jour - 1) * MS_JOUR));
}

export interface SemainePlanifiee {
  semaine: string;
  /** Numéro de la semaine du cycle appliquée (1..N). */
  semaineCycle: number;
}

/**
 * Génère le plan de tournée : à partir de la semaine de début, applique les semaines du cycle
 * en commençant par `premiereSemaineCycle`, sur `nombreSemaines` semaines (peut être ≠ de la taille du cycle).
 */
export function genererPlanTournee(params: {
  semaineDebut: string;
  nombreSemaines: number;
  tailleCycle: number;
  premiereSemaineCycle?: number;
}): SemainePlanifiee[] {
  const { semaineDebut, nombreSemaines, tailleCycle } = params;
  const premiere = params.premiereSemaineCycle ?? 1;
  if (tailleCycle < 1) throw new Error('Le cycle doit comporter au moins une semaine.');
  if (premiere < 1 || premiere > tailleCycle) throw new Error('Première semaine du cycle hors bornes.');
  if (nombreSemaines < 1) throw new Error('Le nombre de semaines doit être ≥ 1.');
  return Array.from({ length: nombreSemaines }, (_, i) => ({
    semaine: ajouterSemaines(semaineDebut, i),
    semaineCycle: ((premiere - 1 + i) % tailleCycle) + 1,
  }));
}

export interface PeriodePlanification {
  id: string;
  semaineDebut: string;
  nombreSemaines: number;
}

export function semaineFin(p: { semaineDebut: string; nombreSemaines: number }): string {
  return ajouterSemaines(p.semaineDebut, p.nombreSemaines - 1);
}

/** Les plages de planification d'un même RP ne doivent pas se chevaucher. */
export function chevauchement(a: PeriodePlanification, b: PeriodePlanification): boolean {
  return !(semaineFin(a) < b.semaineDebut || semaineFin(b) < a.semaineDebut);
}

/**
 * Décalage automatique des planifications qui suivent une planification modifiée / supprimée
 * (Gap Analysis). `delta` en semaines, positif ou négatif. Seules les planifications non entamées
 * démarrant après `apresSemaine` sont décalées.
 */
export function decalerPlanifications<T extends PeriodePlanification & { entamee?: boolean }>(
  planifs: T[],
  apresSemaine: string,
  delta: number,
): T[] {
  return planifs.map((p) =>
    !p.entamee && p.semaineDebut > apresSemaine ? { ...p, semaineDebut: ajouterSemaines(p.semaineDebut, delta) } : p,
  );
}

/** Une semaine est clôturée lorsque son dimanche est passé. */
export function semaineCloturee(semaine: string, aujourdHui: string): boolean {
  return dimancheSemaine(semaine) < aujourdHui.slice(0, 10);
}
