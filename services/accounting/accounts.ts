// path: services/accounting/accounts.ts
// The chart of accounts of a company: the starting chart, create, change, deactivate, remove, merge, CSV import and export,
// the keys that transactions post to, and the change history. Every change is written to the history and the audit log.
import 'server-only';
import {
  BASE_CHART,
  MAPPING_KEYS,
  MAX_IMPORT_BYTES,
  type CountryTemplate,
  type Industry,
  type MappingKey,
} from '@/config/s15-accounting';
import { getService } from '@/lib/container';
import { toInt } from '@/lib/reports/numbers';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import {
  accountsToCsv,
  accountInput,
  accountUpdate,
  parseAccountsCsv,
  seedChart,
  type AccountInput,
} from './chart-rules';
import { mapAccountingError } from './db-errors';

export interface AccountView {
  id: string;
  code: string;
  name: string;
  description: string;
  type: string;
  subtype: string;
  isContra: boolean;
  normalSide: 'debit' | 'credit';
  parentId: string | null;
  status: 'active' | 'inactive';
  allowPosting: boolean;
  isSystem: boolean;
  systemKey: string | null;
  version: number;
}

const COLUMNS =
  'id, code, name, description, type, subtype, is_contra, normal_side, parent_id, status, allow_posting, is_system, system_key, version';

interface Row {
  id: string;
  code: string;
  name: string;
  description: string;
  type: string;
  subtype: string;
  is_contra: boolean;
  normal_side: string;
  parent_id: string | null;
  status: string;
  allow_posting: boolean;
  is_system: boolean;
  system_key: string | null;
  version: number;
}

const view = (r: Row): AccountView => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.description,
  type: r.type,
  subtype: r.subtype,
  isContra: r.is_contra,
  normalSide: r.normal_side === 'credit' ? 'credit' : 'debit',
  parentId: r.parent_id,
  status: r.status === 'inactive' ? 'inactive' : 'active',
  allowPosting: r.allow_posting,
  isSystem: r.is_system,
  systemKey: r.system_key,
  version: r.version,
});

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

export interface AccountFilter {
  type?: string;
  status?: string;
  q?: string;
}

export async function listAccounts(
  companyId: string,
  filter: AccountFilter = {},
): Promise<AccountView[]> {
  let q = getAdminSupabase()
    .from('accounts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('code', { ascending: true })
    .limit(5000);
  if (filter.type) q = q.eq('type', filter.type);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.q) {
    const term = filter.q
      .replace(/[%_,()]/g, ' ')
      .trim()
      .slice(0, 60);
    if (term) q = q.or(`name.ilike.%${term}%,code.ilike.${term}%`);
  }
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(view);
}

export async function getAccount(companyId: string, id: string): Promise<AccountView> {
  const { data, error } = await getAdminSupabase()
    .from('accounts')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return view(data as unknown as Row);
}

async function history(
  companyId: string,
  accountId: string,
  change: string,
  before: unknown,
  after: unknown,
  actor: Actor,
): Promise<void> {
  const { error } = await getAdminSupabase().from('account_history').insert({
    company_id: companyId,
    account_id: accountId,
    change,
    before,
    after,
    actor_id: actor.userId,
  });
  if (error) throw new InternalError(error);
}

async function audit(
  actor: Actor,
  action: string,
  id: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'account',
    resourceId: id,
    companyId: actor.companyId,
    metadata,
  });
}

export interface SeedResult {
  seeded: boolean;
  created: number;
}

