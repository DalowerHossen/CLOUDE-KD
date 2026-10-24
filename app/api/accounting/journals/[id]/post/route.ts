// path: app/api/accounting/journals/[id]/post/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { submitDraft } from '@/services/accounting/journals';

export const POST = withApi(
  {
    id: 'accounting.journals.post',
    scope: 'tenant',
    permission: { action: 'accounting.journal.create', resourceType: 'journal_entry' },
    params: z.object({ id: z.string().uuid() }).strict(),
    idempotent: true,
    auditExempt: 'The journal service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await submitDraft(actor, params.id) };
  },
);
