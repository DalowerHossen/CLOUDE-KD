// path: workers/s15/accounting-posting.event.ts
// Turns the money events of the platform into journal entries through the posting rules table. Safe to run again for the
// same event: the entry is made once per source key.
import type { EventHandlerDefinition } from '@/services/jobs/handler-types';
import { POSTING_EVENTS } from '@/services/accounting/posting-rules';
import { processEvent } from '@/services/accounting/posting';

export const eventHandler: EventHandlerDefinition = {
  id: 'accounting.post',
  events: POSTING_EVENTS,
  async handle(event) {
    await processEvent(event);
  },
};
