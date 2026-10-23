// path: services/support/tickets.ts
// Support tickets. A company opens a ticket and talks to the support team in a thread. Agents (admin staff with the
// support sub-role, the CEO and the super admin) see the queue, answer, leave internal notes that the company never
// sees, assign and change status. SLA clocks (first answer, solution) start at creation from the priority.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  AUTO_CLOSE_DAYS,
  QUEUE_PAGE_SIZE,
  dueDates,
  firstResponseState,
  type AgentTicketAction,
  type CreateTicketInput,
  type OwnTicketAction,
  type Priority,
  type QueueQuery,
  type SlaState,
  type TicketStatus,
} from '@/lib/helpdesk/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { onDutyNow } from '@/services/team/admin-staff';
import type { Actor } from '@/types/contracts';

export interface TicketRow {
  id: string;
  number: string;
  subject: string;
  category: string;
  priority: Priority;
  status: TicketStatus;
  companyId: string;
  companyName: string;
  requesterId: string;
  assigneeId: string | null;
  assigneeName: string;
  createdAt: string;
  lastActivityAt: string;
  firstResponseDueAt: string;
  resolutionDueAt: string;
  sla: SlaState;
  overdue: boolean;
  rating: number | null;
}
export interface MessageRow {
  id: string;
  authorKind: 'customer' | 'agent' | 'system';
  authorName: string;
  internal: boolean;
  body: string;
  at: string;
}
export interface TicketDetail extends TicketRow {
  messages: MessageRow[];
  requesterName: string;
}

const COLUMNS =
  'id, number, subject, category, priority, status, company_id, requester_id, assignee_id, created_at, last_activity_at, first_response_due_at, resolution_due_at, first_responded_at, rating';

async function names(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  const { data } = await getAdminSupabase()
    .from('profiles')
    .select('user_id, full_name, email')
    .in('user_id', unique);
  for (const p of data ?? []) out.set(String(p.user_id), String(p.full_name) || String(p.email));
  return out;
}

async function companyNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  const { data } = await getAdminSupabase().from('companies').select('id, name').in('id', unique);
  for (const c of data ?? []) out.set(String(c.id), String(c.name));
  return out;
}

async function rows(raw: Record<string, unknown>[]): Promise<TicketRow[]> {
  const people = await names(
    raw.flatMap((r) => [String(r.requester_id), ...(r.assignee_id ? [String(r.assignee_id)] : [])]),
  );
  const companies = await companyNames(raw.map((r) => String(r.company_id)));
  const now = new Date();
  return raw.map((r) => {
    const created = new Date(String(r.created_at));
    const due = new Date(String(r.first_response_due_at));
    const responded = r.first_responded_at ? new Date(String(r.first_responded_at)) : null;
    const status = String(r.status) as TicketStatus;
    const live = status === 'open' || status === 'pending';
    return {
      id: String(r.id),
      number: String(r.number),
      subject: String(r.subject),
      category: String(r.category),
      priority: String(r.priority) as Priority,
      status,
      companyId: String(r.company_id),
      companyName: companies.get(String(r.company_id)) ?? '',
      requesterId: String(r.requester_id),
      assigneeId: r.assignee_id ? String(r.assignee_id) : null,
      assigneeName: r.assignee_id ? (people.get(String(r.assignee_id)) ?? '') : '',
      createdAt: String(r.created_at),
      lastActivityAt: String(r.last_activity_at),
      firstResponseDueAt: String(r.first_response_due_at),
      resolutionDueAt: String(r.resolution_due_at),
      sla: firstResponseState(created, due, responded, now),
      overdue: live && new Date(String(r.resolution_due_at)) < now,
      rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
    };
  });
}

async function messages(ticketId: string, includeInternal: boolean): Promise<MessageRow[]> {
  let q = getAdminSupabase()
    .from('support_messages')
    .select('id, author_id, author_kind, internal, body, created_at')
    .eq('ticket_id', ticketId)
    .is('deleted_at', null)
    .order('created_at')
    .limit(500);
  if (!includeInternal) q = q.eq('internal', false);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const people = await names(
    (data ?? []).flatMap((m) => (m.author_id ? [String(m.author_id)] : [])),
  );
  return (data ?? []).map((m) => ({
    id: String(m.id),
    authorKind: String(m.author_kind) as MessageRow['authorKind'],
    authorName:
      m.author_kind === 'system'
        ? 'KD SOLUTION IT'
        : m.author_kind === 'agent'
          ? 'Support'
          : (people.get(String(m.author_id)) ?? ''),
    internal: m.internal === true,
    body: String(m.body),
    at: String(m.created_at),
  }));
}

