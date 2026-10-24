// path: services/invoice/batch.ts
// Batch work: bulk actions on many invoices and batch invoicing for many clients. A batch is cut into items and a job works
// through them in small groups, so a thousand invoices never hold a web request. Each item records what happened; failed
// items can be retried; a batch can wait for a chosen time or be cancelled. Every item runs through the same service the
// single invoice uses, so rules (approval of staff invoices, duplicate warning, owner-only void) are never bypassed.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import {
  outcomeOfError,
  type BatchAction,
  type BatchCreate,
  type Outcome,
} from '@/lib/invoice/batch';
import { dueDateFor } from '@/lib/invoice/terms';
import type { InvoiceInput } from '@/lib/invoice/input';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { createInvoice, getInvoice, trashInvoice } from './invoices';
import { sendReminderNow } from './reminders';
import { sendInvoice, voidInvoice } from './send';

const PERMISSION: Record<BatchAction, string> = {
  send: 'invoice.send',
  remind: 'reminder.send',
  trash: 'invoice.delete',
  void: 'invoice.void',
  tag: 'invoice.update',
  create: 'invoice.create',
};

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

export interface BatchView {
  id: string;
  action: BatchAction;
  status: 'queued' | 'running' | 'done' | 'cancelled';
  total: number;
  done: number;
  failed: number;
  skipped: number;
  runAfter: string;
  /** True while the batch waits for the time it was scheduled for. */
  waiting: boolean;
  createdAt: string;
  finishedAt: string | null;
}

const COLUMNS =
  'id, action, status, item_count, done_count, failed_count, skipped_count, run_after, created_at, finished_at';

function toBatch(r: Record<string, unknown>): BatchView {
  return {
    id: String(r.id),
    action: String(r.action) as BatchAction,
    status: String(r.status) as BatchView['status'],
    total: toInt(r.item_count),
    done: toInt(r.done_count),
    failed: toInt(r.failed_count),
    skipped: toInt(r.skipped_count),
    runAfter: String(r.run_after),
    waiting: String(r.status) === 'queued' && Date.parse(String(r.run_after)) > Date.now(),
    createdAt: String(r.created_at),
    finishedAt: r.finished_at ? String(r.finished_at) : null,
  };
}

export async function listBatches(companyId: string): Promise<BatchView[]> {
  const { data, error } = await getAdminSupabase()
    .from('invoice_batches')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => toBatch(r as unknown as Record<string, unknown>));
}

export interface BatchItemView {
  id: string;
  invoiceId: string | null;
  clientId: string | null;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  message: string;
  attempts: number;
  resultInvoiceId: string | null;
}

