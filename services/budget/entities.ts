// path: services/budget/entities.ts
// Several legal entities under one owner. A group is led by one company and holds the other companies of the same owner; a
// company can be added only by a person who is an active owner of both, and that is checked again every time the consolidated
// statements are read. Intercompany pairs say which two accounts cancel out. The consolidation reads each member's own ledger.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { ReportResult } from '@/lib/reports/types';
import type { Actor } from '@/types/contracts';
import { listAccounts } from '@/services/accounting/accounts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { dayText } from '@/services/accounting/journal-rules';
import { balances, metas } from '@/services/accounting/reports';
import { buildReportFile, type ExportFormat, type ReportFile } from '@/services/report/export';
import {
  consolidate,
  groupInput,
  memberInput,
  pairInput,
  type Consolidation,
  type MemberBooks,
  type PairSpec,
} from './consolidation-rules';

export interface GroupView {
  id: string;
  name: string;
  members: { id: string; companyId: string; name: string; ownershipPercent: string }[];
  pairs: (PairSpec & { id: string })[];
}

const need = (actor: Actor): string => {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
};

async function isOwnerOf(userId: string, companyId: string): Promise<boolean> {
  const { data, error } = await getAdminSupabase()
    .from('memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(1);
  if (error) throw new InternalError(error);
  return (data ?? []).length > 0;
}

async function record(
  companyId: string,
  action: string,
  id: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: 'entity_group',
    resourceId: id,
    companyId,
    metadata,
  });
}

export async function getGroup(companyId: string): Promise<GroupView | null> {
  const admin = getAdminSupabase();
  const g = await admin
    .from('entity_groups')
    .select('id, name')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (g.error) throw new InternalError(g.error);
  if (!g.data) return null;
  const [members, pairs] = await Promise.all([
    admin
      .from('entity_group_members')
      .select('id, member_company_id, ownership_percent, companies:member_company_id(name)')
      .eq('group_id', g.data.id)
      .is('deleted_at', null)
      .limit(100),
    admin
      .from('intercompany_pairs')
      .select('id, label, company_a, account_a, company_b, account_b')
      .eq('group_id', g.data.id)
      .is('deleted_at', null)
      .limit(500),
  ]);
  if (members.error) throw new InternalError(members.error);
  if (pairs.error) throw new InternalError(pairs.error);
  return {
    id: String(g.data.id),
    name: String(g.data.name),
    members: (members.data ?? []).map((m) => {
      const c = (m as unknown as { companies: { name: string } | { name: string }[] | null })
        .companies;
      const name = Array.isArray(c) ? c[0]?.name : c?.name;
      return {
        id: String(m.id),
        companyId: String(m.member_company_id),
        name: name ?? '',
        ownershipPercent: String(m.ownership_percent),
      };
    }),
    pairs: (pairs.data ?? []).map((p) => ({
      id: String(p.id),
      label: String(p.label),
      companyA: String(p.company_a),
      accountA: String(p.account_a),
      companyB: String(p.company_b),
      accountB: String(p.account_b),
    })),
  };
}

/** Companies the person owns that could join the group (not the leader, not already members). */
export async function joinableCompanies(actor: Actor): Promise<{ id: string; name: string }[]> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('memberships')
    .select('company_id, companies:company_id(name, status)')
    .eq('user_id', actor.userId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(100);
  if (error) throw new InternalError(error);
  const group = await getGroup(companyId);
  const taken = new Set(group?.members.map((m) => m.companyId) ?? []);
  return (data ?? [])
    .map((r) => {
      const c = (r as unknown as { companies: { name: string } | { name: string }[] | null })
        .companies;
      return { id: String(r.company_id), name: (Array.isArray(c) ? c[0]?.name : c?.name) ?? '' };
    })
    .filter((c) => c.id !== companyId && !taken.has(c.id));
}

