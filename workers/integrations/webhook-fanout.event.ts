// path: workers/integrations/webhook-fanout.event.ts
// Writes the deliveries of an event for every webhook endpoint of the company that subscribed to it. Safe to run again for the
// same event: a delivery is made once per event and endpoint.
import { WEBHOOK_EVENTS } from '@/config/s16-api';
import type { EventHandlerDefinition } from '@/services/jobs/handler-types';
import { fanOut } from '@/services/webhookout/dispatch';

export const eventHandler: EventHandlerDefinition = {
  id: 'webhookout.fan-out',
  events: WEBHOOK_EVENTS,
  async handle(event) {
    await fanOut(event);
  },
};
