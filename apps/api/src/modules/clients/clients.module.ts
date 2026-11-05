import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IsArray, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../../common/auth';
import { ScopeService } from '../../common/scope.service';
import { AffectationHisto, Client, DemandeModification, Secteur, Utilisateur, Visite } from '../../entities';
import { ClientsService, FiltreClients } from './clients.service';

class AffectationDto {
  @IsArray() @IsUUID('all', { each: true }) clientIds: string[];
  @IsUUID() rpId: string;
}

class DecisionDto {
  @IsIn(['PREVALIDER', 'VALIDER', 'REJETER']) decision: 'PREVALIDER' | 'VALIDER' | 'REJETER';
  @IsOptional() @IsString() motif?: string;
  @IsOptional() @IsUUID() clientReaffectationId?: string;
}

class ImportX3Dto {
  @IsArray() clients: Partial<Client>[];
}

@Controller('clients')
class ClientsController {
  constructor(private readonly svc: ClientsService) {}

  @Get() liste(@CurrentUser() u: AuthUser, @Query() f: FiltreClients) {
    return this.svc.liste(u, f);
  }

  @Get('demandes') demandes(@CurrentUser() u: AuthUser, @Query('statut') statut?: string) {
    return this.svc.listeDemandes(u, statut);
  }

  @Post('demandes/:id/decision') decision(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) {
    return this.svc.traiterDemande(u, id, dto.decision, dto);
  }

  @Roles('COORDINATEUR', 'RESPONSABLE_REGIONAL') @Post('affectation') affecter(@CurrentUser() u: AuthUser, @Body() dto: AffectationDto) {
    return this.svc.affecterEnMasse(u, dto.clientIds, dto.rpId);
  }

  @Roles('COORDINATEUR') @Post('import-x3') importX3(@CurrentUser() u: AuthUser, @Body() dto: ImportX3Dto) {
    return this.svc.majDepuisX3(dto.clients, u.id);
  }

  @Get(':id') un(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(u, id);
  }

  @Get(':id/historique-affectations') histo(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.historiqueAffectations(id);
  }

  @Post() creer(@CurrentUser() u: AuthUser, @Body() body: Partial<Client>) {
    return this.svc.creer(u, body);
  }

  @Post(':id/demande-modification') modifier(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) {
    return this.svc.demanderModification(u, id, body);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Client, DemandeModification, AffectationHisto, Secteur, Utilisateur, Visite])],
  controllers: [ClientsController],
  providers: [ClientsService, ScopeService],
  exports: [ClientsService, ScopeService],
})
export class ClientsModule {}
