// path: app/api/invoices/tax/templates/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { templateApply } from '@/lib/tax/input';
import { TAX_TEMPLATES } from '@/lib/tax/templates';
import { applyTemplate } from '@/services/tax/rates';

export const GET = withApi(
  {
    id: 'tax.templates.list',
    scope: 'tenant',
    permission: { action: 'tax.read', resourceType: 'tax_rate' },
  },
  async () => ({ data: TAX_TEMPLATES }),
);

export const POST = withApi(
  {
    id: 'tax.templates.apply',
    scope: 'tenant',
    permission: { action: 'tax.manage', resourceType: 'tax_rate' },
    body: templateApply,
    auditExempt: 'The tax service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await applyTemplate(actor, body.templateId) };
  },
);
