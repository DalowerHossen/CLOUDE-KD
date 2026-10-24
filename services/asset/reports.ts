// path: services/asset/reports.ts
// Asset reports as flat tables the platform's report file builder can export: the asset register as of a date, depreciation booked
// in a period by category, the value of each category, disposals with their gain or loss and warranties that end soon.
import 'server-only';
import { InternalError, ValidationError } from '@/lib/errors';
import type { ReportColumn, ReportResult } from '@/lib/reports/types';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { dayText } from '@/services/accounting/journal-rules';
import { buildReportFile, type ExportFormat, type ReportFile } from '@/services/report/export';
import { listAssets, type AssetView } from './assets';
import { listAssetCategories } from './categories';
import { monthStart } from './depreciation-rules';

export const ASSET_REPORT_KEYS = [
  'register',
  'depreciation',
  'by_category',
  'disposals',
  'warranties',
] as const;
export type AssetReportKey = (typeof ASSET_REPORT_KEYS)[number];

const col = (key: string, label: string, type: ReportColumn['type'] = 'text'): ReportColumn => ({
  key,
  label,
  type,
});

function result(
  key: string,
  title: string,
  from: string,
  to: string,
  columns: ReportColumn[],
  rows: Record<string, string>[],
  totals: Record<string, string> | null,
  notes: string[] = [],
): ReportResult {
  return { key, title, period: { from, to }, columns, rows, totals, notes };
}

interface DepRow {
  assetId: string;
  month: string;
  amount: string;
}

async function depreciationRows(companyId: string, upTo: string): Promise<DepRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('asset_depreciation')
    .select('asset_id, period_month, amount')
    .eq('company_id', companyId)
    .lte('period_month', monthStart(upTo))
    .limit(50_000);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    assetId: String(r.asset_id),
    month: String(r.period_month),
    amount: Money.parseRounded(String(r.amount)).toDbString(),
  }));
}

/** The assets that were on the books on the date: bought by then and not disposed before it. */
const onBooks = (a: AssetView, asOf: string): boolean =>
  a.purchaseDate <= asOf && (a.disposedOn === null || a.disposedOn > asOf);

function accumulatedBy(deps: readonly DepRow[]): Map<string, Money> {
  const out = new Map<string, Money>();
  for (const d of deps) out.set(d.assetId, (out.get(d.assetId) ?? Money.zero()).add(d.amount));
  return out;
}

