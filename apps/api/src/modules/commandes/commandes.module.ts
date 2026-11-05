import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { STATUTS_COMMANDE, StatutCommande } from '@medforce/core';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/auth';
import { Commande, CommandeLigne, PackEntity, Produit } from '../../entities';
import { ClientsModule } from '../clients/clients.module';
import { CommandeInput, CommandesService } from './commandes.service';

class StatutDto {
  @IsIn(STATUTS_COMMANDE as unknown as string[]) statut: StatutCommande;
  @IsOptional() @IsString() motif?: string;
  @IsOptional() @IsString() motifDerogation?: string;
}

@Controller('commandes')
class CommandesController {
  constructor(private readonly svc: CommandesService) {}

  @Get() liste(@CurrentUser() u: AuthUser, @Query() f: { statut?: string; clientId?: string; rpId?: string }) {
    return this.svc.liste(u, f);
  }

  /** Calcul à blanc (écran de saisie back-office) : remises, UG, anomalies et paliers suivants. */
  @Post('simulation') simuler(@CurrentUser() u: AuthUser, @Body() body: CommandeInput) {
    return this.svc.simuler(u, body);
  }

  @Post() creer(@CurrentUser() u: AuthUser, @Body() body: CommandeInput) {
    return this.svc.enregistrer(u, body);
  }

  @Put(':id') maj(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: CommandeInput) {
    return this.svc.enregistrer(u, { ...body, id });
  }

  @Get(':id') un(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(u, id);
  }

  @Post(':id/statut') statut(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatutDto) {
    return this.svc.changerStatut(u, id, dto.statut, dto);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Commande, CommandeLigne, PackEntity, Produit]), ClientsModule],
  controllers: [CommandesController],
  providers: [CommandesService],
  exports: [CommandesService],
})
export class CommandesModule {}