export async function createGroup(actor: Actor, input: unknown): Promise<GroupView> {
  const companyId = need(actor);
  const parsed = groupInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The group is not valid.');
  const { error } = await getAdminSupabase()
    .from('entity_groups')
    .insert({ company_id: companyId, name: parsed.data.name });
  if (error) {
    if (error.code === '23505') throw new ConflictError('This company already leads a group.');
    mapAccountingError(error);
  }
  await record(companyId, 'entity.group_created', null, { name: parsed.data.name });
  return (await getGroup(companyId)) as GroupView;
}

export async function addMember(actor: Actor, input: unknown): Promise<GroupView> {
  const companyId = need(actor);
  const parsed = memberInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The company is not valid.');
  const group = await getGroup(companyId);
  if (!group) throw new ValidationError('Create the group first.');
  if (!(await isOwnerOf(actor.userId, parsed.data.memberCompanyId)))
    throw new ForbiddenError('You must be an owner of that company to add it.');
  const { error } = await getAdminSupabase().from('entity_group_members').insert({
    company_id: companyId,
    group_id: group.id,
    member_company_id: parsed.data.memberCompanyId,
    ownership_percent: parsed.data.ownershipPercent,
    added_by: actor.userId,
  });
  if (error) {
    if (error.code === '23505') throw new ConflictError('This company is already in the group.');
    mapAccountingError(error);
  }
  await record(companyId, 'entity.member_added', group.id, { member: parsed.data.memberCompanyId });
  return (await getGroup(companyId)) as GroupView;
}

export async function removeMember(actor: Actor, memberId: string): Promise<GroupView> {
  const companyId = need(actor);
  const group = await getGroup(companyId);
  const member = group?.members.find((m) => m.id === memberId);
  if (!group || !member) throw new NotFoundError();
  const admin = getAdminSupabase();
  const now = new Date().toISOString();
  for (const p of group.pairs.filter(
    (x) => x.companyA === member.companyId || x.companyB === member.companyId,
  )) {
    const r = await admin.from('intercompany_pairs').update({ deleted_at: now }).eq('id', p.id);
    if (r.error) mapAccountingError(r.error);
  }
  const { error } = await admin
    .from('entity_group_members')
    .update({ deleted_at: now })
    .eq('id', memberId);
  if (error) mapAccountingError(error);
  await record(companyId, 'entity.member_removed', group.id, { member: member.companyId });
  return (await getGroup(companyId)) as GroupView;
}

/** The accounts of the leader and every member, for choosing a pair. */
export async function pairAccounts(
  group: GroupView,
  leaderId: string,
): Promise<{ companyId: string; companyName: string; id: string; label: string }[]> {
  const out: { companyId: string; companyName: string; id: string; label: string }[] = [];
  const companies = [
    { id: leaderId, name: 'This company' },
    ...group.members.map((m) => ({ id: m.companyId, name: m.name })),
  ];
  for (const c of companies)
    for (const a of await listAccounts(c.id, { status: 'active' }))
      if (a.allowPosting)
        out.push({ companyId: c.id, companyName: c.name, id: a.id, label: `${a.code} ${a.name}` });
  return out;
}

export async function addPair(actor: Actor, input: unknown): Promise<GroupView> {
  const companyId = need(actor);
  const parsed = pairInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The pair is not valid.');
  const group = await getGroup(companyId);
  if (!group) throw new ValidationError('Create the group first.');
  const d = parsed.data;
  const { error } = await getAdminSupabase().from('intercompany_pairs').insert({
    company_id: companyId,
    group_id: group.id,
    label: d.label,
    company_a: d.companyA,
    account_a: d.accountA,
    company_b: d.companyB,
    account_b: d.accountB,
  });
  if (error) mapAccountingError(error);
  await record(companyId, 'entity.pair_added', group.id, { label: d.label });
  return (await getGroup(companyId)) as GroupView;
}

export async function removePair(actor: Actor, pairId: string): Promise<GroupView> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('intercompany_pairs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', pairId)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  await record(companyId, 'entity.pair_removed', pairId, {});
  return (await getGroup(companyId)) as GroupView;
}

export type StatementKind = 'profit_loss' | 'balance_sheet';

