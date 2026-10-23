// path: services/asset/depreciation.ts
// Monthly depreciation. For a month the run makes one balanced entry for the company (expense debited, accumulated depreciation
// credited, grouped by the accounts of the categories) and one row per asset. The entry has one source key per company and month
// and the rows are unique per asset and month, so running a month twice books it once. Months are booked oldest first; an asset
// starts in its in-service month and stops at the salvage value or when it is sold or disposed.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { accountingActor } from '@/services/accounting/accounts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { addMonthsToDay } from '@/services/accounting/period-rules';
import { listAssetCategories } from './categories';
import {
  depreciationLines,
  monthAmount,
  monthEnd,
  monthStart,
  runInput,
  usageInput,
  type CategoryAmount,
} from './depreciation-rules';
import { postAssetEntry } from './entries';
import { ASSET_COLUMNS, assetView, depreciationTotals, type AssetRow } from './assets';

const log = createLogger({ component: 'asset-depreciation' });

export interface MonthResult {
  month: string;
  assets: number;
  total: string;
  entryId: string | null;
}

export interface RunResult {
  months: MonthResult[];
  skipped: { month: string; reason: string }[];
}

async function usageOf(companyId: string, month: string): Promise<Map<string, string>> {
  const { data, error } = await getAdminSupabase()
    .from('asset_usage')
    .select('asset_id, units')
    .eq('company_id', companyId)
    .eq('period_month', month)
    .is('deleted_at', null)
    .limit(10_000);
  if (error) throw new InternalError(error);
  return new Map(
    (data ?? []).map((r) => [String(r.asset_id), Money.parseRounded(String(r.units)).toDbString()]),
  );
}

/** Books one month for a company. Returns null total when nothing is due. */
export async function depreciateMonth(companyId: string, month: string): Promise<MonthResult> {
  const first = monthStart(month);
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('fixed_assets')
    .select(`${ASSET_COLUMNS}, created_by`)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .lte('in_service_date', monthEnd(first))
    .limit(10_000);
  if (error) throw new InternalError(error);
  const rows = (data ?? []) as unknown as AssetRow[];
  const totals = await depreciationTotals(
    companyId,
    rows.map((r) => r.id),
  );
  const booked = await admin
    .from('asset_depreciation')
    .select('asset_id')
    .eq('company_id', companyId)
    .eq('period_month', first)
    .limit(20_000);
  if (booked.error) throw new InternalError(booked.error);
  const done = new Set((booked.data ?? []).map((r) => String(r.asset_id)));
  const categories = await listAssetCategories(companyId);
  const usage = await usageOf(companyId, first);
  const due: { asset: AssetRow; amount: Money; units: string | null }[] = [];
  for (const r of rows) {
    if (done.has(r.id)) continue;
    const t = totals.get(r.id);
    const asset = assetView(r, t?.accumulated ?? '0.0000', t?.months ?? 0);
    const units = usage.get(r.id) ?? null;
    const amount = monthAmount(
      {
        cost: asset.cost,
        salvage: asset.salvageValue,
        lifeMonths: asset.lifeMonths,
        method: asset.method,
        factor: asset.decliningFactor,
        totalUnits: asset.totalUnits,
        inService: asset.inServiceDate,
      },
      { accumulated: asset.accumulated, monthsDone: asset.monthsDone, units: units ?? '0' },
    );
    if (amount.isPositive()) due.push({ asset: r, amount, units });
  }
  if (due.length === 0) return { month: first, assets: 0, total: '0.0000', entryId: null };
  const items: CategoryAmount[] = due.map((d) => {
    const c = categories.find((x) => x.id === d.asset.category_id);
    return {
      amount: d.amount,
      ...(c?.expenseAccountId ? { expenseAccountId: c.expenseAccountId } : {}),
      ...(c?.accumulatedAccountId ? { accumulatedAccountId: c.accumulatedAccountId } : {}),
    };
  });
  const total = Money.sum(due.map((d) => d.amount));
  const posted = await postAssetEntry({
    companyId,
    date: monthEnd(first),
    memo: `Depreciation for ${first.slice(0, 7)}`,
    sourceType: 'asset_depreciation',
    sourceId: companyId,
    sourceKey: `asset-depreciation:${companyId}:${first}`,
    lines: depreciationLines(items),
  });
  for (const d of due) {
    const { error: e } = await admin.from('asset_depreciation').insert({
      company_id: companyId,
      asset_id: d.asset.id,
      period_month: first,
      amount: d.amount.toDbString(),
      units: d.units,
      journal_entry_id: posted.entryId,
    });
    if (e && e.code !== '23505') mapAccountingError(e);
  }
  return { month: first, assets: due.length, total: total.toDbString(), entryId: posted.entryId };
}

