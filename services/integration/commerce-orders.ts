// path: services/integration/commerce-orders.ts
// Orders that a store sent. A delivery is handled once (by its delivery id); an order is kept once per store and order id. An
// order is checked for conflicts (another currency, a SKU that is not mapped, no e-mail, no billing address); when there is none,
// the client is found by e-mail or made through the clients service, and the order is "client ready". The invoice draft waits for
// request R1 (BLOCKERS B7). A failure is tried again after 5 minutes, 30 minutes, 2 hours and 12 hours, five tries in all, and a
// person can try again at any time.
import 'server-only';
import { MAX_ORDER_ATTEMPTS, ORDER_BATCH, type OrderStatus } from '@/config/s16-commerce';
import { ConflictError, InternalError, NotFoundError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  conflictsOf,
  handleAfter,
  normalizeShopifyOrder,
  normalizeWooOrder,
  readShopifyRefund,
  retryAt,
  skusOf,
  type NormalizedOrder,
} from '@/lib/integrations/mapping-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import { connectionRow, type WebhookConnection } from './connections';
import { need, record, syncActor, writeLog } from './commerce-db';
import { createInvoiceDraft, findOrCreateClient, invoiceDraftsAvailable } from './commerce-ports';

const log = createLogger({ component: 'commerce-orders' });

const COLUMNS =
  'id, company_id, integration_id, external_id, external_number, status, email, customer_name, currency, total, payload, client_id, invoice_id, attempts, next_attempt_at, last_error, ordered_at, received_at, processed_at, version';

interface Row {
  id: string;
  company_id: string;
  integration_id: string;
  external_id: string;
  external_number: string | null;
  status: string;
  email: string | null;
  customer_name: string | null;
  currency: string | null;
  total: string | null;
  payload: NormalizedOrder;
  client_id: string | null;
  invoice_id: string | null;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  ordered_at: string | null;
  received_at: string;
  processed_at: string | null;
  version: number;
}

export interface OrderView {
  id: string;
  integrationId: string;
  externalId: string;
  number: string | null;
  status: OrderStatus;
  email: string | null;
  customerName: string | null;
  currency: string | null;
  total: string | null;
  clientId: string | null;
  invoiceId: string | null;
  attempts: number;
  lastError: string | null;
  orderedAt: string | null;
  receivedAt: string;
  lines: { sku: string | null; title: string; quantity: number; unitPrice: string }[];
  version: number;
}

const STATUSES: readonly OrderStatus[] = [
  'received',
  'conflict',
  'client_ready',
  'synced',
  'failed',
  'ignored',
  'cancelled',
];

const toView = (r: Row): OrderView => ({
  id: r.id,
  integrationId: r.integration_id,
  externalId: r.external_id,
  number: r.external_number,
  status: STATUSES.find((s) => s === r.status) ?? 'received',
  email: r.email,
  customerName: r.customer_name,
  currency: r.currency,
  total: r.total,
  clientId: r.client_id,
  invoiceId: r.invoice_id,
  attempts: r.attempts,
  lastError: r.last_error,
  orderedAt: r.ordered_at,
  receivedAt: r.received_at,
  lines: (r.payload.lines ?? []).map((l) => ({
    sku: l.sku,
    title: l.title,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
  })),
  version: r.version,
});

export async function listOrders(
  companyId: string,
  filter: { integrationId?: string; status?: string; limit?: number } = {},
): Promise<OrderView[]> {
  let q = getAdminSupabase()
    .from('integration_orders')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('received_at', { ascending: false })
    .limit(Math.min(filter.limit ?? 50, 200));
  if (filter.integrationId) q = q.eq('integration_id', filter.integrationId);
  if (filter.status) q = q.eq('status', filter.status);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toView);
}

