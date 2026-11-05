import { DataSourceOptions } from 'typeorm';
import { ENTITIES } from '../entities';
import { dbType } from './config';
import { SyncSeqSubscriber } from './sync-seq.subscriber';

export function dataSourceOptions(overrides: Partial<DataSourceOptions> = {}): DataSourceOptions {
  const type = dbType();
  const common = {
    entities: ENTITIES,
    subscribers: [SyncSeqSubscriber],
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    dropSchema: process.env.DB_DROP_SCHEMA === 'true',
    migrationsRun: process.env.DB_MIGRATIONS_RUN === 'true',
    logging: process.env.DB_LOGGING === 'true',
    migrations: [`${__dirname}/migrations/${type}/*.{ts,js}`],
  };
  if (type === 'mssql') {
    return {
      type: 'mssql',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 1433),
      username: process.env.DB_USER ?? 'sa',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_NAME ?? 'medforce_vrp',
      options: { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: true },
      ...common,
      ...overrides,
    } as DataSourceOptions;
  }
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? 'medforce',
    password: process.env.DB_PASSWORD ?? 'medforce',
    database: process.env.DB_NAME ?? 'medforce_vrp',
    ...common,
    ...overrides,
  } as DataSourceOptions;
}
