// path: app/api/inventory/counts/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { countActionSchema, countSaveSchema } from '@/lib/stock/documents';
import { cancelCount, completeCount, getCount, saveCounted } from '@/services/inventory/counts';

const params = z.object({ id: z.string().uuid() }).strict();
const permission = { action: 'inventory.count', resourceType: 'stock_count' } as const;

export const GET = withApi(
  {
    id: 'counts.get',
    scope: 'tenant',
    permission: { action: 'inventory.read', resourceType: 'stock_count' },
    params,
  },
  async ({ actor, params: p }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    return { data: await getCount(actor.companyId, p.id) };
  },
);

export const PUT = withApi(
  {
    id: 'counts.save',
    scope: 'tenant',
    permission,
    params,
    body: countSaveSchema,
    auditExempt: 'Counted quantities are drafts; completing the count is audited.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    await saveCounted(actor, p.id, body.counts);
    return { data: { done: true } };
  },
);

export const POST = withApi(
  {
    id: 'counts.action',
    scope: 'tenant',
    permission,
    params,
    body: countActionSchema,
    auditExempt: 'The count service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    if (body.action === 'complete') return { data: await completeCount(actor, p.id) };
    await cancelCount(actor, p.id);
    return { data: { changed: 0 } };
  },
);
