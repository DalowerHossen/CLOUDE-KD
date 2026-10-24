// path: app/api/portal/delivery/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { listDeliveries } from '@/services/portal/delivery-proof';
import { PROOF_DOC_TYPES } from '@/services/portal/client-mail';

const deliveryQuery = z.strictObject({
  docType: z.enum(PROOF_DOC_TYPES).optional(),
  docId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** What was sent to clients and what happened to each message; the full address is never returned. */
export const GET = withApi(
  {
    id: 'portal.delivery.list',
    scope: 'tenant',
    permission: { action: 'portal.mail.read', resourceType: 'client_mail' },
    query: deliveryQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listDeliveries(actor.companyId, query) };
  },
);