/** Gives a company without accounts the starting chart for its industry and country. Safe to call twice. */
export async function ensureChart(
  actor: Actor,
  industry: Industry = 'general',
  template: CountryTemplate = 'generic',
): Promise<SeedResult> {
  const companyId = need(actor);
  const admin = getAdminSupabase();
  const { count, error: countError } = await admin
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (countError) throw new InternalError(countError);
  if ((count ?? 0) > 0) return { seeded: false, created: 0 };
  const seeds = seedChart(industry, template);
  const ids = new Map<string, string>();
  const keyed = new Map<string, string>();
  for (const s of seeds) {
    const { data, error } = await admin
      .from('accounts')
      .insert({
        company_id: companyId,
        code: s.code,
        name: s.name,
        description: s.description ?? '',
        type: s.type,
        subtype: s.subtype,
        is_contra: s.contra ?? false,
        parent_id: s.parent ? (ids.get(s.parent) ?? null) : null,
        allow_posting: !s.group,
        is_system: s.key !== undefined,
        system_key: s.key ?? null,
        created_by: actor.userId,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return { seeded: false, created: 0 };
      mapAccountingError(error);
    }
    const id = String((data as { id: string }).id);
    ids.set(s.code, id);
    if (s.key) keyed.set(s.key, id);
  }
  const maps = [...keyed.entries()].map(([mapping_key, account_id]) => ({
    company_id: companyId,
    mapping_key,
    account_id,
    updated_by: actor.userId,
  }));
  const ins = await admin.from('account_mappings').insert(maps);
  if (ins.error && ins.error.code !== '23505') throw new InternalError(ins.error);
  await audit(actor, 'accounting.chart_seeded', null, {
    industry,
    template,
    accounts: seeds.length,
  });
  return { seeded: true, created: seeds.length };
}

export async function createAccount(actor: Actor, input: unknown): Promise<AccountView> {
  const companyId = need(actor);
  const parsed = accountInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The account is not valid.');
  const d: AccountInput = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('accounts')
    .insert({
      company_id: companyId,
      code: d.code,
      name: d.name,
      description: d.description,
      type: d.type,
      subtype: d.subtype,
      is_contra: d.isContra,
      parent_id: d.parentId,
      allow_posting: d.allowPosting,
      created_by: actor.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) mapAccountingError(error);
  const created = view(data as unknown as Row);
  await history(companyId, created.id, 'created', null, created, actor);
  await audit(actor, 'accounting.account_created', created.id, { code: created.code });
  return created;
}

export async function updateAccount(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<AccountView> {
  const companyId = need(actor);
  const parsed = accountUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const before = await getAccount(companyId, id);
  const patch: Record<string, unknown> = {};
  if (d.code !== undefined) patch.code = d.code;
  if (d.name !== undefined) patch.name = d.name;
  if (d.description !== undefined) patch.description = d.description;
  if (d.subtype !== undefined) patch.subtype = d.subtype;
  if (d.parentId !== undefined) patch.parent_id = d.parentId;
  if (d.allowPosting !== undefined) patch.allow_posting = d.allowPosting;
  if (d.status !== undefined) patch.status = d.status;
  if (Object.keys(patch).length === 0) return before;
  const { data, error } = await getAdminSupabase()
    .from('accounts')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select(COLUMNS);
  if (error) mapAccountingError(error);
  const row = (data ?? [])[0] as unknown as Row | undefined;
  if (!row) throw new ConflictError('Someone else changed this account. Reload and try again.');
  const after = view(row);
  await history(
    companyId,
    id,
    d.status !== undefined && d.status !== before.status ? `status_${d.status}` : 'changed',
    before,
    after,
    actor,
  );
  await audit(actor, 'accounting.account_changed', id, { fields: Object.keys(patch) });
  return after;
}

/** Removes an account that has no journal lines (the database refuses a system account and one with lines). */
export async function removeAccount(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const before = await getAccount(companyId, id);
  const { count, error: kids } = await getAdminSupabase()
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('parent_id', id)
    .is('deleted_at', null);
  if (kids) throw new InternalError(kids);
  if ((count ?? 0) > 0)
    throw new ConflictError('Move or remove the accounts below this one first.');
  const { error } = await getAdminSupabase()
    .from('accounts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null);
  if (error) mapAccountingError(error);
  await history(companyId, id, 'removed', before, null, actor);
  await audit(actor, 'accounting.account_removed', id, { code: before.code });
}

/**
 * Merges one account into another of the same type: the accounts below it and the transaction keys that point at it move
 * to the target, and the source is made inactive. Posted lines stay where they are (history never changes).
 */
export async function mergeAccounts(
  actor: Actor,
  fromId: string,
  toId: string,
): Promise<AccountView> {
  const companyId = need(actor);
  if (fromId === toId) throw new ValidationError('Choose two different accounts.');
  const [from, to] = await Promise.all([
    getAccount(companyId, fromId),
    getAccount(companyId, toId),
  ]);
  if (from.type !== to.type)
    throw new ValidationError('Only accounts of the same type can be merged.');
  if (to.status !== 'active' || !to.allowPosting)
    throw new ValidationError('The target account must be active and accept postings.');
  const admin = getAdminSupabase();
  const kids = await admin
    .from('accounts')
    .update({ parent_id: toId })
    .eq('company_id', companyId)
    .eq('parent_id', fromId)
    .is('deleted_at', null);
  if (kids.error) mapAccountingError(kids.error);
  const maps = await admin
    .from('account_mappings')
    .update({ account_id: toId, updated_by: actor.userId })
    .eq('company_id', companyId)
    .eq('account_id', fromId)
    .is('deleted_at', null);
  if (maps.error) mapAccountingError(maps.error);
  const off = await admin
    .from('accounts')
    .update({ status: 'inactive' })
    .eq('company_id', companyId)
    .eq('id', fromId);
  if (off.error) mapAccountingError(off.error);
  await history(companyId, fromId, 'merged_into', from, { into: to.code }, actor);
  await history(companyId, toId, 'merged_from', null, { from: from.code }, actor);
  await audit(actor, 'accounting.accounts_merged', fromId, { from: from.code, into: to.code });
  return to;
}

export interface AccountImportResult {
  created: number;
  skipped: number;
  errors: { line: number; message: string }[];
}

/** Adds the accounts of a CSV file. A number that already exists is skipped and reported. */
export async function importAccounts(actor: Actor, csv: string): Promise<AccountImportResult> {
  const companyId = need(actor);
  if (csv.length > MAX_IMPORT_BYTES) throw new ValidationError('The file is too large.');
  const parsed = parseAccountsCsv(csv);
  const existing = new Set((await listAccounts(companyId)).map((a) => a.code));
  const errors = [...parsed.errors];
  let created = 0;
  let skipped = 0;
  for (const a of parsed.accounts) {
    if (existing.has(a.code)) {
      skipped += 1;
      errors.push({ line: a.line, message: `The account number ${a.code} already exists.` });
      continue;
    }
    const { error } = await getAdminSupabase().from('accounts').insert({
      company_id: companyId,
      code: a.code,
      name: a.name,
      description: a.description,
      type: a.type,
      subtype: a.subtype,
      created_by: actor.userId,
    });
    if (error) {
      errors.push({ line: a.line, message: 'The account could not be added.' });
      continue;
    }
    created += 1;
  }
  await audit(actor, 'accounting.chart_imported', null, {
    created,
    skipped,
    errors: errors.length,
  });
  return { created, skipped, errors: errors.sort((x, y) => x.line - y.line) };
}

export async function exportAccountsCsv(companyId: string): Promise<string> {
  return accountsToCsv(await listAccounts(companyId));
}

export interface MappingView {
  key: MappingKey;
  accountId: string | null;
}

export async function listMappings(companyId: string): Promise<MappingView[]> {
  const { data, error } = await getAdminSupabase()
    .from('account_mappings')
    .select('mapping_key, account_id')
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  const found = new Map((data ?? []).map((r) => [String(r.mapping_key), String(r.account_id)]));
  return MAPPING_KEYS.map((key) => ({ key, accountId: found.get(key) ?? null }));
}

/** The account a kind of transaction posts to, or null when the company has not set one. */
export async function accountFor(companyId: string, key: MappingKey): Promise<string | null> {
  const { data, error } = await getAdminSupabase()
    .from('account_mappings')
    .select('account_id')
    .eq('company_id', companyId)
    .eq('mapping_key', key)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data ? String(data.account_id) : null;
}

export async function setMapping(actor: Actor, key: MappingKey, accountId: string): Promise<void> {
  const companyId = need(actor);
  const account = await getAccount(companyId, accountId);
  if (account.status !== 'active' || !account.allowPosting)
    throw new ValidationError('The account must be active and accept postings.');
  const admin = getAdminSupabase();
  const current = await accountFor(companyId, key);
  const written = current
    ? await admin
        .from('account_mappings')
        .update({ account_id: accountId, updated_by: actor.userId })
        .eq('company_id', companyId)
        .eq('mapping_key', key)
        .is('deleted_at', null)
    : await admin.from('account_mappings').insert({
        company_id: companyId,
        mapping_key: key,
        account_id: accountId,
        updated_by: actor.userId,
      });
  if (written.error) mapAccountingError(written.error);
  await audit(actor, 'accounting.mapping_set', accountId, { key, from: current });
}

export interface HistoryView {
  id: string;
  change: string;
  before: unknown;
  after: unknown;
  actorId: string | null;
  createdAt: string;
}

export async function accountHistory(companyId: string, accountId: string): Promise<HistoryView[]> {
  const { data, error } = await getAdminSupabase()
    .from('account_history')
    .select('id, change, before, after, actor_id, created_at')
    .eq('company_id', companyId)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    change: String(r.change),
    before: r.before,
    after: r.after,
    actorId: r.actor_id ? String(r.actor_id) : null,
    createdAt: String(r.created_at),
  }));
}

/** The actor accounting works as when it posts for a company without a person (domain events, jobs). */
export function accountingActor(companyId: string): Actor {
  return {
    userId: '00000000-0000-0000-0000-000000000000',
    role: 'owner',
    subRole: null,
    companyId,
    email: '',
    sessionId: 'accounting-system',
    impersonatedBy: null,
    authenticatedAt: new Date().toISOString(),
    lastStepUpAt: null,
    mfaVerified: true,
  };
}

/**
 * The account a kind of transaction posts to. A company that never opened accounting gets the starting chart; a company
 * whose chart lacks the account (an older chart, or the owner removed the mapping) gets it from the base chart, with a free
 * number if the usual number is taken.
 */
export async function resolveAccount(companyId: string, key: MappingKey): Promise<string> {
  const mapped = await accountFor(companyId, key);
  if (mapped) {
    const a = await getAccount(companyId, mapped);
    if (a.status === 'active' && a.allowPosting) return mapped;
    throw new ValidationError(`The account for ${key} does not accept postings.`);
  }
  const admin = getAdminSupabase();
  const actor = accountingActor(companyId);
  const existing = await listAccounts(companyId);
  if (existing.length === 0) {
    await ensureChart(actor);
    const seeded = await accountFor(companyId, key);
    if (seeded) return seeded;
  }
  const withKey = (await listAccounts(companyId)).find(
    (a) => a.systemKey === key && a.status === 'active' && a.allowPosting,
  );
  let id = withKey?.id ?? null;
  if (!id) {
    const seed = BASE_CHART.find((c) => c.key === key);
    if (!seed) throw new ValidationError(`There is no account for ${key}.`);
    const all = await listAccounts(companyId);
    const taken = new Set(all.map((a) => a.code));
    let code = seed.code;
    for (let i = 1; taken.has(code) && i < 90; i += 1) code = String(toInt(seed.code) + i);
    const parent = seed.parent
      ? all.find((a) => a.code === seed.parent && a.type === seed.type)
      : undefined;
    const { data, error } = await admin
      .from('accounts')
      .insert({
        company_id: companyId,
        code,
        name: seed.name,
        description: seed.description ?? '',
        type: seed.type,
        subtype: seed.subtype,
        is_contra: seed.contra ?? false,
        parent_id: parent?.id ?? null,
        is_system: true,
        system_key: key,
        created_by: actor.userId,
      })
      .select('id')
      .single();
    if (error) mapAccountingError(error);
    id = String((data as { id: string }).id);
  }
  const ins = await admin
    .from('account_mappings')
    .insert({ company_id: companyId, mapping_key: key, account_id: id });
  if (ins.error && ins.error.code !== '23505') throw new InternalError(ins.error);
  return id;
}
