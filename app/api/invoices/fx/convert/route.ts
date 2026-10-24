// path: app/api/invoices/fx/convert/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { fxConvertQuery } from '@/lib/fx/rates';
import { Money } from '@/lib/utils/currency';
import { convertOn } from '@/services/fx/rates';

export const GET = withApi(
  {
    id: 'fx.convert',
    scope: 'tenant',
    permission: { action: 'tax.read', resourceType: 'fx_rate' },
    query: fxConvertQuery,
  },
  async ({ actor, query }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const at = query.at ? new Date(`${query.at}T12:00:00Z`) : new Date();
    return {
      data: await convertOn(actor.companyId, Money.parse(query.amount), query.currency, at),
    };
  },
);
