// path: workers/s13/dispute-intake.event.ts
// Makes the dispute case when a processor opens a dispute, and records the outcome when it decides. Safe to run again
// for the same event: a case is made once per event and per processor dispute.
import { closeDisputeFromEvent, openDisputeFromEvent } from '@/services/dispute/intake';
import type { EventHandlerDefinition } from '@/services/jobs/handler-types';

export const eventHandler: EventHandlerDefinition = {
  id: 'dispute.intake',
  events: ['dispute.opened', 'dispute.won', 'dispute.lost'],
  async handle(event) {
    if (event.name === 'dispute.opened') await openDisputeFromEvent(event);
    else await closeDisputeFromEvent(event, event.name === 'dispute.won' ? 'won' : 'lost');
  },
};
