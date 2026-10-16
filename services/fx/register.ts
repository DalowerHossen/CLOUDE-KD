// path: services/fx/register.ts
import { registerService, tryGetService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { convertOn, rateOn } from './rates';
import type { FxService } from '@/types/contracts';

/** The company of the signed-in session, or null for platform code (then only platform rates count). */
async function currentCompany(): Promise<string | null> {
  const tenant = tryGetService('tenant');
  if (!tenant) return null;
  const ctx = await tenant.getTenantContext().catch(() => null);
  return ctx?.companyId ?? null;
}

function createFxContract(): FxService {
  return {
    async rateAt(currency, at) {
      const r = await rateOn(await currentCompany(), currency, at);
      if (!r) throw new NotFoundError();
      return r.rate;
    },
    async convertForDisplay(amount, currency, at) {
      const r = await convertOn(await currentCompany(), amount, currency, at);
      return { amount: r.amount, currency: r.currency, rate: r.rate };
    },
  };
}

export default async function register(): Promise<void> {
  registerService('fx', createFxContract());
}
