// path: app/api/accounting/journals/templates/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { templateInput } from '@/services/accounting/journal-rules';
import { listTemplates, saveTemplate } from '@/services/accounting/journals';

export const GET = withApi(
  {
    id: 'accounting.templates.list',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'journal_entry' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listTemplates(actor.companyId) };
  },
);

export const POST = withApi(
  {
    id: 'accounting.templates.save',
    scope: 'tenant',
    permission: { action: 'accounting.journal.create', resourceType: 'journal_entry' },
    body: templateInput,
    auditExempt: 'The journal service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await saveTemplate(actor, body) };
  },
);
