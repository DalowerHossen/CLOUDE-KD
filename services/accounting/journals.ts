// path: services/accounting/journals.ts
// Journal entries of a company. A manual entry starts as a draft and can be changed until it is posted. An owner posts at
// once; a staff member's entry waits for the owner (approval chain). A posted entry never changes: it is undone by a
// reversing entry. System entries (STEP 15.2) come in through `postSystemEntry`, once per source key.
// The database function checks debit equals credit, the accounts and the duplicate hash; this file maps its answers.
import 'server-only';
import { JOURNAL_APPROVAL_ACTION, MAX_IMPORT_BYTES } from '@/config/s15-accounting';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { listAccounts } from './accounts';
import { mapAccountingError } from './db-errors';
import {
  dayText,
  journalDraftInput,
  journalInput,
  linesJson,
  parseJournalCsv,
  postRoute,
  reverseLines,
  templateInput,
  totals,
  type JournalLineInput,
} from './journal-rules';

export interface JournalLineView {
  lineNo: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  description: string;
}

export interface JournalSummary {
  id: string;
  number: string | null;
  entryDate: string;
  memo: string;
  status: 'draft' | 'pending_approval' | 'posted';
  source: string;
  total: string;
  reversedById: string | null;
  reversesId: string | null;
  duplicateOf: string | null;
  version: number;
  createdAt: string;
}

export interface JournalView extends JournalSummary {
  note: string;
  sourceType: string | null;
  sourceId: string | null;
  lines: JournalLineView[];
  attachments: { id: string; fileId: string; name: string }[];
}

const COLUMNS =
  'id, entry_number, entry_date, memo, internal_note, status, source, source_type, source_id, total_amount, reversed_by_id, reverses_entry_id, duplicate_of, approval_request_id, version, created_at';

interface Row {
  id: string;
  entry_number: string | null;
  entry_date: string;
  memo: string;
  internal_note: string;
  status: string;
  source: string;
  source_type: string | null;
  source_id: string | null;
  total_amount: string | number;
  reversed_by_id: string | null;
  reverses_entry_id: string | null;
  duplicate_of: string | null;
  approval_request_id: string | null;
  version: number;
  created_at: string;
}

const summary = (r: Row): JournalSummary => ({
  id: r.id,
  number: r.entry_number,
  entryDate: r.entry_date,
  memo: r.memo,
  status:
    r.status === 'posted'
      ? 'posted'
      : r.status === 'pending_approval'
        ? 'pending_approval'
        : 'draft',
  source: r.source,
  total: Money.parseRounded(String(r.total_amount)).toDbString(),
  reversedById: r.reversed_by_id,
  reversesId: r.reverses_entry_id,
  duplicateOf: r.duplicate_of,
  version: r.version,
  createdAt: r.created_at,
});

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

async function audit(
  companyId: string,
  action: string,
  id: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'journal_entry',
    resourceId: id,
    companyId,
    metadata,
  });
}

