// path: app/api/integrations/messaging/messages/[id]/retry/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { retryMessage } from '@/services/messaging/routing';

export const POST = withApi(
  {
    id: 'messaging.messages.retry',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.manage', resourceType: 'messaging_message' },
    params: z.object({ id: z.string().uuid() }).strict(),
    body: z.object({}).strict(),
    idempotent: true,
    auditExempt: 'The messaging service writes the audit entry.',
  },
  async ({ actor, params }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await retryMessage(actor, params.id) };
  },
);
