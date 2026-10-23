// path: app/api/accounting/journals/attachments/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { attachmentLink, removeAttachment } from '@/services/accounting/attachments';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'accounting.attachments.link',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'journal_entry' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: { url: await attachmentLink(actor.companyId, p.id) } };
  },
);

export const DELETE = withApi(
  {
    id: 'accounting.attachments.remove',
    scope: 'tenant',
    permission: { action: 'accounting.journal.create', resourceType: 'journal_entry' },
    params,
    auditExempt: 'The attachment service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    await removeAttachment(actor, p.id);
    return { data: { removed: true } };
  },
);
