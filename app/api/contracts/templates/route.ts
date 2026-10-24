// path: app/api/contracts/templates/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { templateInputSchema } from '@/services/contract/schemas';
import { createTemplate, listTemplates } from '@/services/contract/templates';

export const GET = withApi(
  {
    id: 'contracts.templates.list',
    scope: 'tenant',
    permission: { action: 'contract.read', resourceType: 'contract' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listTemplates(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'contracts.templates.create',
    scope: 'tenant',
    permission: { action: 'contract.create', resourceType: 'contract' },
    body: templateInputSchema,
    maxBodyBytes: 300_000,
    auditExempt: 'The database audit trigger records the change.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await createTemplate(actor, body) };
  },
);
