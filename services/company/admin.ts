// path: services/company/admin.ts
// Platform views and actions on users and tenants: the admin home counters, lists with search and filters, detail
// pages, suspend and reactivate, e-mail verification by hand and internal notes. Suspending or reactivating needs a
// second person: the CEO or admin staff ask through the approval engine and the final approver decides; the super admin
// acts directly (with a fresh step-up). A person can never change their own account here.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  DELETION_GRACE_DAYS,
  PAGE_SIZE,
  type PeopleAction,
  type TenantListQuery,
  type UserListQuery,
} from '@/lib/company/admin-input';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { disableTwoFactor } from '@/services/auth/two-factor-service';
import { sendAdminReset } from '@/services/auth/reset-flow';
import { adminSetPlan } from '@/services/subscription/platform';
import type { Actor } from '@/types/contracts';

const log = createLogger({ component: 'admin-people' });

/** A search text safe to put into a pattern filter: wildcard and separator characters are removed. */
function like(q: string): string {
  return q.replace(/[%_,()\\*]/g, ' ').trim();
}

export interface Overview {
  tenants: { active: number; suspended: number; closed: number };
  users: { owners: number; staff: number; platform: number };
  kycPending: number;
  alertsOpen: number | null;
  incidentsOpen: number | null;
  ticketsOpen: number | null;
  recent: { at: string; action: string; resourceType: string }[];
}

type Filter =
  | readonly ['eq' | 'neq', string, string]
  | readonly ['is', string, null]
  | readonly ['not_is', string, null]
  | readonly ['in', string, readonly string[]]
  | readonly ['not_in', string, readonly string[]];

/** Row count of a table with simple filters; null when the table does not exist yet or cannot be read. */
async function count(table: string, filters: readonly Filter[]): Promise<number | null> {
  try {
    let q = getAdminSupabase().from(table).select('id', { count: 'exact', head: true });
    for (const f of filters) {
      if (f[0] === 'eq') q = q.eq(f[1], f[2]);
      else if (f[0] === 'neq') q = q.neq(f[1], f[2]);
      else if (f[0] === 'is') q = q.is(f[1], f[2]);
      else if (f[0] === 'not_is') q = q.not(f[1], 'is', f[2]);
      else if (f[0] === 'in') q = q.in(f[1], [...f[2]]);
      else if (f[0] === 'not_in') q = q.not(f[1], 'in', `(${f[2].join(',')})`);
    }
    const { count: n, error } = await q;
    return error ? null : (n ?? 0);
  } catch {
    return null;
  }
}

const live: Filter = ['is', 'deleted_at', null];

export async function overview(): Promise<Overview> {
  const [active, suspended, closed, owners, staff, platform, kyc, alerts, incidents, tickets] =
    await Promise.all([
      count('companies', [['eq', 'status', 'active'], live]),
      count('companies', [['eq', 'status', 'suspended'], live]),
      count('companies', [['eq', 'status', 'closed'], live]),
      count('memberships', [['eq', 'role', 'owner'], ['eq', 'status', 'active'], live]),
      count('memberships', [['eq', 'role', 'staff'], ['eq', 'status', 'active'], live]),
      count('profiles', [['not_is', 'platform_role', null], ['eq', 'status', 'active'], live]),
      count('kyc_submissions', [['in', 'status', ['submitted', 'in_review']], live]),
      count('alerts', [['neq', 'status', 'resolved'], live]),
      count('incidents', [['not_in', 'status', ['resolved', 'closed']], live]),
      count('support_tickets', [['in', 'status', ['open', 'pending']], live]),
    ]);
  const feed = await getAdminSupabase()
    .from('audit_logs')
    .select('created_at, action, resource_type')
    .order('created_at', { ascending: false })
    .limit(15);
  return {
    tenants: { active: active ?? 0, suspended: suspended ?? 0, closed: closed ?? 0 },
    users: { owners: owners ?? 0, staff: staff ?? 0, platform: platform ?? 0 },
    kycPending: kyc ?? 0,
    alertsOpen: alerts,
    incidentsOpen: incidents,
    ticketsOpen: tickets,
    recent: (feed.data ?? []).map((r) => ({
      at: String(r.created_at),
      action: String(r.action),
      resourceType: String(r.resource_type),
    })),
  };
}

export interface UserRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  companyId: string | null;
  companyName: string;
  createdAt: string;
}

