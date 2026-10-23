// path: workers/onboarding/milestones.event.ts
// Records the first client, first invoice and first payment of a company as milestones and tells the owner. Safe to run
// again for the same event: a milestone is stored once.
import { recordMilestone } from '@/services/company/settings';
import { getService } from '@/lib/container';
import type { EventHandlerDefinition } from '@/services/jobs/handler-types';
import type { DomainEventName } from '@/types/events';

const MAP: Partial<Record<DomainEventName, { milestone: string; title: string; body: string }>> = {
  'client.created': {
    milestone: 'first_client',
    title: 'First client added',
    body: 'You added your first client. Next: send an invoice.',
  },
  'invoice.created': {
    milestone: 'first_invoice',
    title: 'First invoice created',
    body: 'Your first invoice is ready. Send it with a secure payment link.',
  },
  'payment.captured': {
    milestone: 'first_payment',
    title: 'First payment received',
    body: 'Your first payment arrived. Well done.',
  },
  'kyc.approved': {
    milestone: 'kyc_approved',
    title: 'Business verified',
    body: 'Your business is verified.',
  },
};

export const eventHandler: EventHandlerDefinition = {
  id: 'onboarding.milestones',
  events: Object.keys(MAP) as DomainEventName[],
  async handle(event) {
    const rule = MAP[event.name];
    if (!rule || !event.companyId) return;
    if (!(await recordMilestone(event.companyId, rule.milestone))) return;
    await getService('notification').notify({
      companyId: event.companyId,
      type: `milestone.${rule.milestone}`,
      title: rule.title,
      body: rule.body,
    });
  },
};
