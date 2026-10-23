// path: app/api/integrations/messaging/messages/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { messageInput } from '@/lib/messaging/rules';
import { listMessages, submitMessage } from '@/services/messaging/routing';

export const GET = withApi(
  {
    id: 'messaging.messages.list',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.read', resourceType: 'messaging_message' },
    query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }).strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listMessages(actor.companyId, query.limit) };
  },
);

/** Sends a message to one client through the channels of its route. */
export const POST = withApi(
  {
    id: 'messaging.messages.send',
    scope: 'tenant',
    permission: { action: 'integrations.messaging.manage', resourceType: 'messaging_message' },
    body: messageInput,
    idempotent: true,
    auditExempt: 'The messaging service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { status: 201, data: await submitMessage(actor, body) };
  },
);
