// path: app/api/support/tickets/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { ownTicketActionSchema } from '@/lib/support/rules';
import { ownDetail, runOwnAction } from '@/services/support/tickets';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'support.tickets.detail',
    scope: 'tenant',
    permission: { action: 'support.read', resourceType: 'support_ticket' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await ownDetail(actor, p.id) };
  },
);

export const POST = withApi(
  {
    id: 'support.tickets.action',
    scope: 'tenant',
    permission: { action: 'support.create', resourceType: 'support_ticket' },
    params,
    body: ownTicketActionSchema,
    rateLimitPolicy: 'strict',
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    await runOwnAction(actor, p.id, body);
    return { data: { done: true } };
  },
);
