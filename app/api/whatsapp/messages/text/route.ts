// path: app/api/whatsapp/messages/text/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { sendTextInput } from '@/lib/whatsapp/rules';
import { sendText } from '@/services/whatsapp/send';

/** Sends free text. Only possible while the person's 24 hour window is open and the person did not opt out. */
export const POST = withApi(
  {
    id: 'whatsapp.messages.text',
    scope: 'tenant',
    permission: { action: 'whatsapp.send', resourceType: 'whatsapp_message' },
    body: sendTextInput,
    idempotent: true,
    auditExempt: 'The send service writes the audit entry.',
  },
  async ({ actor, body, idempotencyKey }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await sendText(actor, body, idempotencyKey) };
  },
);
