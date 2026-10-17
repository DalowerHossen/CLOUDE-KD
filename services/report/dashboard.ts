// path: services/report/dashboard.ts
// Numbers and lists of the dashboard. The sums are added up in the database (money as text); this file only asks and
// reshapes. Everything is for the signed-in company. Days are UTC calendar days.
import 'server-only';
import { InternalError } from '@/lib/errors';
import {
  RANGE_KEYS,
  changePercent,
  previousRange,
  rangeFor,
  type DateRange,
  type RangeKey,
} from '@/lib/reports/ranges';
import {
  defaultLayout,
  layoutSchema,
  normalizeLayout,
  type WidgetId,
  type WidgetState,
} from '@/lib/reports/widgets';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

type Json = Record<string, unknown>;
const money = (v: unknown): string => Money.parseRounded(String(v ?? '0')).toDbString();

export interface DashboardStats {
  invoiced: string;
  invoicedCount: number;
  collected: string;
  credited: string;
  writtenOff: string;
  outstanding: string;
  outstandingCount: number;
  overdue: string;
  overdueCount: number;
  drafts: number;
  aging: { current: string; d1_30: string; d31_60: string; d61_90: string; d90_plus: string };
  statuses: Record<string, number>;
}

function toStats(raw: Json): DashboardStats {
  const aging = (raw.aging ?? {}) as Json;
  const statuses: Record<string, number> = {};
  for (const [k, v] of Object.entries((raw.statuses ?? {}) as Json)) statuses[k] = toInt(v);
  return {
    invoiced: money(raw.invoiced),
    invoicedCount: toInt(raw.invoicedCount),
    collected: money(raw.collected),
    credited: money(raw.credited),
    writtenOff: money(raw.writtenOff),
    outstanding: money(raw.outstanding),
    outstandingCount: toInt(raw.outstandingCount),
    overdue: money(raw.overdue),
    overdueCount: toInt(raw.overdueCount),
    drafts: toInt(raw.drafts),
    aging: {
      current: money(aging.current),
      d1_30: money(aging.d1_30),
      d31_60: money(aging.d31_60),
      d61_90: money(aging.d61_90),
      d90_plus: money(aging.d90_plus),
    },
    statuses,
  };
}

async function statsFor(
  companyId: string,
  range: DateRange,
  today: string,
): Promise<DashboardStats> {
  const { data, error } = await getAdminSupabase().rpc('kd_dashboard_stats', {
    p_company: companyId,
    p_from: range.from,
    p_to: range.to,
    p_today: today,
  });
  if (error) throw new InternalError(error);
  return toStats((data ?? {}) as Json);
}

export interface SeriesPoint {
  month: string;
  invoiced: string;
  collected: string;
}

export interface InvoiceLine {
  id: string;
  number: string | null;
  client: string;
  status: string;
  total: string;
  balance: string;
  dueDate: string;
}

export interface PaymentLine {
  id: string;
  invoiceId: string;
  number: string | null;
  amount: string;
  at: string;
}

export interface DashboardData {
  range: RangeKey;
  period: DateRange;
  previous: DateRange;
  stats: DashboardStats;
  before: DashboardStats;
  change: { invoiced: string | null; collected: string | null };
  series: SeriesPoint[];
  recent: InvoiceLine[];
  attention: { overdue: InvoiceLine[]; dueSoon: InvoiceLine[] };
  payments: PaymentLine[];
}

const LINE_COLUMNS =
  'id, number, walk_in_name, bill_to, status, total, amount_due, amount_paid, due_date';

function toLine(r: Json): InvoiceLine {
  const bill = (r.bill_to ?? {}) as { name?: string };
  return {
    id: String(r.id),
    number: r.number ? String(r.number) : null,
    client: bill.name || String(r.walk_in_name ?? ''),
    status: String(r.status),
    total: money(r.total),
    balance: Money.parseRounded(String(r.amount_due ?? '0'))
      .sub(String(r.amount_paid ?? '0'))
      .toDbString(),
    dueDate: String(r.due_date),
  };
}

export function parseRange(value: string | undefined): RangeKey {
  return RANGE_KEYS.find((k) => k === value) ?? 'month';
}

