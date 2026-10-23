// path: app/api/whatsapp/contacts/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listContacts } from '@/services/whatsapp/contacts';

export const GET = withApi(
  {
    id: 'whatsapp.contacts.list',
    scope: 'tenant',
    permission: { action: 'whatsapp.read', resourceType: 'whatsapp_contact' },
    query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listContacts(actor.companyId, query.limit) };
  },
);
