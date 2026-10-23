// path: app/api/accounting/journals/[id]/attachments/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { MAX_ATTACHMENT_BODY_BYTES } from '@/config/s15-accounting';
import { addAttachment, attachmentInput } from '@/services/accounting/attachments';

export const POST = withApi(
  {
    id: 'accounting.journals.attach',
    scope: 'tenant',
    permission: { action: 'accounting.journal.create', resourceType: 'journal_entry' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: attachmentInput,
    maxBodyBytes: MAX_ATTACHMENT_BODY_BYTES,
    auditExempt: 'The attachment service writes the audit entry.',
  },
  async ({ actor, params, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await addAttachment(actor, params.id, body) };
  },
);
