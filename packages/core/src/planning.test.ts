import { describe, expect, it } from 'vitest';
import {
  ajouterSemaines,
  chevauchement,
  dateDuJour,
  decalerPlanifications,
  genererPlanTournee,
  lundiSemaine,
  semaineCloturee,
  semaineIso,
} from './planning';
import { numeroProvisoire } from './sync';

describe('Semaines ISO', () => {
  it('calcule la semaine ISO (cas MedForce : 05/10/2026 = 2026-41)', () => {
    expect(semaineIso('2026-10-05')).toBe('2026-41');
    expect(semaineIso('2026-10-11')).toBe('2026-41');
    expect(semaineIso('2027-01-01')).toBe('2026-53');
    expect(lundiSemaine('2026-41')).toBe('2026-10-05');
    expect(dateDuJour('2026-41', 5)).toBe('2026-10-09');
  });

  it('ajoute des semaines en franchissant l’année', () => {
    expect(ajouterSemaines('2026-52', 2)).toBe('2027-01');
    expect(ajouterSemaines('2026-41', -1)).toBe('2026-40');
  });
});

describe('Plan de tournée', () => {
  it('applique le cycle en démarrant à une semaine donnée et boucle', () => {
    const plan = genererPlanTournee({ semaineDebut: '2026-44', nombreSemaines: 6, tailleCycle: 4, premiereSemaineCycle: 3 });
    expect(plan.map((p) => p.semaineCycle)).toEqual([3, 4, 1, 2, 3, 4]);
    expect(plan[5].semaine).toBe('2026-49');
  });

  it('rejette les paramètres invalides', () => {
    expect(() => genererPlanTournee({ semaineDebut: '2026-44', nombreSemaines: 2, tailleCycle: 4, premiereSemaineCycle: 5 })).toThrow();
  });

  it('détecte les chevauchements et décale les planifications suivantes non entamées', () => {
    const a = { id: 'a', semaineDebut: '2026-44', nombreSemaines: 4 };
    const b = { id: 'b', semaineDebut: '2026-47', nombreSemaines: 4 };
    expect(chevauchement(a, b)).toBe(true);
    const res = decalerPlanifications(
      [a, { ...b, semaineDebut: '2026-48' }, { id: 'c', semaineDebut: '2026-52', nombreSemaines: 2, entamee: true }],
      '2026-44',
      2,
    );
    expect(res.map((p) => p.semaineDebut)).toEqual(['2026-44', '2026-50', '2026-52']);
  });

  it('semaine clôturée', () => {
    expect(semaineCloturee('2026-45', '2026-11-05')).toBe(false);
    expect(semaineCloturee('2026-44', '2026-11-05')).toBe(true);
  });

  it('numéro provisoire hors ligne', () => {
    expect(numeroProvisoire('RP012', '2026-11-05', 7)).toBe('RP012-261105-0007');
  });
});
