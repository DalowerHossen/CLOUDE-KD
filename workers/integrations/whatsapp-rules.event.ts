// path: workers/integrations/whatsapp-rules.event.ts
// Starts the WhatsApp rules that listen to an event. Safe to run again for the same event: a rule handles one event once.
import { RULE_EVENTS } from '@/config/s16-whatsapp';
import type { EventHandlerDefinition } from '@/services/jobs/handler-types';
import { handleRuleEvent } from '@/services/whatsapp/rules';

export const eventHandler: EventHandlerDefinition = {
  id: 'whatsapp.rules',
  events: RULE_EVENTS,
  async handle(event) {
    await handleRuleEvent(event);
  },
};
