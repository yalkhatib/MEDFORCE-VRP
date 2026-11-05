import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthUser, CurrentUser, Roles } from '../../common/auth';
import { Client, Cycle, Planification, Secteur, Visite } from '../../entities';
import { ClientsModule } from '../clients/clients.module';
import { PlanificationService } from './planification.service';

@Controller()
class PlanificationController {
  constructor(private readonly svc: PlanificationService) {}

  @Get('cycles') cycles(@Query('rpId') rpId: string) {
    return this.svc.listeCycles(rpId);
  }
  @Roles('COORDINATEUR', 'RESPONSABLE_REGIONAL') @Post('cycles') cycle(@CurrentUser() u: AuthUser, @Body() body: any) {
    return this.svc.enregistrerCycle(u, body);
  }
  @Roles('COORDINATEUR', 'RESPONSABLE_REGIONAL') @Put('cycles/:id') majCycle(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.svc.enregistrerCycle(u, { ...body, id });
  }
  @Roles('COORDINATEUR', 'RESPONSABLE_REGIONAL') @Post('cycles/:id/dupliquer') dupliquer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.dupliquerCycle(u, id);
  }

  @Get('planifications') plans(@Query('rpId') rpId: string) {
    return this.svc.listePlans(rpId);
  }
  @Post('planifications') creer(@CurrentUser() u: AuthUser, @Body() body: any) {
    return this.svc.creerPlan(u, body);
  }
  @Roles('COORDINATEUR', 'RESPONSABLE_REGIONAL') @Post('planifications/:id/valider') valider(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.validerPlan(u, id);
  }
  @Put('planifications/:id/semaines/:semaine') semaine(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('semaine') semaine: string, @Body() body: { jours: Record<string, string[]> }) {
    return this.svc.modifierSemaine(u, id, semaine, body.jours);
  }
  @Delete('planifications/:id') supprimer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.supprimerPlan(u, id);
  }

  @Post('visites/planifier') planifier(@CurrentUser() u: AuthUser, @Body() body: any) {
    return this.svc.planifierVisites(u, body);
  }
  @Get('visites') visites(@CurrentUser() u: AuthUser, @Query() f: any) {
    return this.svc.visites(u, f);
  }
  @Post('visites') visite(@CurrentUser() u: AuthUser, @Body() body: any) {
    return this.svc.enregistrerVisite(u, body);
  }
  @Put('visites/:id') majVisite(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.svc.enregistrerVisite(u, { ...body, id });
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Cycle, Planification, Visite, Client, Secteur]), ClientsModule],
  controllers: [PlanificationController],
  providers: [PlanificationService],
  exports: [PlanificationService],
})
export class PlanificationModule {}