async function rowOf(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('integration_orders')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

/* ---------- the delivery ---------- */

export type DeliveryResult = 'processed' | 'duplicate' | 'ignored';

/**
 * Handles one verified delivery of a store: records its id (a repeat does nothing), reads the order or refund, keeps the order, and
 * when the sync mode is real time, handles it at once. Anything that goes wrong after the order was kept is written to the order
 * and tried again later, so the store is answered 200 and does not deliver the same thing again.
 */
export async function handleDelivery(
  conn: WebhookConnection,
  delivery: { webhookId: string; topic: string; json: unknown },
): Promise<DeliveryResult> {
  const admin = getAdminSupabase();
  const first = await admin.from('integration_webhook_events').insert({
    company_id: conn.companyId,
    integration_id: conn.id,
    webhook_id: delivery.webhookId.slice(0, 200),
    topic: delivery.topic.slice(0, 80),
  });
  if (first.error) {
    if (first.error.code === '23505') return 'duplicate';
    throw new InternalError(first.error);
  }
  if (conn.status !== 'active') {
    await writeLog(
      conn.companyId,
      conn.id,
      null,
      'webhook',
      'warn',
      `Paused: ${delivery.topic} not handled.`,
    );
    return 'ignored';
  }
  if (conn.provider === 'shopify' && delivery.topic === 'refunds/create') {
    await handleRefund(conn, delivery.json);
    return 'processed';
  }
  const order =
    conn.provider === 'shopify'
      ? normalizeShopifyOrder(delivery.json)
      : normalizeWooOrder(delivery.json);
  if (order === null) {
    await writeLog(
      conn.companyId,
      conn.id,
      null,
      'webhook',
      'warn',
      `${delivery.topic}: the order could not be read.`,
    );
    return 'ignored';
  }
  const kept = await keepOrder(conn, order);
  await writeLog(
    conn.companyId,
    conn.id,
    kept.id,
    'order',
    'info',
    `${delivery.topic}: order ${order.number ?? order.externalId} kept.`,
  );
  if (conn.syncMode === 'realtime' && conn.autoClient && kept.status === 'received')
    await processOrder(conn.companyId, kept.id);
  return 'processed';
}

async function keepOrder(
  conn: WebhookConnection,
  order: NormalizedOrder,
): Promise<{ id: string; status: string }> {
  const admin = getAdminSupabase();
  const found = await admin
    .from('integration_orders')
    .select('id, status')
    .eq('integration_id', conn.id)
    .eq('external_id', order.externalId)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  const fields = {
    external_number: order.number,
    email: order.email,
    customer_name: order.customerName,
    currency: order.currency,
    total: order.total,
    payload: order,
    ordered_at: order.orderedAt,
  };
  if (!found.data) {
    const { data, error } = await admin
      .from('integration_orders')
      .insert({
        company_id: conn.companyId,
        integration_id: conn.id,
        external_id: order.externalId,
        status: 'received',
        next_attempt_at: handleAfter(conn.syncMode, new Date()).toISOString(),
        ...fields,
      })
      .select('id, status')
      .single();
    if (error) {
      // Two deliveries for one new order at the same moment: the second finds the first.
      if (error.code === '23505') return keepOrder(conn, order);
      mapIntegrationError(error);
    }
    const created = data as unknown as { id: string; status: string };
    if (order.cancelled) return cancel(conn.companyId, created.id);
    return created;
  }
  const existing = found.data as unknown as { id: string; status: string };
  if (['synced', 'ignored', 'cancelled'].includes(existing.status)) return existing;
  if (order.cancelled) return cancel(conn.companyId, existing.id);
  const update = await admin
    .from('integration_orders')
    .update(fields)
    .eq('company_id', conn.companyId)
    .eq('id', existing.id);
  if (update.error) mapIntegrationError(update.error);
  return existing;
}

async function cancel(companyId: string, id: string): Promise<{ id: string; status: string }> {
  const { error } = await getAdminSupabase()
    .from('integration_orders')
    .update({ status: 'cancelled', processed_at: new Date().toISOString(), next_attempt_at: null })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
  return { id, status: 'cancelled' };
}

async function handleRefund(conn: WebhookConnection, json: unknown): Promise<void> {
  const refund = readShopifyRefund(json);
  if (refund === null) {
    await writeLog(conn.companyId, conn.id, null, 'refund', 'warn', 'A refund could not be read.');
    return;
  }
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('integration_orders')
    .select('id')
    .eq('integration_id', conn.id)
    .eq('external_id', refund.orderId)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) {
    await writeLog(
      conn.companyId,
      conn.id,
      null,
      'refund',
      'warn',
      `Refund ${refund.refundId}: order ${refund.orderId} is not known.`,
    );
    return;
  }
  const orderId = String((data as { id: string }).id);
  const made = await admin.from('integration_conflicts').insert({
    company_id: conn.companyId,
    integration_id: conn.id,
    order_id: orderId,
    kind: 'refund',
    detail: `Refund ${refund.refundId} was made in the store. A credit note has to be made by a person.`,
  });
  if (made.error && made.error.code !== '23505') throw new InternalError(made.error);
  await writeLog(
    conn.companyId,
    conn.id,
    orderId,
    'refund',
    'warn',
    `Refund ${refund.refundId} needs a credit note.`,
  );
}

