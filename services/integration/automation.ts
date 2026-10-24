// path: services/integration/automation.ts
// The server side of the automation tools: polling triggers (new events, newest first, each event once by its id), hook
// subscriptions for Zapier and Make (rows of `webhook_endpoints` with the source set, so delivery, signing, retries and the SSRF
// guard are the ones of 16.2), a note on a payment (sandbox keys only until the payments contract offers writes, request R1), and
// the summary the browser extension shows. Everything works for the company of the API key and never reads another company.
import 'server-only';
import { AppError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { dataSourceFor, type KeyMode } from '@/lib/integrations/api-key-rules';
import {
  hookInput,
  newest,
  summarize,
  triggerDef,
  type Summary,
  type TriggerItem,
  type TriggerName,
} from '@/lib/integrations/automation-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { allSandbox, getSandbox, updateSandbox } from '@/services/publicapi/sandbox';
import {
  createEndpoint,
  deleteEndpoint,
  getEndpoint,
  listEndpoints,
} from '@/services/webhookout/endpoints';

export interface Ctx {
  companyId: string;
  mode: KeyMode;
  keyId: string;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const nul = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

interface Source {
  table: string;
  columns: string;
  filter: { column: string; value: string };
  timeColumn: string;
  map: (r: Row, event: string) => TriggerItem;
}

const base = (
  r: Row,
  event: string,
  time: unknown,
): Omit<
  TriggerItem,
  'number' | 'client_id' | 'invoice_id' | 'name' | 'email' | 'amount' | 'status'
> => ({
  id: str(r.id),
  event,
  event_time: str(time),
});

const SOURCES: Record<TriggerName, Source> = {
  'invoice-paid': {
    table: 'invoices',
    columns: 'id, number, client_id, status, total, paid_at',
    filter: { column: 'status', value: 'paid' },
    timeColumn: 'paid_at',
    map: (r, e) => ({
      ...base(r, e, r.paid_at),
      number: nul(r.number),
      client_id: nul(r.client_id),
      invoice_id: str(r.id),
      name: null,
      email: null,
      amount: nul(r.total),
      status: str(r.status),
    }),
  },
  'client-created': {
    table: 'clients',
    columns: 'id, name, email, status, created_at',
    filter: { column: 'status', value: 'active' },
    timeColumn: 'created_at',
    map: (r, e) => ({
      ...base(r, e, r.created_at),
      number: null,
      client_id: str(r.id),
      invoice_id: null,
      name: nul(r.name),
      email: nul(r.email),
      amount: null,
      status: str(r.status),
    }),
  },
  'payment-received': {
    table: 'payments',
    columns: 'id, invoice_id, client_id, status, captured_amount, captured_at',
    filter: { column: 'status', value: 'captured' },
    timeColumn: 'captured_at',
    map: (r, e) => ({
      ...base(r, e, r.captured_at),
      number: null,
      client_id: nul(r.client_id),
      invoice_id: nul(r.invoice_id),
      name: null,
      email: null,
      amount: nul(r.captured_amount),
      status: str(r.status),
    }),
  },
  'estimate-approved': {
    table: 'estimates',
    columns: 'id, number, client_id, status, total, decided_at',
    filter: { column: 'status', value: 'accepted' },
    timeColumn: 'decided_at',
    map: (r, e) => ({
      ...base(r, e, r.decided_at),
      number: nul(r.number),
      client_id: nul(r.client_id),
      invoice_id: null,
      name: null,
      email: null,
      amount: nul(r.total),
      status: str(r.status),
    }),
  },
};

const SANDBOX_RESOURCE: Record<TriggerName, 'invoices' | 'clients' | 'payments' | 'estimates'> = {
  'invoice-paid': 'invoices',
  'client-created': 'clients',
  'payment-received': 'payments',
  'estimate-approved': 'estimates',
};
const SANDBOX_STATUS: Record<TriggerName, string | null> = {
  'invoice-paid': 'paid',
  'client-created': null,
  'payment-received': 'captured',
  'estimate-approved': 'accepted',
};

/** The latest events of a trigger, newest first, optionally only those after a time. A repeat poll returns the same ids, never a copy. */
export async function pollTrigger(
  ctx: Ctx,
  name: TriggerName,
  options: { limit: number; since?: string | undefined },
): Promise<TriggerItem[]> {
  const def = triggerDef(name);
  const src = SOURCES[name];
  if (dataSourceFor(ctx.mode) === 'sandbox') {
    const wanted = SANDBOX_STATUS[name];
    const records = await allSandbox(ctx.companyId, SANDBOX_RESOURCE[name]);
    const items = records
      .filter((r) => wanted === null || r.doc.status === wanted)
      .map((r) =>
        src.map(
          { id: r.id, ...r.doc, [src.timeColumn]: r.updatedAt, created_at: r.createdAt } as Row,
          def.event,
        ),
      );
    return newest(items, options.since, options.limit);
  }
  let q = getAdminSupabase()
    .from(src.table)
    .select(src.columns)
    .eq('company_id', ctx.companyId)
    .eq(src.filter.column, src.filter.value)
    .not(src.timeColumn, 'is', null)
    .is('deleted_at', null);
  if (options.since !== undefined) q = q.gt(src.timeColumn, options.since);
  const { data, error } = await q.order(src.timeColumn, { ascending: false }).limit(options.limit);
  if (error) throw new InternalError(error);
  return newest(
    ((data ?? []) as unknown as Row[]).map((r) => src.map(r, def.event)),
    options.since,
    options.limit,
  );
}

/* ---------- hook subscriptions (REST hooks for Zapier and Make) ---------- */

export interface HookOut {
  id: string;
  trigger: TriggerName;
  source: 'zapier' | 'make';
  target_url: string;
  signing_secret: string;
}

/** The identity used for the records a key makes: the id of the key stands in for a person. */
const keyActor = (ctx: Ctx): Actor => ({
  userId: ctx.keyId,
  role: 'owner',
  subRole: null,
  companyId: ctx.companyId,
  email: '',
  sessionId: `api-key:${ctx.keyId}`,
  impersonatedBy: null,
  authenticatedAt: new Date().toISOString(),
  lastStepUpAt: null,
  mfaVerified: false,
});

/** Subscribes a Zapier or Make hook URL to a trigger. The signing secret is in the answer and shown once. */
export async function subscribeHook(ctx: Ctx, input: unknown): Promise<HookOut> {
  const parsed = hookInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The hook is not valid.');
  const d = parsed.data;
  if (ctx.mode === 'sandbox')
    throw new AppError(
      'service_unavailable',
      501,
      'Hooks are not sent for sandbox keys. Use a live key.',
      { expose: true },
    );
  const def = triggerDef(d.trigger);
  const { endpoint, secret } = await createEndpoint(
    keyActor(ctx),
    { url: d.target_url, description: `${d.source} hook: ${def.title}`, events: [def.event] },
    d.source,
  );
  return {
    id: endpoint.id,
    trigger: d.trigger,
    source: d.source,
    target_url: endpoint.url,
    signing_secret: secret,
  };
}

/** Removes a hook made by Zapier or Make. Endpoints made by hand are not reachable from here. */
export async function unsubscribeHook(ctx: Ctx, id: string): Promise<void> {
  const endpoint = await getEndpoint(ctx.companyId, id);
  if (endpoint.source === 'manual') throw new NotFoundError();
  await deleteEndpoint(keyActor(ctx), id);
}

export async function listHooks(
  companyId: string,
): Promise<Awaited<ReturnType<typeof listEndpoints>>> {
  return (await listEndpoints(companyId)).filter((e) => e.source !== 'manual');
}

/* ---------- payment note ---------- */

/** Adds a note to a payment. Sandbox keys only: the payments contract has no write operation yet (request R1). */
export async function addPaymentNote(
  ctx: Ctx,
  paymentId: string,
  note: string,
): Promise<{ payment_id: string; notes: number }> {
  if (ctx.mode !== 'sandbox')
    throw new AppError(
      'service_unavailable',
      501,
      'Writing live records through the API is not available yet. Use a sandbox key to try writes.',
      { expose: true },
    );
  const current = await getSandbox(ctx.companyId, 'payments', paymentId);
  const notes = Array.isArray(current.doc.notes) ? (current.doc.notes as unknown[]) : [];
  const next = [...notes, { note, at: new Date().toISOString() }];
  await updateSandbox(ctx.companyId, 'payments', paymentId, { notes: next });
  return { payment_id: paymentId, notes: next.length };
}

/* ---------- summary for the browser extension ---------- */

/** Invoice counts and the amount still owed, from the latest 100 invoices. */
export async function invoiceSummary(ctx: Ctx): Promise<Summary> {
  const today = new Date().toISOString().slice(0, 10);
  if (dataSourceFor(ctx.mode) === 'sandbox') {
    const rows = (await allSandbox(ctx.companyId, 'invoices')).slice(-100).map((r) => ({
      status: str(r.doc.status),
      amount_due: str(r.doc.amount_due || '0'),
      due_date: nul(r.doc.due_date),
    }));
    return summarize(rows, today);
  }
  const { data, error } = await getAdminSupabase()
    .from('invoices')
    .select('status, amount_due, due_date')
    .eq('company_id', ctx.companyId)
    .is('deleted_at', null)
    .order('id', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return summarize(
    ((data ?? []) as unknown as Row[]).map((r) => ({
      status: str(r.status),
      amount_due: str(r.amount_due || '0'),
      due_date: nul(r.due_date),
    })),
    today,
  );
}
