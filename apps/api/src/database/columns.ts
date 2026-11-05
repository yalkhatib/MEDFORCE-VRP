import { Column, ColumnOptions } from 'typeorm';
import { dbType } from './config';

/**
 * Colonnes portables SQL Server / PostgreSQL (dossier d'architecture §4).
 * Ne JAMAIS utiliser le type `timestamp` (rowversion sous SQL Server) ni `jsonb`/`enum`.
 */

export const dateTimeType = () => (dbType() === 'mssql' ? 'datetime2' : 'timestamptz');

export function DateTimeColumn(options: ColumnOptions = {}) {
  return Column({ type: dateTimeType(), nullable: true, ...options } as ColumnOptions);
}

/** Date sans heure, toujours restituée en chaîne « AAAA-MM-JJ » (SQL Server renvoie un objet Date). */
export const dateTransformer = {
  to: (v?: string | Date | null) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  from: (v?: string | Date | null) => (v == null ? v : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)),
};

export function DateColumn(options: ColumnOptions = {}) {
  return Column({ type: 'date', nullable: true, transformer: dateTransformer, ...options } as ColumnOptions);
}

/** Chaîne bornée : nvarchar (Unicode : français, arabe) sous SQL Server, varchar sous PostgreSQL (UTF-8). */
export function StringColumn(length = 255, options: ColumnOptions = {}) {
  return Column({ type: dbType() === 'mssql' ? 'nvarchar' : 'varchar', length, nullable: true, ...options } as ColumnOptions);
}

export function TextColumn(options: ColumnOptions = {}) {
  return Column({ type: dbType() === 'mssql' ? 'nvarchar' : 'text', length: dbType() === 'mssql' ? 'MAX' : undefined, nullable: true, ...options } as ColumnOptions);
}

/** Montants : decimal(18,4) restitués en number. */
export function MoneyColumn(options: ColumnOptions = {}) {
  return Column({
    type: 'decimal',
    precision: 18,
    scale: 4,
    default: 0,
    transformer: { to: (v?: number | null) => v, from: (v?: string | null) => (v == null ? v : Number(v)) },
    ...options,
  } as ColumnOptions);
}

export function QtyColumn(options: ColumnOptions = {}) {
  return MoneyColumn({ precision: 18, scale: 3, ...options });
}

export function BoolColumn(options: ColumnOptions = {}) {
  return Column({ type: dbType() === 'mssql' ? 'bit' : 'boolean', default: false, ...options } as ColumnOptions);
}

/** JSON portable, stocké en texte (nvarchar(max) / text) : pas de type JSON natif ni d'opérateurs JSON en requête. */
export const jsonTransformer = {
  to: (v: unknown) => (v === undefined ? undefined : v === null ? null : JSON.stringify(v)),
  from: (v: string | null) => (v == null || v === '' ? null : JSON.parse(v)),
};

export function JsonColumn(options: ColumnOptions = {}) {
  return Column({
    type: dbType() === 'mssql' ? 'nvarchar' : 'text',
    length: dbType() === 'mssql' ? 'MAX' : undefined,
    nullable: true,
    transformer: jsonTransformer,
    ...options,
  } as ColumnOptions);
}

/** SQL Server renvoie les uniqueidentifier en MAJUSCULES : normalisation en minuscules à la lecture. */
export const uuidTransformer = {
  to: (v?: string | null) => v,
  from: (v?: string | null) => (typeof v === 'string' ? v.toLowerCase() : v),
};

export function UuidColumn(options: ColumnOptions = {}) {
  return Column({ type: 'uuid', nullable: true, transformer: uuidTransformer, ...options } as ColumnOptions);
}
