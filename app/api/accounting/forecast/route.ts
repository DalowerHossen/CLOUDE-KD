// path: app/api/accounting/forecast/route.ts
import { withApi } from '@/lib/api/with-api';
import { ForbiddenError } from '@/lib/errors';
import { cashForecast, trendForecasts } from '@/services/budget/forecast';

export const GET = withApi(
  {
    id: 'accounting.forecast.get',
    scope: 'tenant',
    permission: { action: 'accounting.read', resourceType: 'forecast' },
  },
  async ({ actor }) => {
    if (!actor?.companyId) throw new ForbiddenError();
    const [cash, trend] = await Promise.all([
      cashForecast(actor.companyId),
      trendForecasts(actor.companyId),
    ]);
    return { data: { cash, trend } };
  },
);
