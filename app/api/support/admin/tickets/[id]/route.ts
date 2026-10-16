// path: app/api/support/admin/tickets/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { agentTicketActionSchema } from '@/lib/support/rules';
import { agentDetail, runAgentAction } from '@/services/support/tickets';

const params = z.object({ id: z.string().uuid() }).strict();
const permission = { action: 'support.agent', resourceType: 'support_ticket' } as const;

export const GET = withApi(
  { id: 'support.admin.detail', scope: 'platform', networkContext: 'admin', permission, params },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await agentDetail(actor, p.id) };
  },
);

export const POST = withApi(
  {
    id: 'support.admin.action',
    scope: 'platform',
    networkContext: 'admin',
    permission,
    params,
    body: agentTicketActionSchema,
    auditExempt: 'The service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    await runAgentAction(actor, p.id, body);
    return { data: { done: true } };
  },
);
