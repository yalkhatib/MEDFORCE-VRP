import { AffectationHisto } from './affectation-histo.entity';
import { Client } from './client.entity';
import { Commande, CommandeLigne } from './commande.entity';
import { DemandeModification } from './demande-modification.entity';
import { PackEntity } from './pack.entity';
import { Cycle, Planification } from './planification.entity';
import { Gamme, Produit } from './produit.entity';
import { Secteur } from './secteur.entity';
import { SyncCounter } from './sync-counter.entity';
import { AuditLog, SyncOperationLog } from './sync-operation.entity';
import { Utilisateur } from './user.entity';
import { Visite } from './visite.entity';

export {
  AffectationHisto, AuditLog, Client, Commande, CommandeLigne, Cycle, DemandeModification, Gamme, PackEntity,
  Planification, Produit, Secteur, SyncCounter, SyncOperationLog, Utilisateur, Visite,
};

export const ENTITIES = [
  AffectationHisto, AuditLog, Client, Commande, CommandeLigne, Cycle, DemandeModification, Gamme, PackEntity,
  Planification, Produit, Secteur, SyncCounter, SyncOperationLog, Utilisateur, Visite,
];
