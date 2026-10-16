// path: app/api/invoices/tax/rates/[id]/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { taxRateUpdate } from '@/lib/tax/input';
import { deleteRate, updateRate } from '@/services/tax/rates';

const params = z.object({ id: z.string().uuid() }).strict();
const permission = { action: 'tax.manage', resourceType: 'tax_rate' } as const;

export const PUT = withApi(
  {
    id: 'tax.rates.update',
    scope: 'tenant',
    permission,
    params,
    body: taxRateUpdate,
    auditExempt: 'The tax service writes the audit entry.',
  },
  async ({ actor, params: p, body }) => {
    if (!actor) throw new ForbiddenError();
    return { data: await updateRate(actor, p.id, body.expectedVersion, body.rate) };
  },
);

export const DELETE = withApi(
  {
    id: 'tax.rates.delete',
    scope: 'tenant',
    permission,
    params,
    auditExempt: 'The tax service writes the audit entry.',
  },
  async ({ actor, params: p }) => {
    if (!actor) throw new ForbiddenError();
    await deleteRate(actor, p.id);
    return { data: { id: p.id } };
  },
);
