// path: app/api/accounting/journals/templates/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { deleteTemplate } from '@/services/accounting/journals';

export const DELETE = withApi(
  {
    id: 'accounting.templates.delete',
    scope: 'tenant',
    permission: { action: 'accounting.journal.create', resourceType: 'journal_entry' },
    params: z.object({ id: z.string().uuid() }).strict(),
    auditExempt: 'The journal service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await deleteTemplate(actor, params.id);
    return { data: { deleted: true } };
  },
);
