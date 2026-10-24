// path: app/api/whatsapp/messages/template/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { sendTemplateInput } from '@/lib/whatsapp/rules';
import { sendTemplate } from '@/services/whatsapp/send';

/** Sends an approved template to a person who opted in (or whose 24 hour window is open). */
export const POST = withApi(
  {
    id: 'whatsapp.messages.template',
    scope: 'tenant',
    permission: { action: 'whatsapp.send', resourceType: 'whatsapp_message' },
    body: sendTemplateInput,
    idempotent: true,
    auditExempt: 'The send service writes the audit entry.',
  },
  async ({ actor, body, idempotencyKey }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await sendTemplate(actor, body, idempotencyKey) };
  },
);
