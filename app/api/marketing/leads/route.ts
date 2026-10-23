// path: app/api/marketing/leads/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listLeads, updateLead } from '@/services/marketing/leads';
import { leadUpdateSchema } from '@/services/marketing/schemas';

export const GET = withApi(
  {
    id: 'marketing.leads.list',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'leads.read', resourceType: 'lead' },
  },
  async () => ({ data: await listLeads() }),
);

export const POST = withApi(
  {
    id: 'marketing.leads.update',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'leads.edit', resourceType: 'lead' },
    body: leadUpdateSchema,
    auditExempt: 'The leads service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await updateLead(actor, body);
    return { data: { done: true } };
  },
);