export async function assetReport(
  actor: Actor,
  key: AssetReportKey,
  from: string,
  to: string,
): Promise<ReportResult> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if (!dayText.safeParse(from).success || !dayText.safeParse(to).success || from > to)
    throw new ValidationError('Check the dates.');
  const [assets, categories] = await Promise.all([
    listAssets(companyId),
    listAssetCategories(companyId),
  ]);
  const catName = (id: string): string => categories.find((c) => c.id === id)?.name ?? '';
  const deps = await depreciationRows(companyId, to);
  const acc = accumulatedBy(deps);
  const asOf = (a: AssetView): Money => acc.get(a.id) ?? Money.zero();
  switch (key) {
    case 'register': {
      const list = assets.filter((a) => onBooks(a, to));
      const rows = list.map((a) => ({
        name: a.name,
        category: catName(a.categoryId),
        serial: a.serialNumber,
        location: a.location,
        inService: a.inServiceDate,
        cost: a.cost,
        accumulated: asOf(a).toDbString(),
        netBookValue: Money.parse(a.cost).sub(asOf(a)).toDbString(),
        status: a.status,
      }));
      const cost = Money.sum(list.map((a) => Money.parse(a.cost)));
      const accum = Money.sum(list.map(asOf));
      return result(
        'asset_register',
        'Asset register',
        from,
        to,
        [
          col('name', 'Asset'),
          col('category', 'Category'),
          col('serial', 'Serial number'),
          col('location', 'Location'),
          col('inService', 'In service', 'date'),
          col('cost', 'Cost', 'money'),
          col('accumulated', 'Accumulated depreciation', 'money'),
          col('netBookValue', 'Net book value', 'money'),
          col('status', 'Status'),
        ],
        rows,
        {
          name: 'Total',
          cost: cost.toDbString(),
          accumulated: accum.toDbString(),
          netBookValue: cost.sub(accum).toDbString(),
        },
        [`As of ${to}.`],
      );
    }
    case 'depreciation': {
      const inPeriod = deps.filter((d) => d.month >= monthStart(from));
      const byAsset = new Map(assets.map((a) => [a.id, a]));
      const cell = new Map<string, Map<string, Money>>();
      for (const d of inPeriod) {
        const c = catName(byAsset.get(d.assetId)?.categoryId ?? '');
        const row = cell.get(c) ?? new Map<string, Money>();
        row.set(d.month, (row.get(d.month) ?? Money.zero()).add(d.amount));
        cell.set(c, row);
      }
      const months = [...new Set(inPeriod.map((d) => d.month))].sort();
      const columns = [
        col('category', 'Category'),
        ...months.map((m) => col(m, m.slice(0, 7), 'money')),
        col('total', 'Total', 'money'),
      ];
      const rows: Record<string, string>[] = [];
      const totals: Record<string, string> = { category: 'Total' };
      let grand = Money.zero();
      for (const [category, row] of [...cell].sort((a, b) => a[0].localeCompare(b[0]))) {
        const line: Record<string, string> = { category: category || 'No category' };
        let sum = Money.zero();
        for (const m of months) {
          const v = row.get(m) ?? Money.zero();
          line[m] = v.toDbString();
          totals[m] = Money.parse(totals[m] ?? '0')
            .add(v)
            .toDbString();
          sum = sum.add(v);
        }
        line.total = sum.toDbString();
        grand = grand.add(sum);
        rows.push(line);
      }
      totals.total = grand.toDbString();
      return result(
        'asset_depreciation',
        'Depreciation by category',
        from,
        to,
        columns,
        rows,
        totals,
      );
    }
    case 'by_category': {
      const list = assets.filter((a) => onBooks(a, to));
      const groups = new Map<string, { count: number; cost: Money; accum: Money }>();
      for (const a of list) {
        const name = catName(a.categoryId) || 'No category';
        const g = groups.get(name) ?? { count: 0, cost: Money.zero(), accum: Money.zero() };
        groups.set(name, {
          count: g.count + 1,
          cost: g.cost.add(a.cost),
          accum: g.accum.add(asOf(a)),
        });
      }
      const rows = [...groups]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, g]) => ({
          category: name,
          count: String(g.count),
          cost: g.cost.toDbString(),
          accumulated: g.accum.toDbString(),
          netBookValue: g.cost.sub(g.accum).toDbString(),
        }));
      const cost = Money.sum([...groups.values()].map((g) => g.cost));
      const accum = Money.sum([...groups.values()].map((g) => g.accum));
      return result(
        'asset_by_category',
        'Assets by category',
        from,
        to,
        [
          col('category', 'Category'),
          col('count', 'Assets', 'number'),
          col('cost', 'Cost', 'money'),
          col('accumulated', 'Accumulated depreciation', 'money'),
          col('netBookValue', 'Net book value', 'money'),
        ],
        rows,
        {
          category: 'Total',
          count: String(list.length),
          cost: cost.toDbString(),
          accumulated: accum.toDbString(),
          netBookValue: cost.sub(accum).toDbString(),
        },
        [`As of ${to}.`],
      );
    }
    case 'disposals': {
      const list = assets.filter(
        (a) => a.disposedOn !== null && a.disposedOn >= from && a.disposedOn <= to,
      );
      const rows = list.map((a) => ({
        name: a.name,
        category: catName(a.categoryId),
        disposedOn: a.disposedOn ?? '',
        cost: a.cost,
        accumulated: a.accumulated,
        netBookValue: a.netBookValue,
        proceeds: a.disposalProceeds ?? '0.0000',
        gainLoss: a.disposalGainLoss ?? '0.0000',
      }));
      const sum = (f: (a: AssetView) => string): string =>
        Money.sum(list.map((a) => Money.parse(f(a)))).toDbString();
      return result(
        'asset_disposals',
        'Asset disposals',
        from,
        to,
        [
          col('name', 'Asset'),
          col('category', 'Category'),
          col('disposedOn', 'Disposed on', 'date'),
          col('cost', 'Cost', 'money'),
          col('accumulated', 'Accumulated depreciation', 'money'),
          col('netBookValue', 'Net book value', 'money'),
          col('proceeds', 'Proceeds', 'money'),
          col('gainLoss', 'Gain or loss', 'money'),
        ],
        rows,
        {
          name: 'Total',
          cost: sum((a) => a.cost),
          accumulated: sum((a) => a.accumulated),
          netBookValue: sum((a) => a.netBookValue),
          proceeds: sum((a) => a.disposalProceeds ?? '0'),
          gainLoss: sum((a) => a.disposalGainLoss ?? '0'),
        },
        ['A gain is positive and a loss negative.'],
      );
    }
    case 'warranties': {
      const list = assets
        .filter((a) => a.status === 'active' && a.warrantyUntil !== null)
        .sort((a, b) => (a.warrantyUntil ?? '').localeCompare(b.warrantyUntil ?? ''));
      const rows = list.map((a) => ({
        name: a.name,
        category: catName(a.categoryId),
        serial: a.serialNumber,
        vendor: a.vendor,
        warrantyUntil: a.warrantyUntil ?? '',
        state: (a.warrantyUntil ?? '') < to ? 'Expired' : 'Valid',
        note: a.warrantyNote,
      }));
      return result(
        'asset_warranties',
        'Warranties',
        from,
        to,
        [
          col('name', 'Asset'),
          col('category', 'Category'),
          col('serial', 'Serial number'),
          col('vendor', 'Vendor'),
          col('warrantyUntil', 'Warranty until', 'date'),
          col('state', 'State'),
          col('note', 'Note'),
        ],
        rows,
        null,
        [`Checked against ${to}.`],
      );
    }
  }
}

export async function exportAssetReport(
  actor: Actor,
  key: AssetReportKey,
  from: string,
  to: string,
  format: ExportFormat,
): Promise<ReportFile> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const table = await assetReport(actor, key, from, to);
  return buildReportFile(companyId, table, format, actor.email || actor.userId);
}
