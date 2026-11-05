import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configurerApp } from '../src/bootstrap';
import { dbType } from '../src/database/config';
import { MOT_DE_PASSE_DEMO, seed } from '../src/database/seed-data';

process.env.DB_NAME = process.env.DB_NAME_TEST ?? process.env.DB_NAME ?? 'medforce_vrp_test';

/**
 * Démarre l'API sur une base de test réinitialisée. PostgreSQL : schéma créé par les migrations ;
 * SQL Server : par synchronisation des entités tant que les migrations MSSQL ne sont pas générées.
 */
export async function demarrer(): Promise<{ app: INestApplication; ds: DataSource; http: () => request.Agent; token: (login: string) => Promise<string> }> {
  const viaMigrations = (process.env.TEST_SCHEMA ?? (dbType() === 'postgres' ? 'migrations' : 'synchronize')) === 'migrations';
  process.env.DB_DROP_SCHEMA = 'true';
  process.env.DB_SYNCHRONIZE = String(!viaMigrations);
  process.env.DB_MIGRATIONS_RUN = String(viaMigrations);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configurerApp(moduleRef.createNestApplication());
  await app.init();
  const ds = app.get(DataSource);
  await seed(ds);
  const http = () => request.agent(app.getHttpServer());
  const cache = new Map<string, string>();
  const token = async (login: string) => {
    if (!cache.has(login)) {
      const r = await http().post('/api/auth/login').send({ login, password: MOT_DE_PASSE_DEMO }).expect(201);
      cache.set(login, r.body.accessToken);
    }
    return cache.get(login)!;
  };
  return { app, ds, http, token };
}