/* ---------- handling an order ---------- */

async function mappedSkus(
  companyId: string,
  integrationId: string,
  skus: string[],
): Promise<Set<string>> {
  if (skus.length === 0) return new Set();
  const { data, error } = await getAdminSupabase()
    .from('integration_mappings')
    .select('external_sku')
    .eq('company_id', companyId)
    .eq('integration_id', integrationId)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  const have = new Set(
    ((data ?? []) as { external_sku: string }[]).map((m) => m.external_sku.toLowerCase()),
  );
  return new Set(skus.filter((s) => have.has(s)));
}

/** Handles one order: conflicts, then the client, then (when it can) the invoice draft. Never throws for a store-side problem. */
export async function processOrder(companyId: string, orderId: string): Promise<OrderStatus> {
  const order = await rowOf(companyId, orderId);
  if (!['received', 'failed', 'client_ready'].includes(order.status))
    return STATUSES.find((s) => s === order.status) ?? 'received';
  const conn = await connectionRow(companyId, order.integration_id);
  const actor = syncActor(companyId, conn.createdBy);
  const normalized = order.payload;
  try {
    // A failed order starts again from "received".
    if (order.status === 'failed') await setStatus(companyId, orderId, 'received', {});
    let clientId = order.client_id;
    if (order.status !== 'client_ready') {
      // 1. conflicts
      if ((await settleConflicts(order, normalized)) > 0) {
        await setStatus(companyId, orderId, 'conflict', {
          last_error: null,
          next_attempt_at: null,
        });
        return 'conflict';
      }
      // 2. the client
      if (clientId === null) {
        const client = await findOrCreateClient(actor, normalized);
        clientId = client.id;
        await writeLog(
          companyId,
          order.integration_id,
          orderId,
          'client',
          'info',
          client.created ? 'A client was made.' : 'The client was found by e-mail.',
        );
      }
      await setStatus(companyId, orderId, 'client_ready', {
        client_id: clientId,
        last_error: null,
        next_attempt_at: null,
        attempts: 0,
      });
      if (!invoiceDraftsAvailable())
        await writeLog(
          companyId,
          order.integration_id,
          orderId,
          'invoice',
          'info',
          'Waiting for invoice drafts (request R1).',
        );
    }
    // 3. the invoice draft (needs request R1)
    if (!invoiceDraftsAvailable() || clientId === null) return 'client_ready';
    const invoiceId = await createInvoiceDraft(actor, normalized, clientId);
    if (invoiceId === null) return 'client_ready';
    await setStatus(companyId, orderId, 'synced', {
      invoice_id: invoiceId,
      processed_at: new Date().toISOString(),
    });
    await writeLog(
      companyId,
      order.integration_id,
      orderId,
      'invoice',
      'info',
      'An invoice draft was made.',
    );
    await getAdminSupabase()
      .from('integrations')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', order.integration_id);
    return 'synced';
  } catch (error) {
    const attempts = order.attempts + 1;
    const message = error instanceof Error ? error.message.slice(0, 300) : 'The order failed.';
    log.warn('order failed', { orderId, attempts });
    const when = retryAt(attempts, new Date(), MAX_ORDER_ATTEMPTS);
    await setStatus(companyId, orderId, 'failed', {
      attempts,
      last_error: message,
      next_attempt_at: when === null ? null : when.toISOString(),
    });
    await writeLog(
      companyId,
      order.integration_id,
      orderId,
      'retry',
      'error',
      `${message}${when === null ? ' No more tries.' : ''}`,
    );
    return 'failed';
  }
}

/**
 * Records the conflicts of an order and returns how many of them stop it. A conflict that is gone (the SKU was mapped, the address
 * was added) closes itself; one that a person resolved or ignored does not stop the order again.
 */
