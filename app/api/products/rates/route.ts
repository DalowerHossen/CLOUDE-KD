// path: app/api/products/rates/route.ts
import { z } from 'zod';
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { clientRateSchema } from '@/lib/catalog/products';
import { listRates, setRate } from '@/services/product/client-rates';

export const GET = withApi(
  {
    id: 'rates.list',
    scope: 'tenant',
    permission: { action: 'product.client_rates', resourceType: 'product' },
    query: z
      .object({ productId: z.string().uuid().optional(), clientId: z.string().uuid().optional() })
      .strict(),
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    if (!query.productId && !query.clientId)
      throw new ValidationError('Give a product or a client.');
    return { data: await listRates(actor.companyId, query) };
  },
);

export const PUT = withApi(
  {
    id: 'rates.set',
    scope: 'tenant',
    permission: { action: 'product.client_rates', resourceType: 'product' },
    body: clientRateSchema,
    auditExempt: 'The rate service writes the audit entry.',
  },
  async ({ actor, body }) => {
    if (!actor) throw new ForbiddenError();
    await setRate(actor, body);
    return { data: { done: true } };
  },
);
