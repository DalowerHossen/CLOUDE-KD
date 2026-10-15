// path: app/api/admin/audit/verify/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { verifyChainByKey } from '@/services/audit/audit-service';
import { verifyCheckpoints } from '@/services/audit/checkpoint';

const bodySchema = z
  .object({
    chainKey: z.string().regex(/^(platform|[0-9a-f-]{36})$/),
    fromSequence: z.string().regex(/^\d{1,18}$/).nullable().default(null),
    toSequence: z.string().regex(/^\d{1,18}$/).nullable().default(null),
  })
  .strict();

export const POST = withApi(
  {
    id: 'admin.audit.verify',
    scope: 'platform',
    networkContext: 'admin',
    permission: { action: 'audit.verify', resourceType: 'audit_log' },
    body: bodySchema,
  },
  async ({ body }) => {
    const chain = await verifyChainByKey(body.chainKey, { fromSequence: body.fromSequence, toSequence: body.toSequence });
    const checkpoints = await verifyCheckpoints(getAdminSupabase(), body.chainKey);
    return {
      data: { chain, checkpoints },
      audit: {
        action: 'audit.verified',
        resourceType: 'audit_log',
        resourceId: null,
        metadata: { chain_key: body.chainKey, ok: chain.ok && checkpoints.ok },
      },
    };
  },
);
