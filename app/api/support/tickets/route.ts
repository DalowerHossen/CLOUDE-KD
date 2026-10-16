// path: app/api/support/tickets/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { createTicketSchema, ownListQuery } from '@/lib/support/rules';
import { createTicket, listOwn } from '@/services/support/tickets';

export const GET = withApi(
  {
    id: 'support.tickets.list',
    scope: 'tenant',
    permission: { action: 'support.read', resourceType: 'support_ticket' },
    query: ownListQuery,
  },
  async ({ actor, query }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await listOwn(actor, query.status) };
  },
);

export const POST = withApi(
  {
    id: 'support.tickets.create',
    scope: 'tenant',
    permission: { action: 'support.create', resourceType: 'support_ticket' },
    body: createTicketSchema,
    auditExempt: 'The service writes the audit entry.',
    rateLimitPolicy: 'strict',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await createTicket(actor, body) };
  },
);
