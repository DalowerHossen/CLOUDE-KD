// path: workers/notifications/domain-events.event.ts
// Turns domain events (invoice, payment, dispute, kyc, auth, subscription, files) into notifications. Safe to run
// again for the same event: the event id is the dedupe key, so a repeat stores nothing.
import { EVENT_RULES, buildFromEvent } from '@/lib/notifications/rules';
import { notifyExtended } from '@/services/notification/notification-service';
import type { EventHandlerDefinition } from '@/services/jobs/handler-types';
import type { DomainEventName } from '@/types/events';

export const eventHandler: EventHandlerDefinition = {
  id: 'notifications.domain-events',
  events: Object.keys(EVENT_RULES) as DomainEventName[],
  async handle(event) {
    if (!event.companyId) return;
    const built = buildFromEvent(event.name, event.payload);
    if (!built) return;
    await notifyExtended(
      {
        companyId: event.companyId,
        type: built.rule.type,
        title: built.rule.title,
        body: built.body,
        href: built.href ?? undefined,
      },
      { dedupeKey: event.id, category: built.rule.category, recipients: built.rule.recipients },
    );
  },
};
