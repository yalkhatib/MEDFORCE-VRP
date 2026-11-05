import { EntityManager } from 'typeorm';
import { dbType } from './config';

/**
 * Seul endroit autorisé pour du SQL spécifique au dialecte.
 */
export async function nextCounter(manager: EntityManager, name: string): Promise<string> {
  // Le verrou de ligne posé par l'UPDATE est conservé jusqu'au commit : les écritures sont
  // sérialisées sur le compteur, donc l'ordre de commit = ordre des numéros (pas de « trou » au pull).
  const sql =
    dbType() === 'mssql'
      ? 'UPDATE sync_counter SET value = value + 1 OUTPUT INSERTED.value AS value WHERE name = @0'
      : 'UPDATE sync_counter SET value = value + 1 WHERE name = $1 RETURNING value';
  let rows = await manager.query(sql, [name]);
  let row = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0][0] : rows[0];
  if (!row) {
    await manager.query(
      dbType() === 'mssql' ? 'INSERT INTO sync_counter (name, value) VALUES (@0, 0)' : 'INSERT INTO sync_counter (name, value) VALUES ($1, 0)',
      [name],
    );
    rows = await manager.query(sql, [name]);
    row = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0][0] : rows[0];
  }
  return String(row.value);
}

/** Recherche insensible à la casse, portable. */
export function ilike(column: string, param: string): string {
  return dbType() === 'mssql' ? `LOWER(${column}) LIKE LOWER(:${param})` : `${column} ILIKE :${param}`;
}
