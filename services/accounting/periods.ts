// path: services/accounting/periods.ts
// Fiscal periods of a company: the settings, years of 12 months, closing and reopening a month (with the sign-off of the
// person who closes it), a lock per module, the close checklists, and the year-end close that moves the result of the year to
// retained earnings. The database refuses a posting into a closed period; this file is the way to open and close them.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { listAccounts, resolveAccount } from './accounts';
import { mapAccountingError } from './db-errors';
import { postSystemEntry, type SystemEntry } from './journals';
import {
  addMonthsToDay,
  canClose,
  closeInput,
  closingLines,
  fiscalYearLabel,
  fiscalYearStart,
  moduleLockInput,
  reopenInput,
  settingsInput,
  type BalanceRow,
  type CheckItem,
} from './period-rules';

export interface AccountingSettings {
  fiscalStartMonth: number;
  closedPeriodPolicy: 'next_open' | 'fail';
  lockDate: string | null;
}

export interface PeriodView {
  id: string;
  fiscalYearId: string;
  number: number;
  name: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
  arClosed: boolean;
  apClosed: boolean;
  closedAt: string | null;
  signoffNote: string;
  reopenCount: number;
  version: number;
}

export interface YearView {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
  closingEntryId: string | null;
  closedAt: string | null;
  periods: PeriodView[];
}

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

async function audit(
  companyId: string,
  action: string,
  resourceId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'fiscal_period',
    resourceId,
    companyId,
    metadata,
  });
}

export async function getSettings(companyId: string): Promise<AccountingSettings> {
  const { data, error } = await getAdminSupabase()
    .from('accounting_settings')
    .select('fiscal_start_month, closed_period_policy, lock_date')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return {
    fiscalStartMonth: data ? toInt(data.fiscal_start_month) : 1,
    closedPeriodPolicy: data?.closed_period_policy === 'fail' ? 'fail' : 'next_open',
    lockDate: data?.lock_date ? String(data.lock_date) : null,
  };
}

export async function saveSettings(actor: Actor, input: unknown): Promise<AccountingSettings> {
  const companyId = need(actor);
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The settings are not valid.');
  const d = parsed.data;
  const admin = getAdminSupabase();
  const current = await getSettings(companyId);
  if (d.fiscalStartMonth !== undefined && d.fiscalStartMonth !== current.fiscalStartMonth) {
    const { count, error } = await admin
      .from('fiscal_years')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('deleted_at', null);
    if (error) throw new InternalError(error);
    if ((count ?? 0) > 0)
      throw new ConflictError(
        'The first month of the fiscal year cannot change once a year exists.',
      );
  }
  const patch: Record<string, unknown> = { updated_by: actor.userId };
  if (d.fiscalStartMonth !== undefined) patch.fiscal_start_month = d.fiscalStartMonth;
  if (d.closedPeriodPolicy !== undefined) patch.closed_period_policy = d.closedPeriodPolicy;
  if (d.lockDate !== undefined) patch.lock_date = d.lockDate;
  const exists = await admin
    .from('accounting_settings')
    .select('id')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (exists.error) throw new InternalError(exists.error);
  const written = exists.data
    ? await admin.from('accounting_settings').update(patch).eq('id', exists.data.id)
    : await admin.from('accounting_settings').insert({ ...patch, company_id: companyId });
  if (written.error) mapAccountingError(written.error);
  await audit(companyId, 'accounting.settings_saved', null, { fields: Object.keys(d) });
  return getSettings(companyId);
}

const PERIOD_COLUMNS =
  'id, fiscal_year_id, number, name, start_date, end_date, status, ar_closed, ap_closed, closed_at, signoff_note, reopen_count, version';

interface PeriodRow {
  id: string;
  fiscal_year_id: string;
  number: number;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  ar_closed: boolean;
  ap_closed: boolean;
  closed_at: string | null;
  signoff_note: string;
  reopen_count: number;
  version: number;
}

const periodView = (r: PeriodRow): PeriodView => ({
  id: r.id,
  fiscalYearId: r.fiscal_year_id,
  number: toInt(r.number),
  name: r.name,
  startDate: String(r.start_date),
  endDate: String(r.end_date),
  status: r.status === 'closed' ? 'closed' : 'open',
  arClosed: r.ar_closed,
  apClosed: r.ap_closed,
  closedAt: r.closed_at,
  signoffNote: r.signoff_note,
  reopenCount: toInt(r.reopen_count),
  version: toInt(r.version),
});

