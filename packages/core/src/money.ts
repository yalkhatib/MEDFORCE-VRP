/** Arrondi monétaire à 2 décimales (demi vers le haut, robuste aux erreurs binaires). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Arrondi quantité à 3 décimales. */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function ttc(ht: number, tauxTva: number): number {
  return round2(ht * (1 + tauxTva / 100));
}
