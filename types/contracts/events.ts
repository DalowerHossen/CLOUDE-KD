// path: types/contracts/events.ts
import type { DomainEvent, DomainEventName } from '@/types/events';

export interface EventService {
  /** Writes the event to the domain_events outbox in the caller's transaction when one is active. */
  publish<N extends DomainEventName>(event: Omit<DomainEvent<N>, 'id' | 'occurredAt' | 'correlationId'>): Promise<void>;
}

export type { DomainEvent, DomainEventName };