async function rowOf(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('journal_entries')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

export interface JournalFilter {
  from?: string;
  to?: string;
  status?: string;
  source?: string;
  accountId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listJournals(
  companyId: string,
  f: JournalFilter = {},
): Promise<{ rows: JournalSummary[]; total: number }> {
  const admin = getAdminSupabase();
  let ids: string[] | null = null;
  if (f.accountId) {
    const { data, error } = await admin
      .from('journal_lines')
      .select('entry_id')
      .eq('company_id', companyId)
      .eq('account_id', f.accountId)
      .is('deleted_at', null)
      .limit(20_000);
    if (error) throw new InternalError(error);
    ids = [...new Set((data ?? []).map((r) => String(r.entry_id)))];
    if (ids.length === 0) return { rows: [], total: 0 };
  }
  let q = admin
    .from('journal_entries')
    .select(COLUMNS, { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (ids) q = q.in('id', ids);
  if (f.from) q = q.gte('entry_date', f.from);
  if (f.to) q = q.lte('entry_date', f.to);
  if (f.status) q = q.eq('status', f.status);
  if (f.source) q = q.eq('source', f.source);
  if (f.q) {
    const term = f.q
      .replace(/[%_,()]/g, ' ')
      .trim()
      .slice(0, 60);
    if (term) q = q.or(`memo.ilike.%${term}%,entry_number.ilike.${term}%`);
  }
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const offset = Math.max(f.offset ?? 0, 0);
  const { data, error, count } = await q.range(offset, offset + limit - 1);
  if (error) throw new InternalError(error);
  return { rows: ((data ?? []) as unknown as Row[]).map(summary), total: count ?? 0 };
}

export async function getJournal(companyId: string, id: string): Promise<JournalView> {
  const row = await rowOf(companyId, id);
  const admin = getAdminSupabase();
  const [lines, atts] = await Promise.all([
    admin
      .from('journal_lines')
      .select('line_no, account_id, debit, credit, description, accounts(code, name)')
      .eq('entry_id', id)
      .is('deleted_at', null)
      .order('line_no', { ascending: true }),
    admin
      .from('journal_attachments')
      .select('id, file_id, name')
      .eq('entry_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  ]);
  if (lines.error) throw new InternalError(lines.error);
  if (atts.error) throw new InternalError(atts.error);
  return {
    ...summary(row),
    note: row.internal_note,
    sourceType: row.source_type,
    sourceId: row.source_id,
    lines: (lines.data ?? []).map((l) => {
      const acc = (
        l as unknown as {
          accounts: { code: string; name: string } | { code: string; name: string }[] | null;
        }
      ).accounts;
      const a = Array.isArray(acc) ? acc[0] : acc;
      return {
        lineNo: toInt(l.line_no),
        accountId: String(l.account_id),
        accountCode: a?.code ?? '',
        accountName: a?.name ?? '',
        debit: Money.parseRounded(String(l.debit)).toDbString(),
        credit: Money.parseRounded(String(l.credit)).toDbString(),
        description: String(l.description ?? ''),
      };
    }),
    attachments: (atts.data ?? []).map((a) => ({
      id: String(a.id),
      fileId: String(a.file_id),
      name: String(a.name),
    })),
  };
}

export interface CreateOptions {
  /** `draft` keeps the entry for later; `post` posts it (an owner) or sends it for approval (staff). */
  mode: 'draft' | 'post';
  confirmDuplicate?: boolean;
}

async function askApproval(
  actor: Actor,
  companyId: string,
  entryId: string,
  total: string,
): Promise<void> {
  const state = await getService('approval').request({
    action: JOURNAL_APPROVAL_ACTION,
    payload: { entryId, total },
    requesterId: actor.userId,
    companyId,
  });
  const { error } = await getAdminSupabase()
    .from('journal_entries')
    .update({ approval_request_id: state.requestId })
    .eq('id', entryId);
  if (error) throw new InternalError(error);
}

/** A manual entry. Debit must equal credit when it is posted; a draft may be saved unbalanced. */
export async function createJournal(
  actor: Actor,
  input: unknown,
  options: CreateOptions,
): Promise<JournalView> {
  const companyId = need(actor);
  const schema = options.mode === 'post' ? journalInput : journalDraftInput;
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The entry is not valid.');
  const d = parsed.data;
  const route = options.mode === 'post' ? postRoute(actor.role) : null;
  const status = route === 'post' ? 'posted' : route === 'approval' ? 'pending_approval' : 'draft';
  const { data, error } = await getAdminSupabase().rpc('kd_journal_create', {
    p_company: companyId,
    p_date: d.entryDate,
    p_memo: d.memo,
    p_source: 'manual',
    p_source_type: null,
    p_source_id: null,
    p_source_key: null,
    p_lines: linesJson(d.lines),
    p_actor: actor.userId,
    p_status: status,
    p_allow_duplicate: options.confirmDuplicate === true,
    p_note: d.note,
    p_reverses: null,
    p_reason: null,
  });
  if (error) mapAccountingError(error);
  const entryId = String((data as { entry_id: string }).entry_id);
  if (route === 'approval')
    await askApproval(actor, companyId, entryId, totals(d.lines).debit.toDbString());
  await audit(companyId, 'accounting.journal_created', entryId, {
    status,
    lines: d.lines.length,
  });
  return getJournal(companyId, entryId);
}

export async function updateDraft(
  actor: Actor,
  id: string,
  version: number,
  input: unknown,
): Promise<JournalView> {
  const companyId = need(actor);
  const parsed = journalDraftInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The entry is not valid.');
  const d = parsed.data;
  const { error } = await getAdminSupabase().rpc('kd_journal_replace', {
    p_company: companyId,
    p_entry: id,
    p_version: version,
    p_date: d.entryDate,
    p_memo: d.memo,
    p_note: d.note,
    p_lines: linesJson(d.lines),
    p_actor: actor.userId,
  });
  if (error) mapAccountingError(error);
  await audit(companyId, 'accounting.journal_changed', id, { lines: d.lines.length });
  return getJournal(companyId, id);
}

export async function deleteDraft(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  if (row.status !== 'draft') throw new ConflictError('Only a draft entry can be deleted.');
  const { error } = await getAdminSupabase()
    .from('journal_entries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('status', 'draft');
  if (error) mapAccountingError(error);
  await audit(companyId, 'accounting.journal_deleted', id, {});
}

/** Posts a saved draft (owner) or sends it for approval (staff). */
export async function submitDraft(actor: Actor, id: string): Promise<JournalView> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  if (row.status !== 'draft') throw new ConflictError('Only a draft entry can be posted.');
  const route = postRoute(actor.role);
  const admin = getAdminSupabase();
  if (route === 'post') {
    const { error } = await admin.rpc('kd_journal_post', {
      p_company: companyId,
      p_entry: id,
      p_actor: actor.userId,
    });
    if (error) mapAccountingError(error);
    await audit(companyId, 'accounting.journal_posted', id, {});
  } else {
    const up = await admin
      .from('journal_entries')
      .update({ status: 'pending_approval' })
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('status', 'draft');
    if (up.error) mapAccountingError(up.error);
    await askApproval(
      actor,
      companyId,
      id,
      Money.parseRounded(String(row.total_amount)).toDbString(),
    );
    await audit(companyId, 'accounting.journal_submitted', id, {});
  }
  return getJournal(companyId, id);
}

/** The owner decides an entry that waits for approval. */
export async function decideJournal(
  actor: Actor,
  id: string,
  decision: 'approve' | 'reject',
  reason: string,
): Promise<JournalView> {
  const companyId = need(actor);
  const row = await rowOf(companyId, id);
  if (row.status !== 'pending_approval' || !row.approval_request_id)
    throw new ConflictError('This entry is not waiting for approval.');
  const state = await getService('approval').decide(row.approval_request_id, {
    approverId: actor.userId,
    decision,
    reason,
  });
  const admin = getAdminSupabase();
  if (state.status === 'approved') {
    const { error } = await admin.rpc('kd_journal_post', {
      p_company: companyId,
      p_entry: id,
      p_actor: actor.userId,
    });
    if (error) mapAccountingError(error);
    await audit(companyId, 'accounting.journal_posted', id, { approved: true });
  } else if (
    state.status === 'rejected' ||
    state.status === 'cancelled' ||
    state.status === 'expired'
  ) {
    const { error } = await admin
      .from('journal_entries')
      .update({ status: 'draft', approval_request_id: null })
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('status', 'pending_approval');
    if (error) mapAccountingError(error);
    await audit(companyId, 'accounting.journal_rejected', id, { reason });
  }
  return getJournal(companyId, id);
}

export async function reverseJournal(
  actor: Actor,
  id: string,
  date: string,
  reason: string,
): Promise<JournalView> {
  const companyId = need(actor);
  if (!dayText.safeParse(date).success) throw new ValidationError('Use a date like 2026-10-31.');
  if (reason.trim().length < 3 || /[<>]/.test(reason))
    throw new ValidationError('Give a short reason without angle brackets.');
  const { data, error } = await getAdminSupabase().rpc('kd_journal_reverse', {
    p_company: companyId,
    p_entry: id,
    p_date: date,
    p_reason: reason.trim().slice(0, 300),
    p_actor: actor.userId,
  });
  if (error) mapAccountingError(error);
  const newId = String((data as { entry_id: string }).entry_id);
  await audit(companyId, 'accounting.journal_reversed', id, {
    reversal: newId,
    reason: reason.trim().slice(0, 300),
  });
  return getJournal(companyId, newId);
}

export interface SystemEntry {
  companyId: string;
  date: string;
  memo: string;
  sourceType: string;
  sourceId: string;
  /** One entry per key: a second call with the same key changes nothing. */
  sourceKey: string;
  lines: readonly JournalLineInput[];
}

/** An entry made by the system from a domain event: posted at once, once per source key. */
export async function postSystemEntry(
  entry: SystemEntry,
): Promise<{ entryId: string; replay: boolean }> {
  const parsed = journalInput.safeParse({
    entryDate: entry.date,
    memo: entry.memo,
    lines: entry.lines,
  });
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The entry is not valid.');
  const { data, error } = await getAdminSupabase().rpc('kd_journal_create', {
    p_company: entry.companyId,
    p_date: parsed.data.entryDate,
    p_memo: parsed.data.memo,
    p_source: 'system',
    p_source_type: entry.sourceType,
    p_source_id: entry.sourceId,
    p_source_key: entry.sourceKey,
    p_lines: linesJson(parsed.data.lines),
    p_actor: null,
    p_status: 'posted',
    p_allow_duplicate: true,
    p_note: '',
    p_reverses: null,
    p_reason: null,
  });
  if (error) mapAccountingError(error);
  const out = data as { entry_id: string; replay: boolean };
  return { entryId: String(out.entry_id), replay: out.replay === true };
}

export interface TemplateView {
  id: string;
  name: string;
  memo: string;
  lines: JournalLineInput[];
}

export async function listTemplates(companyId: string): Promise<TemplateView[]> {
  const { data, error } = await getAdminSupabase()
    .from('journal_templates')
    .select('id, name, memo, lines')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(200);
  if (error) throw new InternalError(error);
  return (data ?? []).map((t) => ({
    id: String(t.id),
    name: String(t.name),
    memo: String(t.memo),
    lines: t.lines as JournalLineInput[],
  }));
}

export async function saveTemplate(actor: Actor, input: unknown): Promise<TemplateView> {
  const companyId = need(actor);
  const parsed = templateInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The template is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('journal_templates')
    .insert({
      company_id: companyId,
      name: d.name,
      memo: d.memo,
      lines: d.lines,
      created_by: actor.userId,
    })
    .select('id, name, memo, lines')
    .single();
  if (error) {
    if (error.code === '23505') throw new ConflictError('A template with this name exists.');
    mapAccountingError(error);
  }
  const t = data as { id: string; name: string; memo: string; lines: JournalLineInput[] };
  await audit(companyId, 'accounting.template_saved', t.id, { name: t.name });
  return { id: t.id, name: t.name, memo: t.memo, lines: t.lines };
}

export async function deleteTemplate(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('journal_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await audit(companyId, 'accounting.template_deleted', id, {});
}

export interface JournalImportResult {
  created: number;
  errors: { line: number; message: string }[];
}

/** Makes a draft for each entry of a CSV file (the owner posts them after checking). Entries that look like duplicates are listed. */
export async function importJournals(actor: Actor, csv: string): Promise<JournalImportResult> {
  const companyId = need(actor);
  if (csv.length > MAX_IMPORT_BYTES) throw new ValidationError('The file is too large.');
  const accounts = await listAccounts(companyId, { status: 'active' });
  const parsed = parseJournalCsv(
    csv,
    new Map(accounts.filter((a) => a.allowPosting).map((a) => [a.code, a.id])),
  );
  const errors = [...parsed.errors];
  let created = 0;
  for (const entry of parsed.entries) {
    const { error } = await getAdminSupabase().rpc('kd_journal_create', {
      p_company: companyId,
      p_date: entry.input.entryDate,
      p_memo: entry.input.memo,
      p_source: 'import',
      p_source_type: 'csv',
      p_source_id: entry.reference,
      p_source_key: null,
      p_lines: linesJson(entry.input.lines),
      p_actor: actor.userId,
      p_status: 'draft',
      p_allow_duplicate: false,
      p_note: '',
      p_reverses: null,
      p_reason: null,
    });
    if (error) {
      errors.push({
        line: entry.firstLine,
        message:
          error.code === 'KD001'
            ? `Entry ${entry.reference}: the same entry already exists.`
            : `Entry ${entry.reference}: it could not be added.`,
      });
      continue;
    }
    created += 1;
  }
  await getService('audit').record({
    action: 'accounting.journals_imported',
    resourceType: 'journal_entry',
    resourceId: null,
    companyId,
    metadata: { created, errors: errors.length },
  });
  return { created, errors: errors.sort((x, y) => x.line - y.line) };
}

/** The lines of a reversing entry for the form (debit and credit swapped). */
export function reversePreview(view: JournalView): JournalLineInput[] {
  return reverseLines(
    view.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.debit,
      credit: l.credit,
      description: l.description,
    })),
  );
}
