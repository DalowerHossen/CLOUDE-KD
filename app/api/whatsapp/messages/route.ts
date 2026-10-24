// path: app/api/whatsapp/messages/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listMessages } from '@/services/whatsapp/send';

export const GET = withApi(
  {
    id: 'whatsapp.messages.list',
    scope: 'tenant',
    permission: { action: 'whatsapp.read', resourceType: 'whatsapp_message' },
    query: z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        contactId: z.string().uuid().optional(),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await listMessages(actor.companyId, {
        limit: query.limit,
        ...(query.contactId ? { contactId: query.contactId } : {}),
      }),
    };
  },
);
