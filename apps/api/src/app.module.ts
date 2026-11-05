import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from './common/auth';
import { dataSourceOptions } from './database/options';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { CommandesModule } from './modules/commandes/commandes.module';
import { PlanificationModule } from './modules/planification/planification.module';
import { ReferentielModule } from './modules/referentiel/referentiel.module';
import { SyncModule } from './modules/sync/sync.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({ useFactory: () => dataSourceOptions() }),
    JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: process.env.JWT_SECRET ?? 'dev-secret-change-me' }) }),
    AuthModule,
    ReferentielModule,
    ClientsModule,
    CommandesModule,
    PlanificationModule,
    SyncModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