export async function getDashboard(
  companyId: string,
  range: RangeKey,
  today: string,
): Promise<DashboardData> {
  const admin = getAdminSupabase();
  const period = rangeFor(range, today);
  const previous = previousRange(range, period);
  const [stats, before, series, recent, overdue, soon, links] = await Promise.all([
    statsFor(companyId, period, today),
    statsFor(companyId, previous, today),
    admin.rpc('kd_dashboard_series', { p_company: companyId, p_today: today, p_months: 12 }),
    admin
      .from('invoices')
      .select(LINE_COLUMNS)
      .eq('company_id', companyId)
      .in('kind', ['invoice', 'debit_note'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(8),
    admin
      .from('invoices')
      .select(LINE_COLUMNS)
      .eq('company_id', companyId)
      .eq('status', 'overdue')
      .is('deleted_at', null)
      .order('due_date', { ascending: true })
      .limit(6),
    admin
      .from('invoices')
      .select(LINE_COLUMNS)
      .eq('company_id', companyId)
      .in('status', ['sent', 'viewed', 'partially_paid'])
      .gte('due_date', today)
      .lte(
        'due_date',
        new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10),
      )
      .is('deleted_at', null)
      .order('due_date', { ascending: true })
      .limit(6),
    admin
      .from('invoice_payment_links')
      .select('id, invoice_id, amount, applied_at, payment_id')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('applied_at', { ascending: false })
      .limit(8),
  ]);
  for (const r of [series, recent, overdue, soon, links])
    if (r.error) throw new InternalError(r.error);
  const invoiceIds = [...new Set((links.data ?? []).map((l) => String(l.invoice_id)))];
  const numbers = new Map<string, string | null>();
  if (invoiceIds.length > 0) {
    const inv = await admin
      .from('invoices')
      .select('id, number')
      .eq('company_id', companyId)
      .in('id', invoiceIds);
    if (inv.error) throw new InternalError(inv.error);
    for (const i of inv.data ?? []) numbers.set(String(i.id), i.number ? String(i.number) : null);
  }
  return {
    range,
    period,
    previous,
    stats,
    before,
    change: {
      invoiced: changePercent(stats.invoiced, before.invoiced),
      collected: changePercent(stats.collected, before.collected),
    },
    series: ((series.data ?? []) as Json[]).map((p) => ({
      month: String(p.month),
      invoiced: money(p.invoiced),
      collected: money(p.collected),
    })),
    recent: ((recent.data ?? []) as Json[]).map(toLine),
    attention: {
      overdue: ((overdue.data ?? []) as Json[]).map(toLine),
      dueSoon: ((soon.data ?? []) as Json[]).map(toLine),
    },
    payments: (links.data ?? []).map((l) => ({
      id: String(l.id),
      invoiceId: String(l.invoice_id),
      number: numbers.get(String(l.invoice_id)) ?? null,
      amount: money(l.amount),
      at: String(l.applied_at),
    })),
  };
}

/** The widgets this person may use, in the order they saved (new widgets at the end). */
export async function getLayout(
  actor: Actor,
  allowed: ReadonlySet<WidgetId>,
): Promise<WidgetState[]> {
  if (!actor.companyId) return defaultLayout().filter((w) => allowed.has(w.id));
  const { data, error } = await getAdminSupabase()
    .from('dashboard_layouts')
    .select('widgets')
    .eq('company_id', actor.companyId)
    .eq('user_id', actor.userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return normalizeLayout(data?.widgets ?? [], allowed);
}

export async function saveLayout(actor: Actor, widgets: WidgetState[]): Promise<WidgetState[]> {
  if (!actor.companyId) throw new InternalError(new Error('Company missing.'));
  const parsed = layoutSchema.parse({ widgets });
  const admin = getAdminSupabase();
  const existing = await admin
    .from('dashboard_layouts')
    .select('id, version')
    .eq('company_id', actor.companyId)
    .eq('user_id', actor.userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  if (existing.data) {
    const r = await admin
      .from('dashboard_layouts')
      .update({ widgets: parsed.widgets, version: toInt(existing.data.version, 1) + 1 })
      .eq('id', String(existing.data.id))
      .eq('company_id', actor.companyId);
    if (r.error) throw new InternalError(r.error);
  } else {
    const r = await admin
      .from('dashboard_layouts')
      .insert({ company_id: actor.companyId, user_id: actor.userId, widgets: parsed.widgets });
    if (r.error && r.error.code !== '23505') throw new InternalError(r.error);
  }
  return parsed.widgets;
}
