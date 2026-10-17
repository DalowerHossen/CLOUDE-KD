// path: app/api/invoices/tax/remit-to/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { remitToSchema } from '@/lib/invoice/remit';
import { getRemitTo, saveRemitTo } from '@/services/invoice/seller';

export const GET = withApi(
  {
    id: 'tax.remit_to.get',
    scope: 'tenant',
    roles: ['owner'],
    permission: { action: 'tax.manage', resourceType: 'tax_settings' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getRemitTo(actor.companyId) };
  },
);

export const PUT = withApi(
  {
    id: 'tax.remit_to.save',
    scope: 'tenant',
    roles: ['owner'],
    permission: { action: 'tax.manage', resourceType: 'tax_settings' },
    body: remitToSchema,
    rateLimitPolicy: 'strict',
    auditExempt: 'The invoice service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await saveRemitTo(actor, body) };
  },
);