async function settleConflicts(order: Row, normalized: NormalizedOrder): Promise<number> {
  const admin = getAdminSupabase();
  const companyId = order.company_id;
  const mapped = await mappedSkus(companyId, order.integration_id, skusOf(normalized));
  const found = conflictsOf(normalized, mapped);
  const existing = await admin
    .from('integration_conflicts')
    .select('id, kind, detail, status')
    .eq('company_id', companyId)
    .eq('order_id', order.id);
  if (existing.error) throw new InternalError(existing.error);
  const known = (existing.data ?? []) as {
    id: string;
    kind: string;
    detail: string;
    status: string;
  }[];
  const now = new Date().toISOString();
  for (const k of known) {
    if (k.status !== 'open' || k.kind === 'refund') continue;
    if (found.some((f) => f.kind === k.kind && f.detail === k.detail)) continue;
    await admin
      .from('integration_conflicts')
      .update({
        status: 'resolved',
        resolved_at: now,
        resolution: 'Fixed in the store or by a mapping.',
      })
      .eq('company_id', companyId)
      .eq('id', k.id);
  }
  let blocking = 0;
  for (const f of found) {
    const hit = known.find((k) => k.kind === f.kind && k.detail === f.detail);
    if (hit === undefined) {
      const made = await admin.from('integration_conflicts').insert({
        company_id: companyId,
        integration_id: order.integration_id,
        order_id: order.id,
        kind: f.kind,
        detail: f.detail,
      });
      if (made.error && made.error.code !== '23505') throw new InternalError(made.error);
      await writeLog(companyId, order.integration_id, order.id, 'conflict', 'warn', f.detail);
      blocking += 1;
    } else if (hit.status === 'open') blocking += 1;
  }
  return blocking;
}

async function setStatus(
  companyId: string,
  id: string,
  status: OrderStatus,
  extra: Record<string, unknown>,
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('integration_orders')
    .update({ status, ...extra })
    .eq('company_id', companyId)
    .eq('id', id);
  if (error) mapIntegrationError(error);
}

/** A person tries an order again (a failed order, or one that waited in conflict): the tries start over and the order is handled now. */
export async function retryOrder(actor: Actor, id: string): Promise<OrderView> {
  const companyId = need(actor);
  const order = await rowOf(companyId, id);
  if (!['failed', 'conflict'].includes(order.status) && order.status !== 'received')
    throw new ConflictError('This order cannot be tried again.');
  if (order.status !== 'received')
    await setStatus(companyId, id, 'received', {
      attempts: 0,
      last_error: null,
      next_attempt_at: null,
    });
  await record(companyId, 'commerce.order_retried', 'integration_order', id, {});
  await writeLog(companyId, order.integration_id, id, 'retry', 'info', 'Tried again by a person.');
  await processOrder(companyId, id);
  return toView(await rowOf(companyId, id));
}

/** A person decides that an order is not to be handled. */
export async function ignoreOrder(actor: Actor, id: string): Promise<OrderView> {
  const companyId = need(actor);
  const order = await rowOf(companyId, id);
  if (!['received', 'conflict', 'failed'].includes(order.status))
    throw new ConflictError('This order cannot be ignored.');
  await setStatus(companyId, id, 'ignored', {
    next_attempt_at: null,
    processed_at: new Date().toISOString(),
  });
  await record(companyId, 'commerce.order_ignored', 'integration_order', id, {});
  await writeLog(companyId, order.integration_id, id, 'order', 'info', 'Ignored by a person.');
  return toView(await rowOf(companyId, id));
}

/**
 * The cron job: orders whose time has come (hourly and daily stores, and orders that failed). One batch per run. Orders of paused
 * or disconnected stores wait.
 */
export async function runDueOrders(now: Date = new Date()): Promise<{ handled: number }> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('integration_orders')
    .select('id, company_id, integration_id, status')
    .in(
      'status',
      invoiceDraftsAvailable() ? ['received', 'failed', 'client_ready'] : ['received', 'failed'],
    )
    .is('deleted_at', null)
    .lte('next_attempt_at', now.toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(ORDER_BATCH);
  if (error) throw new InternalError(error);
  let handled = 0;
  for (const r of (data ?? []) as { id: string; company_id: string; integration_id: string }[]) {
    try {
      const conn = await connectionRow(r.company_id, r.integration_id);
      if (conn.status !== 'active' || !conn.autoClient) continue;
      await processOrder(r.company_id, r.id);
      handled += 1;
    } catch (e) {
      log.warn('due order skipped', {
        orderId: r.id,
        error: e instanceof Error ? e.message : 'error',
      });
    }
  }
  return { handled };
}