/** The group's statement: the leader and every member, with the eliminations. Ownership is checked again on every read. */
export async function consolidated(
  actor: Actor,
  kind: StatementKind,
  from: string,
  to: string,
): Promise<{ group: GroupView; result: Consolidation }> {
  const companyId = need(actor);
  const group = await getGroup(companyId);
  if (!group) throw new NotFoundError();
  if (!dayText.safeParse(from).success || !dayText.safeParse(to).success || from > to)
    throw new ValidationError('Check the dates.');
  const companies = [
    { id: companyId, name: 'This company', percent: '100' },
    ...group.members.map((m) => ({ id: m.companyId, name: m.name, percent: m.ownershipPercent })),
  ];
  const books: MemberBooks[] = [];
  for (const c of companies) {
    if (c.id !== companyId && !(await isOwnerOf(actor.userId, c.id)))
      throw new ForbiddenError(`You are no longer an owner of ${c.name}.`);
    const [accounts, bal] = await Promise.all([
      metas(c.id),
      kind === 'profit_loss' ? balances(c.id, from, to, false) : balances(c.id, null, to, true),
    ]);
    books.push({
      companyId: c.id,
      name: c.name,
      ownershipPercent: c.percent,
      accounts,
      balances: bal,
    });
  }
  const result = consolidate(books, group.pairs);
  await record(companyId, 'entity.consolidated_read', group.id, { kind, to });
  return { group, result };
}

const col = (
  key: string,
  label: string,
  type: 'text' | 'money' = 'text',
): { key: string; label: string; type: 'text' | 'money' } => ({ key, label, type });

/** The consolidated statement as a flat table for the report file builder. */
export function consolidationTable(
  kind: StatementKind,
  from: string,
  to: string,
  r: Consolidation,
): ReportResult {
  const types = kind === 'profit_loss' ? ['revenue', 'expense'] : ['asset', 'liability', 'equity'];
  const members = r.members.map((m, i) => col(`m${i}`, m.name, 'money'));
  const columns = [
    col('account', 'Account'),
    ...members,
    col('elimination', 'Eliminations', 'money'),
    col('total', 'Consolidated', 'money'),
  ];
  const rows = r.lines
    .filter((l) => types.includes(l.type))
    .map((l) => ({
      account: `${l.code} ${l.name}`,
      ...Object.fromEntries(l.byMember.map((v, i) => [`m${i}`, v])),
      elimination: l.elimination,
      total: l.total,
    }));
  const notes = r.eliminations.map(
    (e) =>
      `${e.label}: eliminated ${e.eliminated}${e.difference === '0.0000' ? '' : `; the two sides differ by ${e.difference}`}`,
  );
  for (const m of r.minority)
    notes.push(
      `${m.name}: others own ${m.percent} percent; their share of the result is ${m.share}.`,
    );
  const totals: Record<string, string> =
    kind === 'profit_loss'
      ? { account: 'Net income', total: r.netIncome }
      : { account: 'Assets', total: r.assets };
  if (kind === 'balance_sheet')
    notes.push(
      `Liabilities ${r.liabilities}; equity ${r.equity}; current earnings ${r.currentEarnings}; ${r.balanced ? 'balanced' : 'NOT balanced'}.`,
    );
  return {
    key: kind === 'profit_loss' ? 'consolidated_profit_loss' : 'consolidated_balance_sheet',
    title: kind === 'profit_loss' ? 'Consolidated profit and loss' : 'Consolidated balance sheet',
    period: { from: kind === 'profit_loss' ? from : to, to },
    columns,
    rows,
    totals,
    notes,
  };
}

export async function exportConsolidated(
  actor: Actor,
  kind: StatementKind,
  from: string,
  to: string,
  format: ExportFormat,
): Promise<ReportFile> {
  const companyId = need(actor);
  const { result } = await consolidated(actor, kind, from, to);
  return buildReportFile(
    companyId,
    consolidationTable(kind, from, to, result),
    format,
    actor.email || actor.userId,
  );
}