export async function listUsers(query: UserListQuery): Promise<{ rows: UserRow[]; total: number }> {
  const admin = getAdminSupabase();
  let q = admin
    .from('profiles')
    .select('user_id, company_id, email, full_name, platform_role, status, created_at', {
      count: 'exact',
    })
    .is('deleted_at', null);
  if (query.status) q = q.eq('status', query.status);
  if (query.role === 'platform') q = q.not('platform_role', 'is', null);
  else if (query.role) q = q.is('platform_role', null);
  if (query.q) {
    const t = like(query.q);
    if (t) q = q.or(`email.ilike.%${t}%,full_name.ilike.%${t}%`);
  }
  const from = (query.page - 1) * PAGE_SIZE;
  const {
    data,
    count: total,
    error,
  } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  if (error) throw new InternalError(error);
  const ids = (data ?? []).map((r) => String(r.user_id));
  const companyIds = [
    ...new Set(
      (data ?? [])
        .map((r) => r.company_id)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const [mem, comp] = await Promise.all([
    ids.length
      ? admin.from('memberships').select('user_id, role').in('user_id', ids).is('deleted_at', null)
      : { data: [], error: null },
    companyIds.length
      ? admin.from('companies').select('id, name').in('id', companyIds)
      : { data: [], error: null },
  ]);
  const role = new Map((mem.data ?? []).map((m) => [String(m.user_id), String(m.role)]));
  const name = new Map((comp.data ?? []).map((c) => [String(c.id), String(c.name)]));
  let rows = (data ?? []).map((r) => ({
    userId: String(r.user_id),
    name: String(r.full_name),
    email: String(r.email),
    role: r.platform_role ? String(r.platform_role) : (role.get(String(r.user_id)) ?? 'owner'),
    status: String(r.status),
    companyId: r.company_id ? String(r.company_id) : null,
    companyName: r.company_id ? (name.get(String(r.company_id)) ?? '') : '',
    createdAt: String(r.created_at),
  }));
  if (query.role === 'owner' || query.role === 'staff')
    rows = rows.filter((r) => r.role === query.role);
  return { rows, total: total ?? rows.length };
}

export interface UserDetail extends UserRow {
  platformRole: string | null;
  subRole: string | null;
  login: { at: string; type: string; network: string }[];
  activity: { at: string; action: string }[];
  notes: NoteRow[];
  sessions: number;
  pendingAction: string | null;
  deletionScheduledFor: string | null;
}
export interface NoteRow {
  id: string;
  body: string;
  authorId: string;
  at: string;
}

async function notesFor(subject: 'user' | 'tenant', id: string): Promise<NoteRow[]> {
  const { data, error } = await getAdminSupabase()
    .from('admin_notes')
    .select('id, body, author_id, created_at')
    .eq('subject_type', subject)
    .eq('subject_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new InternalError(error);
  return (data ?? []).map((n) => ({
    id: String(n.id),
    body: String(n.body),
    authorId: String(n.author_id),
    at: String(n.created_at),
  }));
}

async function pendingAction(subject: 'user' | 'tenant', id: string): Promise<string | null> {
  const { data } = await getAdminSupabase()
    .from('admin_actions')
    .select('action')
    .eq('subject_type', subject)
    .eq('subject_id', id)
    .eq('status', 'awaiting_approval')
    .is('deleted_at', null)
    .maybeSingle();
  return data ? String(data.action) : null;
}

async function deletionDate(userId: string): Promise<string | null> {
  const { data } = await getAdminSupabase()
    .from('user_deletions')
    .select('scheduled_for')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .is('deleted_at', null)
    .maybeSingle();
  return data ? String(data.scheduled_for) : null;
}

export async function userDetail(userId: string): Promise<UserDetail> {
  const admin = getAdminSupabase();
  const p = await admin
    .from('profiles')
    .select(
      'user_id, company_id, email, full_name, platform_role, admin_sub_role, status, created_at',
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (p.error) throw new InternalError(p.error);
  if (!p.data) throw new NotFoundError();
  const [mem, company, login, activity, sessions] = await Promise.all([
    admin
      .from('memberships')
      .select('role')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle(),
    p.data.company_id
      ? admin.from('companies').select('name').eq('id', String(p.data.company_id)).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('auth_login_events')
      .select('created_at, event_type, ip_masked')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('audit_logs')
      .select('created_at, action')
      .eq('actor_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('user_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()),
  ]);
  return {
    userId,
    name: String(p.data.full_name),
    email: String(p.data.email),
    role: p.data.platform_role ? String(p.data.platform_role) : String(mem.data?.role ?? 'owner'),
    platformRole: p.data.platform_role ? String(p.data.platform_role) : null,
    subRole: p.data.admin_sub_role ? String(p.data.admin_sub_role) : null,
    status: String(p.data.status),
    companyId: p.data.company_id ? String(p.data.company_id) : null,
    companyName: String(company.data?.name ?? ''),
    createdAt: String(p.data.created_at),
    login: (login.data ?? []).map((e) => ({
      at: String(e.created_at),
      type: String(e.event_type),
      network: String(e.ip_masked ?? ''),
    })),
    activity: (activity.data ?? []).map((e) => ({
      at: String(e.created_at),
      action: String(e.action),
    })),
    notes: await notesFor('user', userId),
    sessions: sessions.count ?? 0,
    pendingAction: await pendingAction('user', userId),
    deletionScheduledFor: await deletionDate(userId),
  };
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  country: string | null;
  createdAt: string;
}

export async function listTenants(
  query: TenantListQuery,
): Promise<{ rows: TenantRow[]; total: number }> {
  let q = getAdminSupabase()
    .from('companies')
    .select('id, name, slug, plan_key, status, country_code, created_at', { count: 'exact' })
    .is('deleted_at', null);
  if (query.status) q = q.eq('status', query.status);
  if (query.plan) q = q.eq('plan_key', query.plan);
  if (query.q) {
    const t = like(query.q);
    if (t) q = q.or(`name.ilike.%${t}%,slug.ilike.%${t}%`);
  }
  const from = (query.page - 1) * PAGE_SIZE;
  const {
    data,
    count: total,
    error,
  } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
  if (error) throw new InternalError(error);
  return {
    rows: (data ?? []).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      slug: String(r.slug),
      plan: String(r.plan_key),
      status: String(r.status),
      country: r.country_code ? String(r.country_code) : null,
      createdAt: String(r.created_at),
    })),
    total: total ?? 0,
  };
}

export interface TenantDetail extends TenantRow {
  members: { userId: string; name: string; email: string; role: string; status: string }[];
  kyc: string;
  domains: number;
  storageProvider: string;
  notes: NoteRow[];
  activity: { at: string; action: string }[];
  pendingAction: string | null;
}

export async function tenantDetail(id: string): Promise<TenantDetail> {
  const admin = getAdminSupabase();
  const c = await admin
    .from('companies')
    .select('id, name, slug, plan_key, status, country_code, created_at, storage_provider')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (c.error) throw new InternalError(c.error);
  if (!c.data) throw new NotFoundError();
  const [mem, prof, kyc, domains, activity] = await Promise.all([
    admin
      .from('memberships')
      .select('user_id, role, status')
      .eq('company_id', id)
      .is('deleted_at', null),
    admin
      .from('profiles')
      .select('user_id, email, full_name')
      .eq('company_id', id)
      .is('deleted_at', null),
    getService('kyc')
      .status(id)
      .catch(() => 'not_submitted'),
    admin
      .from('custom_domains')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', id)
      .is('deleted_at', null),
    admin
      .from('audit_logs')
      .select('created_at, action')
      .eq('company_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);
  const profile = new Map((prof.data ?? []).map((p) => [String(p.user_id), p]));
  return {
    id,
    name: String(c.data.name),
    slug: String(c.data.slug),
    plan: String(c.data.plan_key),
    status: String(c.data.status),
    country: c.data.country_code ? String(c.data.country_code) : null,
    createdAt: String(c.data.created_at),
    members: (mem.data ?? []).map((m) => ({
      userId: String(m.user_id),
      name: String(profile.get(String(m.user_id))?.full_name ?? ''),
      email: String(profile.get(String(m.user_id))?.email ?? ''),
      role: String(m.role),
      status: String(m.status),
    })),
    kyc,
    domains: domains.count ?? 0,
    storageProvider: String(c.data.storage_provider),
    notes: await notesFor('tenant', id),
    activity: (activity.data ?? []).map((e) => ({
      at: String(e.created_at),
      action: String(e.action),
    })),
    pendingAction: await pendingAction('tenant', id),
  };
}

// ---- actions ----
async function audit(
  actor: Actor,
  action: string,
  id: string,
  companyId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await getService('audit').record({
    action,
    resourceType: action.startsWith('tenant') ? 'company' : 'user',
    resourceId: id,
    companyId,
    metadata: { ...metadata, by: actor.userId },
  });
}

async function applyUserState(id: string, disable: boolean): Promise<void> {
  const admin = getAdminSupabase();
  if (!disable) {
    const current = await admin.from('profiles').select('email').eq('user_id', id).maybeSingle();
    if (String(current.data?.email ?? '').startsWith('erased+'))
      throw new ValidationError('This person was removed for good and cannot be restored.');
  }
  const r = await admin
    .from('profiles')
    .update({ status: disable ? 'disabled' : 'active' })
    .eq('user_id', id)
    .is('deleted_at', null)
    .select('user_id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  if (disable)
    await admin.rpc('kd_revoke_user_sessions', {
      p_user: id,
      p_except: null,
      p_reason: 'admin_suspended',
    });
  else {
    // Bringing a person back also cancels a deletion that is still in its grace period.
    const cancel = await admin
      .from('user_deletions')
      .update({ status: 'cancelled', closed_at: new Date().toISOString() })
      .eq('user_id', id)
      .eq('status', 'scheduled')
      .is('deleted_at', null);
    if (cancel.error) throw new InternalError(cancel.error);
  }
}

async function applyTenantState(id: string, suspend: boolean): Promise<string[]> {
  const admin = getAdminSupabase();
  const r = await admin
    .from('companies')
    .update({ status: suspend ? 'suspended' : 'active' })
    .eq('id', id)
    .neq('status', 'closed')
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  const members = await admin
    .from('memberships')
    .select('user_id')
    .eq('company_id', id)
    .is('deleted_at', null);
  const ids = (members.data ?? []).map((m) => String(m.user_id));
  if (suspend)
    for (const u of ids)
      await admin.rpc('kd_revoke_user_sessions', {
        p_user: u,
        p_except: null,
        p_reason: 'tenant_suspended',
      });
  return ids;
}

type UserOnly = Exclude<PeopleAction['action'], 'note' | 'user.verify_email'>;
interface ExecuteContext {
  reason: string;
  requestedBy: string;
  params: Record<string, unknown>;
  actor: Actor | null;
}

async function revokeSessions(id: string, reason: string): Promise<void> {
  const r = await getAdminSupabase().rpc('kd_revoke_user_sessions', {
    p_user: id,
    p_except: null,
    p_reason: reason,
  });
  if (r.error) throw new InternalError(r.error);
}

async function applySoftDelete(id: string, ctx: ExecuteContext): Promise<void> {
  const admin = getAdminSupabase();
  const profile = await admin.from('profiles').select('company_id').eq('user_id', id).maybeSingle();
  const scheduledFor = new Date(Date.now() + DELETION_GRACE_DAYS * 86_400_000).toISOString();
  const r = await admin.from('user_deletions').insert({
    company_id: profile.data?.company_id ? String(profile.data.company_id) : null,
    user_id: id,
    requested_by: ctx.requestedBy,
    reason: ctx.reason,
    scheduled_for: scheduledFor,
  });
  if (r.error) {
    if (r.error.code === '23505')
      throw new ConflictError('This person is already scheduled for deletion.');
    throw new InternalError(r.error);
  }
  await applyUserState(id, true);
}

async function applyChangeEmail(id: string, email: string): Promise<void> {
  const admin = getAdminSupabase();
  const taken = await admin
    .from('profiles')
    .select('user_id')
    .eq('email', email)
    .neq('user_id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (taken.error) throw new InternalError(taken.error);
  if (taken.data) throw new ConflictError('This e-mail address belongs to another account.');
  const auth = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
  if (auth.error) throw new InternalError(auth.error);
  const profile = await admin
    .from('profiles')
    .update({ email })
    .eq('user_id', id)
    .is('deleted_at', null);
  if (profile.error) throw new InternalError(profile.error);
  await revokeSessions(id, 'admin_email_change');
}

async function applyPurge(id: string, actorId: string): Promise<string> {
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc('kd_user_purge', { p_user: id, p_actor: actorId });
  if (error) {
    if (error.code === '02000') throw new ValidationError('Schedule a deletion first.');
    if (error.code === '22023') throw new ValidationError('The grace period is not over yet.');
    if (error.code === '23514')
      throw new ValidationError('This person owns a company that is not closed. Close it first.');
    throw new InternalError(error);
  }
  const auth = await admin.auth.admin.updateUserById(id, {
    email: `erased+${id}@invalid.example`,
    ban_duration: '876000h',
    user_metadata: {},
  });
  if (auth.error) throw new InternalError(auth.error);
  await revokeSessions(id, 'admin_purged');
  return String(data);
}

async function execute(
  action: UserOnly,
  id: string,
  ctx: ExecuteContext,
): Promise<Record<string, unknown>> {
  switch (action) {
    case 'user.suspend':
      await applyUserState(id, true);
      return {};
    case 'user.reactivate':
      await applyUserState(id, false);
      return {};
    case 'tenant.suspend':
      await applyTenantState(id, true);
      return {};
    case 'tenant.reactivate':
      await applyTenantState(id, false);
      return {};
    case 'user.soft_delete':
      await applySoftDelete(id, ctx);
      return { graceDays: DELETION_GRACE_DAYS };
    case 'user.purge':
      return { certificate: await applyPurge(id, ctx.requestedBy) };
    case 'user.force_password_reset':
      await revokeSessions(id, 'admin_forced_reset');
      await sendAdminReset(id);
      return {};
    case 'user.reset_2fa':
      await disableTwoFactor(id);
      await revokeSessions(id, 'admin_2fa_reset');
      return {};
    case 'user.change_email':
      await applyChangeEmail(id, String(ctx.params.email));
      return { to: String(ctx.params.email) };
    case 'user.set_plan': {
      if (!ctx.actor) throw new ForbiddenError();
      const p = await getAdminSupabase()
        .from('profiles')
        .select('company_id')
        .eq('user_id', id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!p.data?.company_id) throw new ValidationError('This person has no company.');
      await adminSetPlan(ctx.actor, String(p.data.company_id), String(ctx.params.plan), ctx.reason);
      return { plan: String(ctx.params.plan) };
    }
  }
}

/** Actions only the super admin may run, always at once (never through the approval chain). */
const SUPER_ADMIN_ONLY: readonly string[] = ['user.purge', 'user.set_plan'];

function paramsOf(input: PeopleAction): Record<string, unknown> {
  if (input.action === 'user.change_email') return { email: input.email };
  if (input.action === 'user.set_plan') return { plan: input.plan };
  return {};
}

export async function runPeopleAction(
  actor: Actor,
  input: PeopleAction,
): Promise<{ result: 'applied' | 'awaiting_approval' | 'done' }> {
  const admin = getAdminSupabase();
  if (input.action === 'note') {
    const exists =
      input.subject === 'user'
        ? await admin.from('profiles').select('user_id').eq('user_id', input.id).maybeSingle()
        : await admin.from('companies').select('id').eq('id', input.id).maybeSingle();
    if (!exists.data) throw new NotFoundError();
    const r = await admin.from('admin_notes').insert({
      subject_type: input.subject,
      subject_id: input.id,
      author_id: actor.userId,
      body: input.body,
    });
    if (r.error) throw new InternalError(r.error);
    await audit(actor, `${input.subject}.note_added`, input.id, null);
    return { result: 'done' };
  }
  if (input.action === 'user.verify_email') {
    const p = await admin
      .from('profiles')
      .select('user_id')
      .eq('user_id', input.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!p.data) throw new NotFoundError();
    const r = await admin.auth.admin.updateUserById(input.id, { email_confirm: true });
    if (r.error) throw new InternalError(r.error);
    await audit(actor, 'user.email_verified_by_admin', input.id, null);
    return { result: 'done' };
  }
  if (input.action.startsWith('user.') && input.id === actor.userId)
    throw new ForbiddenError('You cannot change your own account here.');
  if (input.action.startsWith('user.')) {
    const target = await admin
      .from('profiles')
      .select('platform_role')
      .eq('user_id', input.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!target.data) throw new NotFoundError();
    // Platform staff are changed only by the super admin.
    if (target.data.platform_role && actor.role !== 'super_admin')
      throw new ForbiddenError('Only the super admin can change platform staff.');
    if (
      target.data.platform_role &&
      (input.action === 'user.soft_delete' || input.action === 'user.purge')
    )
      throw new ForbiddenError('Platform staff are removed on the staff screen, not here.');
    if (SUPER_ADMIN_ONLY.includes(input.action) && actor.role !== 'super_admin')
      throw new ForbiddenError('Only the super admin can do this.');
  } else {
    const t = await admin
      .from('companies')
      .select('id, status')
      .eq('id', input.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!t.data) throw new NotFoundError();
    if (t.data.status === 'closed')
      throw new ValidationError('A closed company cannot be changed.');
  }
  const companyId = input.action.startsWith('tenant.') ? input.id : null;
  const record = await admin
    .from('admin_actions')
    .insert({
      company_id: companyId,
      action: input.action,
      subject_type: input.action.startsWith('tenant') ? 'tenant' : 'user',
      subject_id: input.id,
      reason: input.reason,
      params: paramsOf(input),
      requested_by: actor.userId,
      status: actor.role === 'super_admin' ? 'applied' : 'awaiting_approval',
      decided_at: actor.role === 'super_admin' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();
  if (record.error) {
    if (record.error.code === '23505')
      throw new ConflictError('A request for this one is already waiting for approval.');
    throw new InternalError(record.error);
  }
  const ctx: ExecuteContext = {
    reason: input.reason,
    requestedBy: actor.userId,
    params: paramsOf(input),
    actor,
  };
  if (actor.role === 'super_admin') {
    let extra: Record<string, unknown>;
    try {
      extra = await execute(input.action, input.id, ctx);
    } catch (error) {
      await admin
        .from('admin_actions')
        .update({
          status: 'failed',
          result: error instanceof Error ? error.message.slice(0, 300) : 'failed',
        })
        .eq('id', String(record.data.id));
      throw error;
    }
    await audit(actor, `${input.action}.applied`, input.id, companyId, {
      reason: input.reason,
      ...extra,
    });
    return { result: 'applied' };
  }
  const state = await getService('approval').request({
    action: input.action,
    payload: { actionId: String(record.data.id), subject: input.id, reason: input.reason },
    requesterId: actor.userId,
    companyId: null,
  });
  await admin
    .from('admin_actions')
    .update({ approval_request_id: state.requestId })
    .eq('id', String(record.data.id));
  await audit(actor, `${input.action}.requested`, input.id, companyId, {
    reason: input.reason,
    request: state.requestId,
  });
  return { result: 'awaiting_approval' };
}

/** Job: applies decisions of the approval engine to waiting platform actions. */
export async function syncAdminActions(): Promise<number> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('admin_actions')
    .select('id, action, subject_id, company_id, approval_request_id, reason, requested_by, params')
    .eq('status', 'awaiting_approval')
    .not('approval_request_id', 'is', null)
    .is('deleted_at', null)
    .limit(100);
  if (error) throw new InternalError(error);
  let n = 0;
  for (const row of data ?? []) {
    const state = await getService('approval')
      .status(String(row.approval_request_id))
      .catch(() => null);
    if (!state) continue;
    if (state.status === 'approved') {
      try {
        const extra = await execute(String(row.action) as UserOnly, String(row.subject_id), {
          reason: String(row.reason),
          requestedBy: String(row.requested_by),
          params: (row.params ?? {}) as Record<string, unknown>,
          actor: null,
        });
        await admin
          .from('admin_actions')
          .update({ status: 'applied', decided_at: new Date().toISOString() })
          .eq('id', String(row.id));
        await getService('audit').record({
          action: `${String(row.action)}.applied`,
          resourceType: String(row.action).startsWith('tenant') ? 'company' : 'user',
          resourceId: String(row.subject_id),
          companyId: row.company_id ? String(row.company_id) : null,
          metadata: { request: String(row.approval_request_id), ...extra },
        });
      } catch (e) {
        log.error('approved action could not be applied', {
          error: e instanceof Error ? e.message : 'failed',
        });
        await admin
          .from('admin_actions')
          .update({
            status: 'failed',
            result: 'It could not be applied. Check the subject and ask again.',
            decided_at: new Date().toISOString(),
          })
          .eq('id', String(row.id));
      }
      n += 1;
    } else if (['rejected', 'expired', 'cancelled'].includes(state.status)) {
      await admin
        .from('admin_actions')
        .update({
          status: 'rejected',
          result: `The approval ended as ${state.status}.`,
          decided_at: new Date().toISOString(),
        })
        .eq('id', String(row.id));
      n += 1;
    }
  }
  return n;
}