/** A person with the support sub-role is the only admin staff that may take a ticket. */
async function assertAssignable(userId: string): Promise<void> {
  const { data } = await getAdminSupabase()
    .from('profiles')
    .select('platform_role, admin_sub_role, status')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  const ok =
    data &&
    data.status === 'active' &&
    (data.platform_role === 'super_admin' ||
      data.platform_role === 'ceo' ||
      (data.platform_role === 'admin_staff' && data.admin_sub_role === 'support_agent'));
  if (!ok) throw new ValidationError('This person cannot take support tickets.');
}

/** Gives the new ticket to the on-duty support agent with the fewest open tickets, if anyone is on duty. */
async function autoAssignee(): Promise<string | null> {
  const duty = await onDutyNow('support_agent');
  if (duty.length === 0) return null;
  const { data } = await getAdminSupabase()
    .from('support_tickets')
    .select('assignee_id')
    .in('assignee_id', duty)
    .in('status', ['open', 'pending'])
    .is('deleted_at', null);
  const load = new Map<string, number>(duty.map((id) => [id, 0]));
  for (const r of data ?? [])
    load.set(String(r.assignee_id), (load.get(String(r.assignee_id)) ?? 0) + 1);
  return [...load.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;
}

const OPEN_LIMIT = 50;

export async function createTicket(
  actor: Actor,
  input: CreateTicketInput,
): Promise<{ id: string; number: string }> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const admin = getAdminSupabase();
  const open = await admin
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('status', ['open', 'pending'])
    .is('deleted_at', null);
  if ((open.count ?? 0) >= OPEN_LIMIT)
    throw new ValidationError(
      'You have many open tickets. Please wait for answers or close some first.',
    );
  const due = dueDates(input.priority, new Date());
  const assignee = await autoAssignee();
  const { data, error } = await admin
    .from('support_tickets')
    .insert({
      company_id: companyId,
      subject: input.subject,
      category: input.category,
      priority: input.priority,
      requester_id: actor.userId,
      assignee_id: assignee,
      first_response_due_at: due.first.toISOString(),
      resolution_due_at: due.resolve.toISOString(),
    })
    .select('id, number')
    .single();
  if (error) throw new InternalError(error);
  const m = await admin.from('support_messages').insert({
    company_id: companyId,
    ticket_id: String(data.id),
    author_id: actor.userId,
    author_kind: 'customer',
    body: input.body,
  });
  if (m.error) throw new InternalError(m.error);
  await getService('audit').record({
    action: 'support.ticket_created',
    resourceType: 'support_ticket',
    resourceId: String(data.id),
    companyId,
    metadata: { priority: input.priority, category: input.category, by: actor.userId },
  });
  if (assignee)
    await getService('notification')
      .notify({
        userId: assignee,
        type: 'support.assigned',
        title: `New ticket ${String(data.number)}`,
        body: input.subject,
        href: `/admin/support/${String(data.id)}`,
      })
      .catch(() => undefined);
  return { id: String(data.id), number: String(data.number) };
}

/** The company's own tickets. An owner sees all of them; a staff member sees the ones they opened. */
export async function listOwn(actor: Actor, status?: 'open' | 'closed'): Promise<TicketRow[]> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  let q = getAdminSupabase()
    .from('support_tickets')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('last_activity_at', { ascending: false })
    .limit(100);
  if (actor.role !== 'owner') q = q.eq('requester_id', actor.userId);
  if (status === 'open') q = q.in('status', ['open', 'pending', 'resolved']);
  if (status === 'closed') q = q.eq('status', 'closed');
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return rows(data ?? []);
}

