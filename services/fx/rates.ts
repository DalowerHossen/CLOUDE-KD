// path: services/fx/rates.ts
// Exchange rates for showing amounts in another currency. Stored amounts stay in US dollars. A company's own rate
// (typed in) beats a platform rate on the same day; the newest rate on or before the asked day is used.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { FX_CURRENCIES, convertUsd, type FxRateInput } from '@/lib/fx/rates';
import { fxProviders } from '@/lib/fx/provider';
import { createLogger } from '@/lib/logger';
import { type Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

const log = createLogger({ component: 'fx' });

export interface FxRateView {
  currency: string;
  rate: string;
  asOf: string;
  source: 'manual' | 'provider';
}

const day = (d: Date): string => d.toISOString().slice(0, 10);

export async function rateOn(
  companyId: string | null,
  currency: string,
  at: Date,
): Promise<FxRateView | null> {
  const { data, error } = await getAdminSupabase().rpc('kd_fx_rate', {
    p_company: companyId,
    p_currency: currency,
    p_at: day(at),
  });
  if (error) throw new InternalError(error);
  const row = (data as { rate: string; as_of: string; source: string }[] | null)?.[0];
  if (!row) return null;
  return {
    currency,
    rate: String(row.rate)
      .replace(/(\.\d*?)0+$/, '$1')
      .replace(/\.$/, ''),
    asOf: String(row.as_of),
    source: row.source === 'provider' ? 'provider' : 'manual',
  };
}

export async function latestRates(companyId: string): Promise<FxRateView[]> {
  const now = new Date();
  const rows = await Promise.all(FX_CURRENCIES.map((c) => rateOn(companyId, c, now)));
  return rows.filter((r): r is FxRateView => r !== null);
}

/** Converted amount for display, with the rate that was used so it can be frozen on an invoice. */
export async function convertOn(
  companyId: string | null,
  amount: Money,
  currency: string,
  at: Date,
): Promise<{ amount: string; currency: string; rate: string; asOf: string }> {
  const r = await rateOn(companyId, currency, at);
  if (!r) throw new NotFoundError();
  return { amount: convertUsd(amount, r.rate, currency), currency, rate: r.rate, asOf: r.asOf };
}

export async function saveCompanyRate(actor: Actor, input: FxRateInput): Promise<void> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const companyId = actor.companyId;
  const today = day(new Date());
  if (input.asOf > today) throw new ValidationError('The date of a rate cannot be in the future.');
  const admin = getAdminSupabase();
  const existing = await admin
    .from('fx_rates')
    .select('id, version')
    .eq('company_id', companyId)
    .eq('currency', input.currency)
    .eq('as_of', input.asOf)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  if (existing.data) {
    const r = await admin
      .from('fx_rates')
      .update({ rate: input.rate, created_by: actor.userId })
      .eq('id', String(existing.data.id))
      .eq('company_id', companyId);
    if (r.error) throw new InternalError(r.error);
  } else {
    const r = await admin.from('fx_rates').insert({
      company_id: companyId,
      currency: input.currency,
      rate: input.rate,
      as_of: input.asOf,
      source: 'manual',
      created_by: actor.userId,
    });
    if (r.error) throw new InternalError(r.error);
  }
  await getService('audit').record({
    action: 'fx_rate.saved',
    resourceType: 'fx_rate',
    resourceId: null,
    companyId,
    metadata: { currency: input.currency, rate: input.rate, asOf: input.asOf, by: actor.userId },
  });
}

/** Job: asks every registered provider for today's rates and stores them as platform rates. */
export async function syncProviderRates(): Promise<number> {
  const admin = getAdminSupabase();
  let stored = 0;
  for (const provider of fxProviders()) {
    try {
      const result = await provider.fetchRates();
      for (const currency of FX_CURRENCIES) {
        const rate = result.rates[currency];
        if (!rate || !/^\d{1,12}(\.\d{1,8})?$/.test(rate) || !/[1-9]/.test(rate)) continue;
        const exists = await admin
          .from('fx_rates')
          .select('id')
          .is('company_id', null)
          .eq('currency', currency)
          .eq('as_of', result.asOf)
          .is('deleted_at', null)
          .maybeSingle();
        if (exists.data) continue;
        const r = await admin
          .from('fx_rates')
          .insert({ company_id: null, currency, rate, as_of: result.asOf, source: 'provider' });
        if (!r.error) stored += 1;
      }
    } catch (error) {
      log.warn('rate provider failed', { provider: provider.id, error });
    }
  }
  return stored;
}