export async function listYears(companyId: string): Promise<YearView[]> {
  const admin = getAdminSupabase();
  const [years, periods] = await Promise.all([
    admin
      .from('fiscal_years')
      .select('id, label, start_date, end_date, status, closing_entry_id, closed_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('start_date', { ascending: false })
      .limit(50),
    admin
      .from('fiscal_periods')
      .select(PERIOD_COLUMNS)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('start_date', { ascending: true })
      .limit(700),
  ]);
  if (years.error) throw new InternalError(years.error);
  if (periods.error) throw new InternalError(periods.error);
  const byYear = new Map<string, PeriodView[]>();
  for (const p of (periods.data ?? []) as unknown as PeriodRow[])
    byYear.set(p.fiscal_year_id, [...(byYear.get(p.fiscal_year_id) ?? []), periodView(p)]);
  return (years.data ?? []).map((y) => ({
    id: String(y.id),
    label: String(y.label),
    startDate: String(y.start_date),
    endDate: String(y.end_date),
    status: y.status === 'closed' ? 'closed' : 'open',
    closingEntryId: y.closing_entry_id ? String(y.closing_entry_id) : null,
    closedAt: y.closed_at ? String(y.closed_at) : null,
    periods: byYear.get(String(y.id)) ?? [],
  }));
}

async function periodOf(companyId: string, id: string): Promise<PeriodView> {
  const { data, error } = await getAdminSupabase()
    .from('fiscal_periods')
    .select(PERIOD_COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return periodView(data as unknown as PeriodRow);
}

/** Makes the fiscal year that holds `date` if it does not exist (12 monthly periods). Returns the year id. */
export async function ensureYearFor(companyId: string, date: string): Promise<string> {
  const settings = await getSettings(companyId);
  const start = fiscalYearStart(date, settings.fiscalStartMonth);
  const { data, error } = await getAdminSupabase().rpc('kd_fiscal_year_create', {
    p_company: companyId,
    p_start: start,
    p_label: fiscalYearLabel(start),
  });
  if (error) mapAccountingError(error);
  return String(data);
}

/** Sets up the fiscal year of `date` and the next one. */
export async function setupYears(actor: Actor, date: string): Promise<YearView[]> {
  const companyId = need(actor);
  const first = await ensureYearFor(companyId, date);
  const settings = await getSettings(companyId);
  const start = fiscalYearStart(date, settings.fiscalStartMonth);
  const next = addMonthsToDay(start, 12);
  const { error } = await getAdminSupabase().rpc('kd_fiscal_year_create', {
    p_company: companyId,
    p_start: next,
    p_label: fiscalYearLabel(next),
  });
  if (error) mapAccountingError(error);
  await audit(companyId, 'accounting.years_set_up', first, { start });
  return listYears(companyId);
}

export async function closePeriod(actor: Actor, id: string, input: unknown): Promise<PeriodView> {
  const companyId = need(actor);
  const parsed = closeInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The note is not valid.');
  const checklist = await periodChecklist(companyId, id);
  if (!canClose(checklist))
    throw new ConflictError(
      `Finish the checklist first: ${checklist
        .filter((c) => !c.done)
        .map((c) => c.label)
        .join('; ')}`,
    );
  const { error } = await getAdminSupabase().rpc('kd_period_close', {
    p_company: companyId,
    p_period: id,
    p_actor: actor.userId,
    p_note: parsed.data.note,
  });
  if (error) mapAccountingError(error);
  await audit(companyId, 'accounting.period_closed', id, { note: parsed.data.note });
  return periodOf(companyId, id);
}

/** Reopens a closed month. The caller has confirmed the identity again (step-up) and gave a reason; both are audited. */
export async function reopenPeriod(actor: Actor, id: string, input: unknown): Promise<PeriodView> {
  const companyId = need(actor);
  const parsed = reopenInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? 'Give a reason of at least 10 characters.',
    );
  const { error } = await getAdminSupabase().rpc('kd_period_reopen', {
    p_company: companyId,
    p_period: id,
    p_actor: actor.userId,
    p_reason: parsed.data.reason,
  });
  if (error) mapAccountingError(error);
  await audit(companyId, 'accounting.period_reopened', id, { reason: parsed.data.reason });
  try {
    await getService('notification').notify({
      companyId,
      type: 'accounting.period_reopened',
      title: 'A closed period was reopened',
      body: parsed.data.reason.slice(0, 200),
      href: '/accounting/periods',
    });
  } catch {
    // The reopening is audited; a notice that fails does not undo it.
  }
  return periodOf(companyId, id);
}

export async function setModuleLock(actor: Actor, id: string, input: unknown): Promise<PeriodView> {
  const companyId = need(actor);
  const parsed = moduleLockInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The lock is not valid.');
  const period = await periodOf(companyId, id);
  if (period.status === 'closed') throw new ConflictError('The whole period is closed already.');
  const column = parsed.data.module === 'ar' ? 'ar_closed' : 'ap_closed';
  const { error } = await getAdminSupabase()
    .from('fiscal_periods')
    .update({ [column]: parsed.data.locked })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', period.version);
  if (error) mapAccountingError(error);
  await audit(companyId, 'accounting.period_module_lock', id, parsed.data);
  return periodOf(companyId, id);
}

async function unpostedIn(companyId: string, from: string, to: string): Promise<number> {
  const { count: n, error } = await getAdminSupabase()
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .neq('status', 'posted')
    .gte('entry_date', from)
    .lte('entry_date', to);
  if (error) throw new InternalError(error);
  return n ?? 0;
}

async function failedPostings(companyId: string, from: string, to: string): Promise<number> {
  const { count: n, error } = await getAdminSupabase()
    .from('posting_log')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('status', 'failed')
    .gte('created_at', `${from}T00:00:00.000Z`)
    .lte('created_at', `${to}T23:59:59.999Z`);
  if (error) throw new InternalError(error);
  return n ?? 0;
}

async function unreviewedIn(companyId: string, from: string, to: string): Promise<number> {
  const { count: n, error } = await getAdminSupabase()
    .from('posting_log')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('status', 'posted')
    .is('reviewed_at', null)
    .gte('created_at', `${from}T00:00:00.000Z`)
    .lte('created_at', `${to}T23:59:59.999Z`);
  if (error) throw new InternalError(error);
  return n ?? 0;
}

/** The monthly close checklist (generated, never typed): entries to post, failed postings, system entries to review. */
export async function periodChecklist(companyId: string, id: string): Promise<CheckItem[]> {
  const p = await periodOf(companyId, id);
  const [unposted, failed, unreviewed] = await Promise.all([
    unpostedIn(companyId, p.startDate, p.endDate),
    failedPostings(companyId, p.startDate, p.endDate),
    unreviewedIn(companyId, p.startDate, p.endDate),
  ]);
  return [
    {
      key: 'entries_posted',
      label: 'Every journal entry of the month is posted',
      done: unposted === 0,
      remaining: unposted,
    },
    {
      key: 'postings_ok',
      label: 'No automatic posting has failed',
      done: failed === 0,
      remaining: failed,
    },
    {
      key: 'postings_reviewed',
      label: 'The automatic entries are reviewed',
      done: unreviewed === 0,
      remaining: unreviewed,
    },
  ];
}

export interface YearChecklist {
  items: CheckItem[];
  netIncome: string;
  ready: boolean;
}

async function balancesOf(companyId: string, from: string, to: string): Promise<BalanceRow[]> {
  const { data, error } = await getAdminSupabase().rpc('kd_period_balances', {
    p_company: companyId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new InternalError(error);
  const accounts = new Map((await listAccounts(companyId)).map((a) => [a.id, a]));
  const rows: BalanceRow[] = [];
  for (const r of (data ?? []) as {
    account_id: string;
    debit: string | number;
    credit: string | number;
  }[]) {
    const a = accounts.get(String(r.account_id));
    if (!a) continue;
    rows.push({
      accountId: a.id,
      type: a.type as BalanceRow['type'],
      debit: Money.parseRounded(String(r.debit)).toDbString(),
      credit: Money.parseRounded(String(r.credit)).toDbString(),
    });
  }
  return rows;
}

async function yearOf(companyId: string, id: string): Promise<YearView> {
  const year = (await listYears(companyId)).find((y) => y.id === id);
  if (!year) throw new NotFoundError();
  return year;
}

/** The year-end checklist: no unposted entries in the year, no failed postings, and the result of the year. */
export async function yearChecklist(companyId: string, id: string): Promise<YearChecklist> {
  const y = await yearOf(companyId, id);
  const [unposted, failed, rows] = await Promise.all([
    unpostedIn(companyId, y.startDate, y.endDate),
    failedPostings(companyId, y.startDate, y.endDate),
    balancesOf(companyId, y.startDate, y.endDate),
  ]);
  const retained = await resolveAccount(companyId, 'retained_earnings');
  const { netIncome } = closingLines(rows, retained);
  const items: CheckItem[] = [
    {
      key: 'entries_posted',
      label: 'Every journal entry of the year is posted',
      done: unposted === 0,
      remaining: unposted,
    },
    {
      key: 'postings_ok',
      label: 'No automatic posting has failed',
      done: failed === 0,
      remaining: failed,
    },
    { key: 'year_open', label: 'The year is open', done: y.status === 'open', remaining: null },
  ];
  return { items, netIncome: netIncome.toDbString(), ready: canClose(items) };
}

/**
 * Closes a year: the closing entry moves revenue and expense to retained earnings (dated the last day, once per year), every
 * month is closed and signed off, and the year is marked closed. Each step is safe to repeat if the call stops half way.
 */
export async function closeYear(actor: Actor, id: string, note: string): Promise<YearView> {
  const companyId = need(actor);
  const y = await yearOf(companyId, id);
  if (y.status === 'closed') return y;
  const check = await yearChecklist(companyId, id);
  if (!check.ready)
    throw new ConflictError(
      `Finish the checklist first: ${check.items
        .filter((c) => !c.done)
        .map((c) => c.label)
        .join('; ')}`,
    );
  const admin = getAdminSupabase();
  const retained = await resolveAccount(companyId, 'retained_earnings');
  const rows = await balancesOf(companyId, y.startDate, y.endDate);
  const closing = closingLines(rows, retained);
  let entryId: string | null = null;
  if (closing.lines.length >= 2) {
    const entry: SystemEntry = {
      companyId,
      date: y.endDate,
      memo: `Closing entry ${y.label}`,
      sourceType: 'year_end',
      sourceId: y.id,
      sourceKey: `yearend:${y.id}`,
      kind: 'closing',
      lines: closing.lines,
    };
    entryId = (await postSystemEntry(entry)).entryId;
  }
  for (const p of y.periods) {
    if (p.status === 'closed') continue;
    const { error } = await admin.rpc('kd_period_close', {
      p_company: companyId,
      p_period: p.id,
      p_actor: actor.userId,
      p_note: note || `Year end ${y.label}`,
    });
    if (error) mapAccountingError(error);
  }
  const done = await admin
    .from('fiscal_years')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: actor.userId,
      closing_entry_id: entryId,
    })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('status', 'open');
  if (done.error) mapAccountingError(done.error);
  await audit(companyId, 'accounting.year_closed', id, {
    label: y.label,
    netIncome: closing.netIncome.toDbString(),
    entryId,
  });
  return yearOf(companyId, id);
}

/** Reopens a closed year: the closing entry is reversed and the months are opened. Reason and identity check as for a month. */
export async function reopenYear(actor: Actor, id: string, input: unknown): Promise<YearView> {
  const companyId = need(actor);
  const parsed = reopenInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? 'Give a reason of at least 10 characters.',
    );
  const y = await yearOf(companyId, id);
  if (y.status !== 'closed') throw new ConflictError('The year is not closed.');
  const admin = getAdminSupabase();
  const open = await admin
    .from('fiscal_years')
    .update({ status: 'open', closed_at: null, closed_by: null })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('status', 'closed');
  if (open.error) mapAccountingError(open.error);
  for (const p of y.periods) {
    const { error } = await admin.rpc('kd_period_reopen', {
      p_company: companyId,
      p_period: p.id,
      p_actor: actor.userId,
      p_reason: parsed.data.reason,
    });
    if (error) mapAccountingError(error);
  }
  if (y.closingEntryId) {
    const { error } = await admin.rpc('kd_journal_reverse', {
      p_company: companyId,
      p_entry: y.closingEntryId,
      p_date: y.endDate,
      p_reason: `Year ${y.label} reopened`,
      p_actor: actor.userId,
    });
    if (error && error.code !== '55000') mapAccountingError(error);
    await admin.from('fiscal_years').update({ closing_entry_id: null }).eq('id', id);
  }
  await audit(companyId, 'accounting.year_reopened', id, {
    label: y.label,
    reason: parsed.data.reason,
  });
  return yearOf(companyId, id);
}

/** The first day of an open period after `date` (for an event that arrives for a closed period), or null. */
export async function nextOpenDate(companyId: string, date: string): Promise<string | null> {
  const { data, error } = await getAdminSupabase()
    .from('fiscal_periods')
    .select('start_date')
    .eq('company_id', companyId)
    .eq('status', 'open')
    .eq('ar_closed', false)
    .eq('ap_closed', false)
    .is('deleted_at', null)
    .gt('start_date', date)
    .order('start_date', { ascending: true })
    .limit(1);
  if (error) throw new InternalError(error);
  return data?.[0] ? String(data[0].start_date) : null;
}
