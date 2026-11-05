import { randomUUID } from 'crypto';
import { EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent } from 'typeorm';
import { SyncEntity } from '../entities/base.entity';
import { nextCounter } from './dialect';

/**
 * Attribue un `syncSeq` monotone à chaque écriture d'une entité synchronisable.
 * Toute écriture doit passer par `save()` (pas de `update()` QueryBuilder sur ces tables).
 */
@EventSubscriber()
export class SyncSeqSubscriber implements EntitySubscriberInterface<SyncEntity> {
  async beforeInsert(event: InsertEvent<SyncEntity>) {
    if (!(event.entity instanceof SyncEntity)) return;
    if (!event.entity.id) event.entity.id = randomUUID();
    event.entity.syncSeq = await nextCounter(event.manager, 'global');
  }

  async beforeUpdate(event: UpdateEvent<SyncEntity>) {
    if (!(event.entity instanceof SyncEntity)) return;
    (event.entity as SyncEntity).syncSeq = await nextCounter(event.manager, 'global');
  }
}
