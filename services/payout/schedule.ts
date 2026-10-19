// path: services/payout/schedule.ts
// The automatic payout of a company (daily, weekly or monthly) and the job that runs the schedules. A scheduled payout
// takes the available balance above the amount the owner wants to keep, stays under the large payout threshold (so no
// second person is needed) and has a key made from the schedule and the run time, so a repeated run pays once.
import 'server-only';
import { PAYOUT_STEP_UP_SECONDS } from '@/config/s14-payouts';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { nextRun, type Frequency } from '@/lib/payment/payout';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getWallet } from '@/services/wallet/wallet-service';
import type { Actor } from '@/types/contracts';
import { getMethod } from './methods';
import { requestScheduledPayout } from './payouts';
import { loadPayoutRules } from './settings';

const log = createLogger({ component: 'payout-schedule' });

export interface ScheduleView {
  id: string;
  methodId: string;
  frequency: Frequency;
  weekday: number | null;
  monthDay: number | null;
  keepAmount: string;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
}

const COLUMNS = 'id, company_id, method_id, frequency, weekday, month_day, keep_amount, enabled, next_run_at, last_run_at, version';

interface Row {
  id: string;
  company_id: string;
  method_id: string;
  frequency: Frequency;
  weekday: number | null;
  month_day: number | null;
  keep_amount: string | number;
  enabled: boolean;
  next_run_at: string;
  last_run_at: string | null;
}

const view = (r: Row): ScheduleView => ({
  id: r.id,
  methodId: r.method_id,
  frequency: r.frequency,
  weekday: r.weekday,
  monthDay: r.month_day,
  keepAmount: Money.parseRounded(String(r.keep_amount)).toDbString(),
  enabled: r.enabled,
  nextRunAt: r.next_run_at,
  lastRunAt: r.last_run_at,
});

export async function getSchedule(companyId: string): Promise<ScheduleView | null> {
  const { data, error } = await getAdminSupabase()
    .from('payout_schedules')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data ? view(data as Row) : null;
}

export interface ScheduleInput {
  methodId: string;
  frequency: Frequency;
  weekday?: number | null;
  monthDay?: number | null;
  keepAmount?: string;
  enabled?: boolean;
}

/** Saves the schedule of the company (one per company). The owner sees the next run time on the wallet page. */
export async function saveSchedule(actor: Actor, input: ScheduleInput): Promise<ScheduleView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ForbiddenError();
  if (!(await getService('permissions').can(actor, 'payout.method.manage', { type: 'payout_schedule', id: null })))
    throw new ForbiddenError();
  await getService('auth').requireStepUp(actor, { maxAgeSeconds: PAYOUT_STEP_UP_SECONDS });
  if (!['daily', 'weekly', 'monthly'].includes(input.frequency)) throw new ValidationError('Choose daily, weekly or monthly.');
  const weekday = input.frequency === 'weekly' ? input.weekday ?? 1 : null;
  const monthDay = input.frequency === 'monthly' ? input.monthDay ?? 1 : null;
  if (weekday !== null && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) throw new ValidationError('Choose a weekday.');
  if (monthDay !== null && (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 28)) throw new ValidationError('Choose a day between 1 and 28.');
  const keep = Money.parse(input.keepAmount ?? '0');
  if (keep.isNegative()) throw new ValidationError('The amount to keep cannot be negative.');
  const method = await getMethod(companyId, input.methodId);
  if (method.status !== 'active') throw new ValidationError('This payout method is switched off.');
  const values = {
    method_id: method.id,
    frequency: input.frequency,
    weekday,
    month_day: monthDay,
    keep_amount: keep.toDbString(),
    enabled: input.enabled ?? true,
    next_run_at: nextRun(new Date(), input.frequency, weekday, monthDay).toISOString(),
  };
  const current = await getSchedule(companyId);
  const admin = getAdminSupabase();
  const written = current
    ? await admin.from('payout_schedules').update(values).eq('id', current.id).select(COLUMNS).single()
    : await admin.from('payout_schedules').insert({ company_id: companyId, ...values }).select(COLUMNS).single();
  if (written.error) throw new InternalError(written.error);
  await getService('audit').record({
    action: 'payout.schedule_saved',
    resourceType: 'payout_schedule',
    resourceId: String(written.data.id),
    companyId,
    metadata: { frequency: input.frequency, enabled: values.enabled },
  });
  return view(written.data as Row);
}

export async function removeSchedule(actor: Actor): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ForbiddenError();
  if (!(await getService('permissions').can(actor, 'payout.method.manage', { type: 'payout_schedule', id: null })))
    throw new ForbiddenError();
  const current = await getSchedule(companyId);
  if (!current) throw new NotFoundError();
  const { error } = await getAdminSupabase()
    .from('payout_schedules')
    .update({ deleted_at: new Date().toISOString(), enabled: false })
    .eq('id', current.id);
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'payout.schedule_removed',
    resourceType: 'payout_schedule',
    resourceId: current.id,
    companyId,
    metadata: {},
  });
}

/** Runs the schedules that are due. Returns how many payouts were requested. Safe to run again. */
export async function runSchedules(now: Date = new Date()): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('payout_schedules')
    .select(COLUMNS)
    .eq('enabled', true)
    .lte('next_run_at', now.toISOString())
    .is('deleted_at', null)
    .order('next_run_at')
    .limit(200);
  if (error) throw new InternalError(error);
  let requested = 0;
  for (const s of (data ?? []) as Row[]) {
    try {
      if (await runOne(s)) requested += 1;
    } catch (thrown) {
      log.error('scheduled payout not made', { scheduleId: s.id, error: String(thrown) });
    }
    // The next run is set even when this one made no payout (not enough balance, or an error), so it is not retried every hour.
    const { error: upError } = await getAdminSupabase()
      .from('payout_schedules')
      .update({ last_run_at: now.toISOString(), next_run_at: nextRun(now, s.frequency, s.weekday, s.month_day).toISOString() })
      .eq('id', s.id)
      .eq('next_run_at', s.next_run_at);
    if (upError) throw new InternalError(upError);
  }
  return requested;
}

async function runOne(s: Row): Promise<boolean> {
  const wallet = await getWallet(s.company_id);
  if (!wallet || wallet.status !== 'active') return false;
  const rules = await loadPayoutRules(s.company_id);
  const room = Money.parse(rules.largeThreshold).sub('0.0001');
  const spendable = Money.parseRounded(wallet.available).sub(Money.parseRounded(String(s.keep_amount)));
  const amount = spendable.gt(room) ? room : spendable;
  if (!amount.isPositive() || amount.lt(rules.minAmount)) return false;
  await requestScheduledPayout(s.company_id, {
    methodId: s.method_id,
    amount,
    idempotencyKey: `schedule:${s.id}:${s.next_run_at}`.slice(0, 128),
    note: 'Scheduled payout',
  });
  return true;
}
