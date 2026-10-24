// path: app/api/integrations/settlement/entries/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { entriesBatch } from '@/lib/gateway/split-rules';
import { listEntries, postEntries } from '@/services/gateway/entries';

const query = z
  .object({
    subMerchantId: z.string().uuid(),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    before: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const GET = withApi(
  {
    id: 'settlement.entries.list',
    scope: 'tenant',
    permission: { action: 'settlement.read', resourceType: 'settlement_entry' },
    query,
  },
  async ({ actor, query: q }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await listEntries(actor.companyId, q.subMerchantId, q.limit, q.before ?? null) };
  },
);

/** Posts up to 200 entries for one sub-merchant. The same entries posted again are reported as duplicates and change nothing. */
export const POST = withApi(
  {
    id: 'settlement.entries.post',
    scope: 'tenant',
    permission: { action: 'settlement.manage', resourceType: 'settlement_entry' },
    body: entriesBatch,
    maxBodyBytes: 262_144,
    auditExempt: 'The entry service writes one audit entry for the batch.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { status: 201, data: await postEntries(actor, body) };
  },
);