export async function getBatch(
  companyId: string,
  id: string,
): Promise<{ batch: BatchView; items: BatchItemView[] }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('invoice_batches')
    .select(COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const rows = await admin
    .from('invoice_batch_items')
    .select('id, invoice_id, client_id, status, message, attempts, result_invoice_id')
    .eq('company_id', companyId)
    .eq('batch_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(600);
  if (rows.error) throw new InternalError(rows.error);
  const invoiceIds = [
    ...new Set(
      (rows.data ?? [])
        .flatMap((r) => [r.invoice_id, r.result_invoice_id])
        .filter((x): x is string => typeof x === 'string'),
    ),
  ];
  const clientIds = [
    ...new Set(
      (rows.data ?? []).map((r) => r.client_id).filter((x): x is string => typeof x === 'string'),
    ),
  ];
  const numbers = new Map<string, string>();
  const names = new Map<string, string>();
  if (invoiceIds.length > 0) {
    const inv = await admin
      .from('invoices')
      .select('id, number, walk_in_name, bill_to')
      .eq('company_id', companyId)
      .in('id', invoiceIds);
    if (inv.error) throw new InternalError(inv.error);
    for (const i of inv.data ?? []) {
      const bill = (i.bill_to ?? {}) as { name?: string };
      numbers.set(
        String(i.id),
        `${i.number ? String(i.number) : 'Draft'} - ${bill.name || String(i.walk_in_name ?? '')}`,
      );
    }
  }
  if (clientIds.length > 0) {
    const cl = await admin
      .from('clients')
      .select('id, name')
      .eq('company_id', companyId)
      .in('id', clientIds);
    if (cl.error) throw new InternalError(cl.error);
    for (const c of cl.data ?? []) names.set(String(c.id), String(c.name));
  }
  return {
    batch: toBatch(data as unknown as Record<string, unknown>),
    items: (rows.data ?? []).map((r) => ({
      id: String(r.id),
      invoiceId: r.invoice_id ? String(r.invoice_id) : null,
      clientId: r.client_id ? String(r.client_id) : null,
      label: r.invoice_id
        ? (numbers.get(String(r.invoice_id)) ?? '')
        : (names.get(String(r.client_id)) ?? ''),
      status: String(r.status) as BatchItemView['status'],
      message: String(r.message ?? ''),
      attempts: toInt(r.attempts),
      resultInvoiceId: r.result_invoice_id ? String(r.result_invoice_id) : null,
    })),
  };
}

function optionsOf(input: BatchCreate): Record<string, unknown> {
  switch (input.action) {
    case 'send':
      return { confirmDuplicate: input.confirmDuplicate, message: input.message };
    case 'remind':
      return { message: input.message };
    case 'void':
      return { reason: input.reason, acknowledgePayments: input.acknowledgePayments };
    case 'tag':
      return { tag: input.tag };
    case 'trash':
      return {};
    case 'create':
      return { template: input.template, autoSend: input.autoSend, message: input.message };
  }
}

/** Makes a batch and its items. An invoice that already waits in another batch for the same action is skipped. */
export async function createBatch(actor: Actor, input: BatchCreate): Promise<BatchView> {
  const companyId = need(actor);
  const perms = getService('permissions');
  if (!(await perms.can(actor, PERMISSION[input.action], { type: 'invoice' })))
    throw new ForbiddenError();
  if (input.action === 'void' && actor.role !== 'owner') throw new ForbiddenError();
  if (input.action === 'create' && input.autoSend && actor.role !== 'owner')
    throw new ValidationError('Only the owner can send invoices automatically.');
  const admin = getAdminSupabase();
  const targets = input.action === 'create' ? input.clientIds : input.invoiceIds;
  // Only things of this company can be part of a batch.
  const table = input.action === 'create' ? 'clients' : 'invoices';
  const found = new Set<string>();
  for (let i = 0; i < targets.length; i += 200) {
    const { data, error } = await admin
      .from(table)
      .select('id')
      .eq('company_id', companyId)
      .in('id', targets.slice(i, i + 200));
    if (error) throw new InternalError(error);
    for (const r of data ?? []) found.add(String(r.id));
  }
  if (found.size !== targets.length) throw new NotFoundError();
  const runAfter = input.runAfter ?? new Date().toISOString();
  const created = await admin
    .from('invoice_batches')
    .insert({
      company_id: companyId,
      action: input.action,
      item_count: targets.length,
      options: optionsOf(input),
      run_after: runAfter,
      created_by: actor.userId,
      created_role: actor.role === 'owner' ? 'owner' : 'staff',
    })
    .select(COLUMNS)
    .single();
  if (created.error) throw new InternalError(created.error);
  const batch = toBatch(created.data as unknown as Record<string, unknown>);
  const busy = new Set<string>();
  if (input.action !== 'create') {
    for (let i = 0; i < targets.length; i += 200) {
      const r = await admin
        .from('invoice_batch_items')
        .select('invoice_id')
        .eq('company_id', companyId)
        .eq('action', input.action)
        .in('invoice_id', targets.slice(i, i + 200))
        .in('status', ['pending', 'running'])
        .is('deleted_at', null);
      if (r.error) throw new InternalError(r.error);
      for (const x of r.data ?? []) busy.add(String(x.invoice_id));
    }
  }
  const rows = targets.map((id) => ({
    company_id: companyId,
    batch_id: batch.id,
    action: input.action,
    ...(input.action === 'create' ? { client_id: id } : { invoice_id: id }),
    status: busy.has(id) ? 'skipped' : 'pending',
    message: busy.has(id) ? 'Already waiting in another batch.' : '',
  }));
  for (let i = 0; i < rows.length; i += 500) {
    // tenant-ok: every row carries company_id
    const r = await admin.from('invoice_batch_items').insert(rows.slice(i, i + 500));
    if (r.error) throw new InternalError(r.error);
  }
  if (busy.size > 0) {
    await admin
      .from('invoice_batches')
      .update({ skipped_count: busy.size })
      .eq('id', batch.id)
      .eq('company_id', companyId);
    if (busy.size === targets.length)
      await admin
        .from('invoice_batches')
        .update({ status: 'done', finished_at: new Date().toISOString() })
        .eq('id', batch.id)
        .eq('company_id', companyId);
  }
  await getService('audit').record({
    action: 'invoice.batch_created',
    resourceType: 'invoice_batch',
    resourceId: batch.id,
    companyId,
    metadata: { action: input.action, items: targets.length, skipped: busy.size, by: actor.userId },
  });
  return (await getBatch(companyId, batch.id)).batch;
}

export async function cancelBatch(actor: Actor, id: string): Promise<BatchView> {
  const companyId = need(actor);
  await getBatch(companyId, id);
  const { error } = await getAdminSupabase().rpc('kd_batch_cancel', {
    p_company: companyId,
    p_batch: id,
  });
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'invoice.batch_cancelled',
    resourceType: 'invoice_batch',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return (await getBatch(companyId, id)).batch;
}

export async function retryBatch(actor: Actor, id: string): Promise<BatchView> {
  const companyId = need(actor);
  const current = await getBatch(companyId, id);
  if (current.batch.status === 'cancelled')
    throw new ValidationError('A cancelled batch cannot be retried.');
  const { data, error } = await getAdminSupabase().rpc('kd_batch_retry', {
    p_company: companyId,
    p_batch: id,
  });
  if (error) throw new InternalError(error);
  if (toInt(data) === 0) throw new ValidationError('Nothing failed in this batch.');
  return (await getBatch(companyId, id)).batch;
}

// ---------- the worker ----------

interface Claimed {
  item_id: string;
  batch_id: string;
  company_id: string;
  action: BatchAction;
  invoice_id: string | null;
  client_id: string | null;
  attempts: number;
  options: Record<string, unknown>;
  created_by: string;
  created_role: 'owner' | 'staff';
}

function actorOf(c: Claimed): Actor {
  return {
    userId: c.created_by,
    role: c.created_role,
    subRole: null,
    companyId: c.company_id,
    email: '',
    sessionId: 'batch',
    impersonatedBy: null,
    authenticatedAt: new Date().toISOString(),
    lastStepUpAt: null,
    mfaVerified: true,
  };
}

async function runItem(c: Claimed): Promise<Outcome> {
  const actor = actorOf(c);
  const o = c.options;
  const invoiceId = c.invoice_id;
  switch (c.action) {
    case 'send': {
      const invoice = await getInvoice(c.company_id, invoiceId as string);
      if (invoice.status !== 'draft') return { status: 'skipped', message: 'Already sent.' };
      const r = await sendInvoice(actor, invoice.id, {
        confirmDuplicate: o.confirmDuplicate === true,
        message: String(o.message ?? ''),
      });
      return {
        status: 'done',
        message:
          r.outcome === 'waiting'
            ? 'Waiting for the owner to approve.'
            : r.emailed
              ? 'Sent and e-mailed.'
              : 'Sent (no client e-mail).',
      };
    }
    case 'remind':
      await sendReminderNow(actor, invoiceId as string, String(o.message ?? ''));
      return { status: 'done', message: 'Reminder sent.' };
    case 'trash':
      await trashInvoice(actor, invoiceId as string);
      return { status: 'done', message: 'Moved to the trash.' };
    case 'void': {
      const invoice = await getInvoice(c.company_id, invoiceId as string);
      if (invoice.status === 'void') return { status: 'skipped', message: 'Already void.' };
      await voidInvoice(actor, invoice.id, String(o.reason ?? ''), {
        acknowledgePayments: o.acknowledgePayments === true,
      });
      return { status: 'done', message: 'Voided.' };
    }
    case 'tag': {
      const invoice = await getInvoice(c.company_id, invoiceId as string);
      const tag = String(o.tag ?? '');
      if (invoice.tags.includes(tag)) return { status: 'skipped', message: 'Already has the tag.' };
      const r = await getAdminSupabase()
        .from('invoices')
        .update({ tags: [...invoice.tags, tag].slice(0, 20), version: invoice.version + 1 })
        .eq('id', invoice.id)
        .eq('company_id', c.company_id)
        .eq('version', invoice.version)
        .select('id');
      if (r.error) throw new InternalError(r.error);
      if (!r.data || r.data.length === 0) throw new ConflictError();
      return { status: 'done', message: 'Tag added.' };
    }
    case 'create': {
      const template = o.template as InvoiceInput;
      const billing = await getService('clients').getBilling(c.client_id as string);
      const today = new Date().toISOString().slice(0, 10);
      const input: InvoiceInput = {
        ...template,
        kind: 'invoice',
        clientId: c.client_id,
        walkInName: '',
        billTo: {
          ...template.billTo,
          name: billing.name,
          email: billing.email ?? '',
          postalCode: billing.billingPostalCode ?? '',
          country: billing.billingCountry,
        },
        issueDate: today,
        dueDate: dueDateFor(
          today,
          template.paymentTerms,
          template.paymentTerms === 'custom' ? today : null,
        ),
      };
      const invoice = await createInvoice(actor, input);
      if (o.autoSend === true && c.created_role === 'owner') {
        try {
          await sendInvoice(actor, invoice.id, {
            confirmDuplicate: true,
            message: String(o.message ?? ''),
          });
          return { status: 'done', message: 'Created and sent.', resultInvoice: invoice.id };
        } catch (e) {
          return {
            status: 'done',
            message: `Created, not sent: ${e instanceof Error ? e.message : 'unknown error'}`.slice(
              0,
              280,
            ),
            resultInvoice: invoice.id,
          };
        }
      }
      return { status: 'done', message: 'Draft created.', resultInvoice: invoice.id };
    }
  }
}

/** Job (every minute): works through up to `limit` waiting items. */
export async function processBatches(limit = 30): Promise<number> {
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc('kd_batch_claim', { p_limit: limit });
  if (error) throw new InternalError(error);
  const items = (data ?? []) as Claimed[];
  for (const c of items) {
    let outcome: Outcome;
    try {
      outcome = await runItem(c);
    } catch (e) {
      outcome = outcomeOfError(e, toInt(c.attempts, 1));
    }
    const r = await admin.rpc('kd_batch_item_result', {
      p_item: c.item_id,
      p_status: outcome.status,
      p_message: outcome.message,
      p_result_invoice: outcome.resultInvoice ?? null,
    });
    if (r.error) throw new InternalError(r.error);
  }
  return items.length;
}
