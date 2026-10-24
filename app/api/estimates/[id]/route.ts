// path: app/api/estimates/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { estimateUpdateSchema } from '@/lib/estimate/input';
import { getEstimate, trashEstimate, updateEstimate } from '@/services/estimate/estimates';

const params = z.object({ id: z.string().uuid() }).strict();

export const GET = withApi(
  {
    id: 'estimates.get',
    scope: 'tenant',
    permission: { action: 'estimate.read', resourceType: 'estimate' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getEstimate(actor.companyId, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'estimates.update',
    scope: 'tenant',
    permission: { action: 'estimate.update', resourceType: 'estimate' },
    params,
    body: estimateUpdateSchema,
    maxBodyBytes: 5_000_000,
    auditExempt: 'The estimate service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateEstimate(actor, p.id, body.expectedVersion, body.invoice) };
  },
);

export const DELETE = withApi(
  {
    id: 'estimates.trash',
    scope: 'tenant',
    permission: { action: 'estimate.delete', resourceType: 'estimate' },
    params,
    auditExempt: 'The estimate service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await trashEstimate(actor, p.id);
    return { data: { id: p.id } };
  },
);
