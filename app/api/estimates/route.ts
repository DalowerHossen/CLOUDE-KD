// path: app/api/estimates/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { ESTIMATE_STATUSES } from '@/lib/estimate/status';
import { estimateInputSchema } from '@/lib/estimate/input';
import { plain } from '@/lib/crm/clients';
import { toInt } from '@/lib/reports/numbers';
import { createEstimate, listEstimates } from '@/services/estimate/estimates';

export const GET = withApi(
  {
    id: 'estimates.list',
    scope: 'tenant',
    permission: { action: 'estimate.read', resourceType: 'estimate' },
    query: z
      .object({
        status: z.enum(ESTIMATE_STATUSES).optional(),
        q: plain(0, 80).optional(),
        trashed: z.enum(['true', 'false']).optional(),
        limit: z
          .string()
          .regex(/^\d{1,3}$/)
          .optional(),
      })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return {
      data: await listEstimates(actor.companyId, {
        status: query.status ?? null,
        q: query.q ?? '',
        trashed: query.trashed === 'true',
        limit: Math.min(toInt(query.limit, 50), 200),
      }),
    };
  },
);

export const POST = withApi(
  {
    id: 'estimates.create',
    scope: 'tenant',
    permission: { action: 'estimate.create', resourceType: 'estimate' },
    body: estimateInputSchema,
    maxBodyBytes: 5_000_000,
    idempotent: true,
    auditExempt: 'The estimate service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await createEstimate(actor, body), status: 201 };
  },
);