async function loadTicket(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await getAdminSupabase()
    .from('support_tickets')
    .select(COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data;
}

function assertOwn(actor: Actor, ticket: Record<string, unknown>): void {
  if (!actor.companyId || String(ticket.company_id) !== actor.companyId) throw new NotFoundError();
  if (actor.role !== 'owner' && String(ticket.requester_id) !== actor.userId)
    throw new NotFoundError();
}

export async function ownDetail(actor: Actor, id: string): Promise<TicketDetail> {
  const ticket = await loadTicket(id);
  assertOwn(actor, ticket);
  const [row] = await rows([ticket]);
  if (!row) throw new NotFoundError();
  const people = await names([row.requesterId]);
  return {
    ...row,
    messages: await messages(id, false),
    requesterName: people.get(row.requesterId) ?? '',
  };
}

export async function runOwnAction(
  actor: Actor,
  id: string,
  input: OwnTicketAction,
): Promise<void> {
  const ticket = await loadTicket(id);
  assertOwn(actor, ticket);
  const admin = getAdminSupabase();
  const status = String(ticket.status) as TicketStatus;
  const companyId = String(ticket.company_id);
  const note = (action: string, extra: Record<string, unknown> = {}): Promise<void> =>
    getService('audit').record({
      action,
      resourceType: 'support_ticket',
      resourceId: id,
      companyId,
      metadata: { ...extra, by: actor.userId },
    });
  if (input.action === 'reply') {
    if (status === 'closed')
      throw new ValidationError('This ticket is closed. Reopen it to write again.');
    const m = await admin.from('support_messages').insert({
      company_id: companyId,
      ticket_id: id,
      author_id: actor.userId,
      author_kind: 'customer',
      body: input.body,
    });
    if (m.error) throw new InternalError(m.error);
    // A reply from the company puts a solved or waiting ticket back in the queue.
    const r = await admin
      .from('support_tickets')
      .update({ status: 'open', last_activity_at: new Date().toISOString(), resolved_at: null })
      .eq('id', id);
    if (r.error) throw new InternalError(r.error);
    await note('support.customer_replied');
    if (ticket.assignee_id)
      await getService('notification')
        .notify({
          userId: String(ticket.assignee_id),
          type: 'support.reply',
          title: `Reply on ${String(ticket.number)}`,
          body: String(ticket.subject),
          href: `/admin/support/${id}`,
        })
        .catch(() => undefined);
    return;
  }
  if (input.action === 'close') {
    if (status === 'closed') return;
    const r = await admin
      .from('support_tickets')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', id);
    if (r.error) throw new InternalError(r.error);
    await note('support.customer_closed');
    return;
  }
  if (input.action === 'reopen') {
    if (status !== 'closed' && status !== 'resolved')
      throw new ValidationError('This ticket is already open.');
    const r = await admin
      .from('support_tickets')
      .update({
        status: 'open',
        closed_at: null,
        resolved_at: null,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (r.error) throw new InternalError(r.error);
    await note('support.customer_reopened');
    return;
  }
  if (status !== 'resolved' && status !== 'closed')
    throw new ValidationError('You can rate a ticket after it is solved.');
  const r = await admin.from('support_tickets').update({ rating: input.rating }).eq('id', id);
  if (r.error) throw new InternalError(r.error);
  await note('support.rated', { rating: input.rating });
}

// ---- Agent side ----

export async function queue(
  actor: Actor,
  query: QueueQuery,
): Promise<{ rows: TicketRow[]; total: number }> {
  let q = getAdminSupabase()
    .from('support_tickets')
    .select(COLUMNS, { count: 'exact' })
    .is('deleted_at', null);
  if (query.status) q = q.eq('status', query.status);
  else q = q.in('status', ['open', 'pending']);
  if (query.view === 'unassigned') q = q.is('assignee_id', null);
  if (query.view === 'mine') q = q.eq('assignee_id', actor.userId);
  if (query.view === 'overdue')
    q = q.lt('first_response_due_at', new Date().toISOString()).is('first_responded_at', null);
  if (query.q) {
    const text = query.q.replace(/[%_,()\\*]/g, ' ').trim();
    if (text) q = q.or(`subject.ilike.%${text}%,number.ilike.%${text}%`);
  }
  const from = (query.page - 1) * QUEUE_PAGE_SIZE;
  const { data, error, count } = await q
    .order('first_response_due_at')
    .range(from, from + QUEUE_PAGE_SIZE - 1);
  if (error) throw new InternalError(error);
  return { rows: await rows(data ?? []), total: count ?? 0 };
}

export async function agentDetail(actor: Actor, id: string): Promise<TicketDetail> {
  const ticket = await loadTicket(id);
  const [row] = await rows([ticket]);
  if (!row) throw new NotFoundError();
  const people = await names([row.requesterId]);
  await getService('audit').record({
    action: 'support.ticket_viewed',
    resourceType: 'support_ticket',
    resourceId: id,
    companyId: row.companyId,
    metadata: { by: actor.userId },
  });
  return {
    ...row,
    messages: await messages(id, true),
    requesterName: people.get(row.requesterId) ?? '',
  };
}

export async function agents(): Promise<{ id: string; name: string }[]> {
  const { data } = await getAdminSupabase()
    .from('profiles')
    .select('user_id, full_name, email, platform_role, admin_sub_role')
    .eq('status', 'active')
    .is('deleted_at', null)
    .or(
      'platform_role.in.(super_admin,ceo),and(platform_role.eq.admin_staff,admin_sub_role.eq.support_agent)',
    );
  return (data ?? []).map((p) => ({
    id: String(p.user_id),
    name: String(p.full_name) || String(p.email),
  }));
}

export async function runAgentAction(
  actor: Actor,
  id: string,
  input: AgentTicketAction,
): Promise<void> {
  const ticket = await loadTicket(id);
  const admin = getAdminSupabase();
  const companyId = String(ticket.company_id);
  const status = String(ticket.status) as TicketStatus;
  const now = new Date().toISOString();
  const note = (action: string, extra: Record<string, unknown> = {}): Promise<void> =>
    getService('audit').record({
      action,
      resourceType: 'support_ticket',
      resourceId: id,
      companyId,
      metadata: { ...extra, by: actor.userId },
    });
  const update = async (values: Record<string, unknown>): Promise<void> => {
    const r = await admin
      .from('support_tickets')
      .update({ ...values, last_activity_at: now })
      .eq('id', id)
      .select('id');
    if (r.error) throw new InternalError(r.error);
    if (!r.data || r.data.length === 0) throw new ConflictError();
  };
  if (input.action === 'reply') {
    if (status === 'closed') throw new ValidationError('This ticket is closed.');
    const m = await admin.from('support_messages').insert({
      company_id: companyId,
      ticket_id: id,
      author_id: actor.userId,
      author_kind: 'agent',
      internal: input.internal,
      body: input.body,
    });
    if (m.error) throw new InternalError(m.error);
    if (input.internal) {
      await note('support.internal_note');
      return;
    }
    await update({
      status: 'pending',
      first_responded_at: ticket.first_responded_at ?? now,
      assignee_id: ticket.assignee_id ?? actor.userId,
    });
    await note('support.agent_replied');
    await getService('notification')
      .notify({
        companyId,
        userId: String(ticket.requester_id),
        type: 'support.answered',
        title: `Answer on ${String(ticket.number)}`,
        body: String(ticket.subject),
        href: `/support/${id}`,
      })
      .catch(() => undefined);
    return;
  }
  if (input.action === 'claim') {
    await update({ assignee_id: actor.userId });
    await note('support.claimed');
    return;
  }
  if (input.action === 'assign') {
    if (input.assigneeId) await assertAssignable(input.assigneeId);
    await update({ assignee_id: input.assigneeId });
    await note('support.assigned', { to: input.assigneeId });
    return;
  }
  if (input.action === 'priority') {
    const due = dueDates(input.priority, new Date(String(ticket.created_at)));
    await update({
      priority: input.priority,
      first_response_due_at: due.first.toISOString(),
      resolution_due_at: due.resolve.toISOString(),
    });
    await note('support.priority_changed', { priority: input.priority });
    return;
  }
  await update({
    status: input.status,
    resolved_at: input.status === 'resolved' ? now : null,
    closed_at: input.status === 'closed' ? now : null,
  });
  await note('support.status_changed', { status: input.status });
  if (input.status === 'resolved')
    await getService('notification')
      .notify({
        companyId,
        userId: String(ticket.requester_id),
        type: 'support.resolved',
        title: `Solved: ${String(ticket.number)}`,
        body: 'Tell us how we did, or reply if the problem is not solved.',
        href: `/support/${id}`,
      })
      .catch(() => undefined);
}

/** Job: closes solved tickets that stayed quiet, and raises a platform notice once for each late first answer. */
export async function sweepTickets(): Promise<{ closed: number; alerted: number }> {
  const admin = getAdminSupabase();
  const cutoff = new Date(Date.now() - AUTO_CLOSE_DAYS * 86_400_000).toISOString();
  const closed = await admin
    .from('support_tickets')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('status', 'resolved')
    .lt('last_activity_at', cutoff)
    .is('deleted_at', null)
    .select('id');
  if (closed.error) throw new InternalError(closed.error);
  const late = await admin
    .from('support_tickets')
    .select('id, number, subject, company_id, assignee_id')
    .in('status', ['open', 'pending'])
    .is('first_responded_at', null)
    .is('sla_alerted_at', null)
    .lt('first_response_due_at', new Date().toISOString())
    .is('deleted_at', null)
    .limit(100);
  if (late.error) throw new InternalError(late.error);
  let alerted = 0;
  for (const t of late.data ?? []) {
    const mark = await admin
      .from('support_tickets')
      .update({ sla_alerted_at: new Date().toISOString() })
      .eq('id', String(t.id))
      .is('sla_alerted_at', null)
      .select('id');
    if (mark.error || !mark.data || mark.data.length === 0) continue;
    alerted += 1;
    if (t.assignee_id)
      await getService('notification')
        .notify({
          userId: String(t.assignee_id),
          type: 'support.sla_breach',
          title: `Late: ${String(t.number)}`,
          body: `The first answer is overdue: ${String(t.subject)}`,
          href: `/admin/support/${String(t.id)}`,
        })
        .catch(() => undefined);
  }
  return { closed: closed.data?.length ?? 0, alerted };
}
