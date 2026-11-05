export type DbType = 'postgres' | 'mssql';

export function dbType(): DbType {
  const t = (process.env.DB_TYPE ?? 'postgres').toLowerCase();
  if (t !== 'postgres' && t !== 'mssql') throw new Error(`DB_TYPE non supporté : ${t}`);
  return t;
}
