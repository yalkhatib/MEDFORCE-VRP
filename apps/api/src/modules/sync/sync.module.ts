import { Body, Controller, Get, Module, Post, Query } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushRequest } from '@medforce/core';
import { AuthUser, CurrentUser } from '../../common/auth';
import { SyncOperationLog } from '../../entities';
import { ClientsModule } from '../clients/clients.module';
import { CommandesModule } from '../commandes/commandes.module';
import { PlanificationModule } from '../planification/planification.module';
import { SyncService } from './sync.service';

@Controller('sync')
class SyncController {
  constructor(private readonly svc: SyncService) {}

  @Get('pull') pull(@CurrentUser() u: AuthUser, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.svc.pull(u, cursor ?? '0', Number(limit) || 500);
  }

  @Post('push') push(@CurrentUser() u: AuthUser, @Body() body: PushRequest) {
    return this.svc.push(u, body);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([SyncOperationLog]), ClientsModule, CommandesModule, PlanificationModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
