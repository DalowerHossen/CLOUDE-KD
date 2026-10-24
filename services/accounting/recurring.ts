// path: services/accounting/recurring.ts
// Recurring journal entries (rent, accruals, allocations): a monthly, quarterly or yearly entry that a daily job makes as a
// draft or posts. Each run has its own source key, so a job that runs twice makes the entry once. A run that fails (for example
// the period is closed) is kept on the entry with the reason and tried again the next day.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from './db-errors';
import { linesJson, type JournalLineInput } from './journal-rules';
import { dueDates, nextRun, recurringInput, type RecurringInput } from './period-rules';

const log = createLogger({ component: 'accounting-recurring' });

export interface RecurringView {
  id: string;
  name: string;
  memo: string;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  dayOfMonth: number;
  nextRun: string;
  endDate: string | null;
  autoPost: boolean;
  status: 'active' | 'paused' | 'finished';
  runCount: number;
  lastRun: string | null;
  lastError: string | null;
  lines: JournalLineInput[];
}

const COLUMNS =
  'id, name, memo, frequency, day_of_month, next_run, end_date, auto_post, status, run_count, last_run, last_error, lines';

interface Row {
  id: string;
  name: string;
  memo: string;
  frequency: string;
  day_of_month: number;
  next_run: string;
  end_date: string | null;
  auto_post: boolean;
  status: string;
  run_count: number;
  last_run: string | null;
  last_error: string | null;
  lines: JournalLineInput[];
}

const view = (r: Row): RecurringView => ({
  id: r.id,
  name: r.name,
  memo: r.memo,
  frequency:
    r.frequency === 'yearly' ? 'yearly' : r.frequency === 'quarterly' ? 'quarterly' : 'monthly',
  dayOfMonth: toInt(r.day_of_month),
  nextRun: String(r.next_run),
  endDate: r.end_date ? String(r.end_date) : null,
  autoPost: r.auto_post,
  status: r.status === 'paused' ? 'paused' : r.status === 'finished' ? 'finished' : 'active',
  runCount: toInt(r.run_count),
  lastRun: r.last_run ? String(r.last_run) : null,
  lastError: r.last_error,
  lines: r.lines,
});

export async function listRecurring(companyId: string): Promise<RecurringView[]> {
  const { data, error } = await getAdminSupabase()
    .from('recurring_journals')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('next_run', { ascending: true })
    .limit(200);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(view);
}

export async function createRecurring(actor: Actor, input: unknown): Promise<RecurringView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = recurringInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? 'The recurring entry is not valid.',
    );
  const d: RecurringInput = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('recurring_journals')
    .insert({
      company_id: companyId,
      name: d.name,
      memo: d.memo,
      frequency: d.frequency,
      day_of_month: d.dayOfMonth,
      next_run: d.firstRun,
      end_date: d.endDate,
      auto_post: d.autoPost,
      lines: d.lines,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapAccountingError(error);
  const created = view(data as unknown as Row);
  await getService('audit').record({
    action: 'accounting.recurring_created',
    resourceType: 'recurring_journal',
    resourceId: created.id,
    companyId,
    metadata: { name: d.name },
  });
  return created;
}

export async function setRecurringStatus(
  actor: Actor,
  id: string,
  status: 'active' | 'paused',
): Promise<RecurringView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase()
    .from('recurring_journals')
    .update({ status })
    .eq('company_id', companyId)
    .eq('id', id)
    .neq('status', 'finished')
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) mapAccountingError(error);
  const row = (data ?? [])[0] as unknown as Row | undefined;
  if (!row) throw new NotFoundError();
  await getService('audit').record({
    action: `accounting.recurring_${status}`,
    resourceType: 'recurring_journal',
    resourceId: id,
    companyId,
    metadata: {},
  });
  return view(row);
}

export async function removeRecurring(actor: Actor, id: string): Promise<void> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const { data, error } = await getAdminSupabase()
    .from('recurring_journals')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'accounting.recurring_removed',
    resourceType: 'recurring_journal',
    resourceId: id,
    companyId,
    metadata: {},
  });
}

export interface RecurringRunResult {
  checked: number;
  made: number;
  failed: number;
}

/** Job: makes the entries that are due. Safe to run again: each run date has its own source key. */
export async function runDueRecurring(
  today: string = new Date().toISOString().slice(0, 10),
): Promise<RecurringRunResult> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('recurring_journals')
    .select(`${COLUMNS}, company_id, created_by`)
    .eq('status', 'active')
    .is('deleted_at', null)
    .lte('next_run', today)
    .limit(1000);
  if (error) throw new InternalError(error);
  const out: RecurringRunResult = { checked: 0, made: 0, failed: 0 };
  for (const raw of (data ?? []) as unknown as (Row & {
    company_id: string;
    created_by: string | null;
  })[]) {
    out.checked += 1;
    const rec = view(raw);
    let next = rec.nextRun;
    let runs = rec.runCount;
    let lastRun = rec.lastRun;
    let lastError: string | null = null;
    for (const day of dueDates(rec.nextRun, today, rec.frequency, rec.dayOfMonth, rec.endDate)) {
      const res = await admin.rpc('kd_journal_create', {
        p_company: raw.company_id,
        p_date: day,
        p_memo: rec.memo || rec.name,
        p_source: 'recurring',
        p_source_type: 'recurring_journal',
        p_source_id: rec.id,
        p_source_key: `recurring:${rec.id}:${day}`,
        p_lines: linesJson(rec.lines),
        p_actor: raw.created_by,
        p_status: rec.autoPost ? 'posted' : 'draft',
        p_allow_duplicate: true,
        p_note: '',
        p_reverses: null,
        p_reason: null,
        p_kind: 'normal',
      });
      if (res.error) {
        lastError = res.error.message.slice(0, 500);
        log.error('recurring entry failed', { id: rec.id, day, error: lastError });
        out.failed += 1;
        break;
      }
      out.made += 1;
      runs += 1;
      lastRun = day;
      next = nextRun(day, rec.frequency, rec.dayOfMonth);
    }
    const finished = rec.endDate !== null && next > rec.endDate;
    const { error: upError } = await admin
      .from('recurring_journals')
      .update({
        next_run: next,
        run_count: runs,
        last_run: lastRun,
        last_error: lastError,
        status: finished ? 'finished' : 'active',
      })
      .eq('id', rec.id);
    if (upError) log.error('recurring state not saved', { id: rec.id, error: upError.message });
    if (lastError) {
      try {
        await getService('notification').notify({
          companyId: raw.company_id,
          type: 'accounting.recurring_failed',
          title: 'A recurring entry could not be made',
          body: `${rec.name}: ${lastError}`.slice(0, 200),
          href: '/accounting/recurring',
        });
      } catch {
        // The failure stays on the entry for the owner to see.
      }
    }
  }
  return out;
}