/** The oldest month that still has depreciation to book, from the earliest in-service date. */
async function firstDueMonth(companyId: string): Promise<string | null> {
  const { data, error } = await getAdminSupabase()
    .from('fixed_assets')
    .select('in_service_date')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('in_service_date', { ascending: true })
    .limit(1);
  if (error) throw new InternalError(error);
  const d = data?.[0]?.in_service_date;
  return d ? monthStart(String(d)) : null;
}

/** Books every month up to and including `through` that is not booked yet, oldest first. A closed month is skipped with the reason. */
export async function runDepreciation(companyId: string, through: string): Promise<RunResult> {
  const last = monthStart(through);
  const out: RunResult = { months: [], skipped: [] };
  let month = await firstDueMonth(companyId);
  let guard = 0;
  while (month && month <= last && guard < 600) {
    guard += 1;
    try {
      const r = await depreciateMonth(companyId, month);
      if (r.assets > 0) out.months.push(r);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The month could not be booked.';
      log.warn('depreciation month failed', { companyId, month, reason });
      out.skipped.push({ month, reason });
      break;
    }
    month = addMonthsToDay(month, 1);
  }
  if (out.months.length > 0) {
    await getService('audit').record({
      action: 'asset.depreciation_run',
      resourceType: 'fixed_asset',
      resourceId: null,
      companyId,
      metadata: { months: out.months.length, through: last },
    });
  }
  return out;
}

export async function runDepreciationFor(actor: Actor, input: unknown): Promise<RunResult> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = runInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Check the month.');
  return runDepreciation(companyId, parsed.data.throughMonth);
}

/** The daily job: every company with active assets is brought up to the end of the previous month. */
export async function runDepreciationAll(
  today: string = new Date().toISOString().slice(0, 10),
): Promise<{ companies: number; months: number; failed: number }> {
  const through = addMonthsToDay(monthStart(today), -1);
  const { data, error } = await getAdminSupabase()
    .from('fixed_assets')
    .select('company_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .lte('in_service_date', monthEnd(through))
    .limit(20_000);
  if (error) throw new InternalError(error);
  const companies = [...new Set((data ?? []).map((r) => String(r.company_id)))];
  const out = { companies: companies.length, months: 0, failed: 0 };
  for (const id of companies) {
    try {
      const r = await runDepreciation(id, through);
      out.months += r.months.length;
      out.failed += r.skipped.length;
    } catch (e) {
      out.failed += 1;
      log.error('depreciation failed', {
        companyId: id,
        error: e instanceof Error ? e.message : 'unknown',
        actor: accountingActor(id).sessionId,
      });
    }
  }
  return out;
}

/** Units used by an asset in a month (units of production). The month must not be depreciated yet. */
export async function recordUsage(actor: Actor, assetId: string, input: unknown): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = usageInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The usage is not valid.');
  const month = monthStart(parsed.data.month);
  const admin = getAdminSupabase();
  const asset = await admin
    .from('fixed_assets')
    .select('id, method, status')
    .eq('company_id', companyId)
    .eq('id', assetId)
    .is('deleted_at', null)
    .maybeSingle();
  if (asset.error) throw new InternalError(asset.error);
  if (!asset.data) throw new NotFoundError();
  if (asset.data.method !== 'units_of_production')
    throw new ValidationError('Usage is recorded only for units of production assets.');
  const done = await admin
    .from('asset_depreciation')
    .select('id')
    .eq('asset_id', assetId)
    .eq('period_month', month)
    .limit(1);
  if (done.error) throw new InternalError(done.error);
  if ((done.data ?? []).length > 0) throw new ValidationError('This month is already depreciated.');
  const existing = await admin
    .from('asset_usage')
    .select('id, version')
    .eq('company_id', companyId)
    .eq('asset_id', assetId)
    .eq('period_month', month)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  const write = existing.data
    ? await admin
        .from('asset_usage')
        .update({ units: parsed.data.units })
        .eq('id', existing.data.id)
        .eq('version', existing.data.version)
    : await admin.from('asset_usage').insert({
        company_id: companyId,
        asset_id: assetId,
        period_month: month,
        units: parsed.data.units,
      });
  if (write.error) mapAccountingError(write.error);
  await getService('audit').record({
    action: 'asset.usage_recorded',
    resourceType: 'fixed_asset',
    resourceId: assetId,
    companyId,
    metadata: { month, units: parsed.data.units },
  });
}
