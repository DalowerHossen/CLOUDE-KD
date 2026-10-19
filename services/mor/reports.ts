// path: services/mor/reports.ts
// What the owner and the platform team read: the status of settlement, the list of settled payments with the reason of
// each hold, the settlement reports of each cycle (daily, every 3 days or weekly) and the reserve kept back.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { cyclePeriod, periodEnded } from '@/lib/payment/mor-engine';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { csvCell } from '@/services/wallet/statement';
import { getWallet } from '@/services/wallet/wallet-service';
import { listHolds, type HoldView } from './holds';
import { getMode, type ModeAnswer } from './mode';
import { ITEM_COLUMNS, toItemView, type ItemRow, type ItemView } from './settle';

const m = (v: string | number | null | undefined): Money =>
  v === null || v === undefined ? Money.zero() : Money.parseRounded(String(v));

export interface MorStatus {
  mode: ModeAnswer['mode'];
  reason: ModeAnswer['reason'];
  message: string;
  suspendedReason: string | null;
  available: string;
  held: string;
  /** Reserve still held back for chargebacks. */
  reserveHeld: string;
  holds: HoldView[];
}

/** The status the owner sees on the wallet page: mode, balances, every active hold with its reason. */
export async function morStatus(companyId: string): Promise<MorStatus> {
  const [mode, wallet, holds, items] = await Promise.all([
    getMode(companyId),
    getWallet(companyId),
    listHolds(companyId, 'active'),
    getAdminSupabase()
      .from('settlement_items')
      .select('reserve')
      .eq('company_id', companyId)
      .eq('status', 'held')
      .gt('reserve', 0)
      .is('deleted_at', null)
      .limit(5000),
  ]);
  if (items.error) throw new InternalError(items.error);
  return {
    mode: mode.mode,
    reason: mode.reason,
    message: mode.message,
    suspendedReason: mode.suspendedReason,
    available: wallet?.available ?? '0.0000',
    held: wallet?.held ?? '0.0000',
    reserveHeld: Money.sum((items.data ?? []).map((r) => m(r.reserve))).toDbString(),
    holds,
  };
}

export async function listItems(
  companyId: string,
  options: { status?: ItemView['status']; limit?: number } = {},
): Promise<ItemView[]> {
  let q = getAdminSupabase()
    .from('settlement_items')
    .select(ITEM_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 200));
  if (options.status) q = q.eq('status', options.status);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as ItemRow[]).map(toItemView);
}

export interface SettlementView {
  id: string;
  periodStart: string;
  periodEnd: string;
  cycleDays: number;
  itemCount: number;
  gross: string;
  fees: string;
  refunds: string;
  net: string;
  closedAt: string | null;
}

export async function listSettlements(companyId: string, limit = 60): Promise<SettlementView[]> {
  const { data, error } = await getAdminSupabase()
    .from('settlements')
    .select(
      'id, period_start, period_end, cycle_days, item_count, gross, fees, refunds, net, closed_at',
    )
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('period_start', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    cycleDays: Number(r.cycle_days),
    itemCount: Number(r.item_count),
    gross: m(r.gross).toDbString(),
    fees: m(r.fees).toDbString(),
    refunds: m(r.refunds).toDbString(),
    net: m(r.net).toDbString(),
    closedAt: r.closed_at ? String(r.closed_at) : null,
  }));
}

export function settlementsCsv(rows: readonly SettlementView[]): string {
  const head = ['Period start', 'Period end', 'Payments', 'Gross', 'Fees', 'Refunds', 'Net'];
  const lines = rows.map((r) =>
    [r.periodStart, r.periodEnd, String(r.itemCount), r.gross, r.fees, r.refunds, r.net]
      .map(csvCell)
      .join(','),
  );
  return [head.map(csvCell).join(','), ...lines].join('\n');
}

/**
 * Cuts the settlement reports: released payments that are not in a report yet go into the report of the cycle in which
 * they were released, once that cycle has ended. Safe to run again.
 */
export async function closeSettlements(now: Date = new Date()): Promise<number> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('settlement_items')
    .select('id, company_id, released_at')
    .eq('status', 'released')
    .is('settlement_id', null)
    .not('released_at', 'is', null)
    .is('deleted_at', null)
    .order('released_at')
    .limit(2000);
  if (error) throw new InternalError(error);
  const groups = new Map<
    string,
    { companyId: string; start: string; end: string; ids: string[] }
  >();
  const cycles = new Map<string, 1 | 3 | 7>();
  for (const r of data ?? []) {
    const companyId = String(r.company_id);
    if (!cycles.has(companyId)) cycles.set(companyId, (await getMode(companyId)).rules.cycleDays);
    const cycle = cycles.get(companyId) ?? 1;
    const period = cyclePeriod(new Date(String(r.released_at)), cycle);
    if (!periodEnded(period.end, now)) continue;
    const key = `${companyId}:${period.start}:${period.end}`;
    const g = groups.get(key) ?? { companyId, start: period.start, end: period.end, ids: [] };
    g.ids.push(String(r.id));
    groups.set(key, g);
  }
  let closed = 0;
  for (const g of groups.values()) {
    const cycle = cycles.get(g.companyId) ?? 1;
    let settlementId: string | null = null;
    const found = await admin
      .from('settlements')
      .select('id')
      .eq('company_id', g.companyId)
      .eq('period_start', g.start)
      .eq('period_end', g.end)
      .is('deleted_at', null)
      .maybeSingle();
    if (found.error) throw new InternalError(found.error);
    settlementId = found.data ? String(found.data.id) : null;
    if (!settlementId) {
      const made = await admin
        .from('settlements')
        .insert({
          company_id: g.companyId,
          period_start: g.start,
          period_end: g.end,
          cycle_days: cycle,
        })
        .select('id')
        .single();
      if (made.error) throw new InternalError(made.error);
      settlementId = String(made.data.id);
    }
    const attach = await admin
      .from('settlement_items')
      .update({ settlement_id: settlementId })
      .in('id', g.ids);
    if (attach.error) throw new InternalError(attach.error);
    const all = await admin
      .from('settlement_items')
      .select('gross, fee, tax, refunded, net')
      .eq('settlement_id', settlementId)
      .is('deleted_at', null);
    if (all.error) throw new InternalError(all.error);
    const rows = all.data ?? [];
    const up = await admin
      .from('settlements')
      .update({
        item_count: rows.length,
        gross: Money.sum(rows.map((r) => m(r.gross))).toDbString(),
        fees: Money.sum(rows.map((r) => m(r.fee).add(m(r.tax)))).toDbString(),
        refunds: Money.sum(rows.map((r) => m(r.refunded))).toDbString(),
        net: Money.sum(rows.map((r) => m(r.net))).toDbString(),
        closed_at: now.toISOString(),
      })
      .eq('id', settlementId);
    if (up.error) throw new InternalError(up.error);
    closed += 1;
  }
  return closed;
}
