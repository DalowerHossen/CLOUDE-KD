// path: services/checkout/sessions.ts
// Hosted checkout sessions (white-label checkout API). A merchant's store asks for a session for one order; the platform makes an
// invoice for it and a payment link, and answers with the address of the hosted payment page. One order reference is one session
// for ever: asking again returns the same session, and a paid order cannot be paid again. Live sessions need an approved KYC.
// Other STEPs are reached only through the `invoices`, `payments` and `kyc` contracts; the money side lives in the invoice.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, ForbiddenError, InternalError, NotFoundError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  SESSION_DEFAULT_VALID_HOURS,
  claimIsStale,
  effectiveStatus,
  sameOrder,
  type SessionAnswer,
  type SessionInput,
  type SessionStatus,
} from '@/lib/checkout/session-rules';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { EncryptedPayload } from '@/types/contracts';

const log = createLogger({ service: 'checkout-sessions' });

const COLUMNS =
  'id, company_id, api_key_id, external_ref, invoice_id, payment_link_id, checkout_url_enc, amount, customer_name, customer_email, description, success_url, cancel_url, metadata, status, expires_at, paid_at, created_at, updated_at, version';

interface Row {
  id: string;
  company_id: string;
  api_key_id: string | null;
  external_ref: string;
  invoice_id: string | null;
  payment_link_id: string | null;
  checkout_url_enc: EncryptedPayload | null;
  amount: string;
  customer_name: string;
  customer_email: string;
  description: string;
  success_url: string;
  cancel_url: string;
  metadata: Record<string, string>;
  status: SessionStatus;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface SessionContext {
  companyId: string;
  keyId: string;
  /** The owner who made the API key. */
  createdBy: string | null;
  mode: 'live' | 'sandbox';
}

async function openUrl(row: Row): Promise<string | null> {
  if (!row.checkout_url_enc) return null;
  const bytes = await getService('encryption').decrypt('pii', row.checkout_url_enc, row.company_id);
  return new TextDecoder().decode(bytes);
}

async function answer(row: Row, now: Date): Promise<SessionAnswer> {
  const status = effectiveStatus(row.status, row.expires_at, now);
  if (status === 'creating')
    throw new ConflictError('This order is being prepared. Ask again in a moment.');
  return {
    id: row.id,
    order_id: row.external_ref,
    status,
    amount: Money.parse(row.amount)
      .toDbString()
      .replace(/(\.\d{2})00$/, '$1'),
    currency: 'USD',
    checkout_url: status === 'open' ? await openUrl(row) : null,
    expires_at: row.expires_at,
    paid_at: row.paid_at,
    created_at: row.created_at,
  };
}

async function byOrder(companyId: string, ref: string): Promise<Row | null> {
  const { data, error } = await getAdminSupabase()
    .from('checkout_sessions')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('external_ref', ref)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return (data as unknown as Row | null) ?? null;
}

async function byId(companyId: string, id: string): Promise<Row> {
  const { data, error } = await getAdminSupabase()
    .from('checkout_sessions')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

/** Looks at the invoice behind a session and records a payment that happened since the last look. */
async function refresh(row: Row, now: Date): Promise<Row> {
  if (row.status !== 'open' || !row.invoice_id) return row;
  const invoice = await getService('invoices').getForPayment(row.invoice_id);
  if (invoice.status === 'paid') {
    const paidAt = now.toISOString();
    const { data, error } = await getAdminSupabase()
      .from('checkout_sessions')
      .update({ status: 'paid', paid_at: paidAt })
      .eq('id', row.id)
      .eq('company_id', row.company_id)
      .eq('status', 'open')
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw new InternalError(error);
    return (data as unknown as Row | null) ?? { ...row, status: 'paid', paid_at: paidAt };
  }
  if (invoice.status === 'void') return { ...row, status: 'cancelled' };
  return row;
}

async function requireLive(ctx: SessionContext): Promise<string> {
  if (ctx.mode !== 'live')
    throw new ForbiddenError(
      'Checkout sessions need a live key. Live checkout keys are available after your business check (KYC) is approved.',
    );
  if (!ctx.createdBy) throw new ForbiddenError('This key has no owner. Make a new key.');
  if (!(await getService('kyc').isVerified(ctx.companyId)))
    throw new ForbiddenError(
      'Your business check (KYC) is not approved, so live checkout is not available.',
    );
  return ctx.createdBy;
}

/** Takes the claim on an order: only one request makes the invoice. Returns the row to fill, or the finished session. */
async function claim(
  ctx: SessionContext,
  input: SessionInput,
  now: Date,
): Promise<{ row: Row; fresh: boolean }> {
  const admin = getAdminSupabase();
  const inserted = await admin
    .from('checkout_sessions')
    .insert({
      company_id: ctx.companyId,
      api_key_id: ctx.keyId,
      external_ref: input.order_id,
      amount: input.amount,
      customer_name: input.customer.name,
      customer_email: input.customer.email,
      description: input.description ?? '',
      success_url: input.success_url,
      cancel_url: input.cancel_url,
      metadata: input.metadata ?? {},
      status: 'creating',
    })
    .select(COLUMNS)
    .single();
  if (!inserted.error) return { row: inserted.data as unknown as Row, fresh: true };
  if (inserted.error.code !== '23505') throw new InternalError(inserted.error);
  const existing = await byOrder(ctx.companyId, input.order_id);
  if (!existing) throw new ConflictError('Ask again in a moment.');
  if (existing.status === 'creating' && claimIsStale(existing.updated_at, now)) {
    // A request that died half way: take its claim over (only one request wins the update).
    const taken = await admin
      .from('checkout_sessions')
      .update({ updated_at: now.toISOString(), api_key_id: ctx.keyId })
      .eq('id', existing.id)
      .eq('status', 'creating')
      .eq('version', existing.version)
      .select(COLUMNS)
      .maybeSingle();
    if (taken.error) throw new InternalError(taken.error);
    if (taken.data) return { row: taken.data as unknown as Row, fresh: true };
  }
  return { row: existing, fresh: false };
}

async function fill(
  ctx: SessionContext,
  row: Row,
  input: SessionInput,
  createdBy: string,
): Promise<Row> {
  const hours = input.expires_in_hours ?? SESSION_DEFAULT_VALID_HOURS;
  let invoiceId = row.invoice_id;
  if (!invoiceId) {
    const made = await getService('invoices').createForOrder({
      companyId: ctx.companyId,
      createdBy,
      reference: input.order_id,
      customerName: input.customer.name,
      customerEmail: input.customer.email,
      customerCountry: input.customer.country,
      customerPostalCode: input.customer.postal_code ?? null,
      description: input.description ?? '',
      amount: Money.parse(input.amount),
    });
    invoiceId = made.invoiceId;
    // Remember the invoice at once, so a request that takes over after a crash does not make a second one.
    const saved = await getAdminSupabase()
      .from('checkout_sessions')
      .update({ invoice_id: invoiceId })
      .eq('id', row.id)
      .eq('company_id', ctx.companyId);
    if (saved.error) throw new InternalError(saved.error);
  }
  const link = await getService('payments').createLink({
    companyId: ctx.companyId,
    invoiceId,
    createdBy,
    validHours: hours,
  });
  const sealed = await getService('encryption').encrypt('pii', link.url, ctx.companyId);
  const { data, error } = await getAdminSupabase()
    .from('checkout_sessions')
    .update({
      invoice_id: invoiceId,
      payment_link_id: link.linkId,
      checkout_url_enc: sealed,
      expires_at: link.expiresAt,
      status: 'open',
    })
    .eq('id', row.id)
    .eq('company_id', ctx.companyId)
    .select(COLUMNS)
    .single();
  if (error) throw new InternalError(error);
  return data as unknown as Row;
}

/** A session that ran out can be opened again for the same unpaid invoice: a new link, the same order. */
async function reopen(
  ctx: SessionContext,
  row: Row,
  input: SessionInput,
  createdBy: string,
): Promise<Row> {
  if (!row.invoice_id) throw new ConflictError('Ask again in a moment.');
  const invoice = await getService('invoices').getForPayment(row.invoice_id);
  if (invoice.status === 'paid') throw new ConflictError('This order is already paid.');
  if (invoice.status === 'void')
    throw new ConflictError('This order was cancelled. Use a new order id.');
  if (row.payment_link_id)
    await getService('payments').revokeLink({
      companyId: ctx.companyId,
      linkId: row.payment_link_id,
    });
  return fill(ctx, row, input, createdBy);
}

export async function createSession(
  ctx: SessionContext,
  input: SessionInput,
  now: Date = new Date(),
): Promise<{ session: SessionAnswer; created: boolean }> {
  const createdBy = await requireLive(ctx);
  const { row, fresh } = await claim(ctx, input, now);
  if (fresh) {
    try {
      const filled = await fill(ctx, row, input, createdBy);
      await getService('audit').record({
        action: 'checkout.session_created',
        resourceType: 'checkout_session',
        resourceId: filled.id,
        companyId: ctx.companyId,
        metadata: { orderId: input.order_id, amount: input.amount, apiKeyId: ctx.keyId },
      });
      return { session: await answer(filled, now), created: true };
    } catch (error) {
      log.error('checkout session could not be completed', { error, orderId: input.order_id });
      // The claim stays "creating"; the next request after the wait takes it over and finishes it.
      throw error;
    }
  }
  const current = await refresh(row, now);
  if (!sameOrder(current, input))
    throw new ConflictError(
      'This order id already has a checkout session with other details. Use a new order id, or send the same details.',
    );
  if (current.status === 'paid') throw new ConflictError('This order is already paid.');
  if (current.status === 'cancelled')
    throw new ConflictError('This order was cancelled. Use a new order id.');
  // Another request is still making this order (not stale, or it would have been taken over): the store asks again.
  if (current.status === 'creating')
    throw new ConflictError('This order is being prepared. Ask again in a moment.');
  if (effectiveStatus(current.status, current.expires_at, now) === 'expired') {
    const reopened = await reopen(ctx, current, input, createdBy);
    return { session: await answer(reopened, now), created: false };
  }
  return { session: await answer(current, now), created: false };
}

export async function getSession(
  ctx: SessionContext,
  id: string,
  now: Date = new Date(),
): Promise<SessionAnswer> {
  return answer(await refresh(await byId(ctx.companyId, id), now), now);
}

/** The store cancelled the order: the link stops working and the unpaid invoice is voided. A paid order is refused. */
export async function cancelSession(
  ctx: SessionContext,
  id: string,
  now: Date = new Date(),
): Promise<SessionAnswer> {
  const row = await refresh(await byId(ctx.companyId, id), now);
  if (row.status === 'paid')
    throw new ConflictError('This order is already paid. Refund it instead.');
  if (row.status === 'cancelled') return answer(row, now);
  if (!ctx.createdBy) throw new ForbiddenError('This key has no owner. Make a new key.');
  if (row.payment_link_id)
    await getService('payments').revokeLink({
      companyId: ctx.companyId,
      linkId: row.payment_link_id,
    });
  if (row.invoice_id)
    await getService('invoices').voidForOrder({
      companyId: ctx.companyId,
      invoiceId: row.invoice_id,
      voidedBy: ctx.createdBy,
      reason: 'The order was cancelled in the store.',
    });
  const { data, error } = await getAdminSupabase()
    .from('checkout_sessions')
    .update({ status: 'cancelled' })
    .eq('id', row.id)
    .eq('company_id', ctx.companyId)
    .neq('status', 'paid')
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new ConflictError('This order is already paid. Refund it instead.');
  await getService('audit').record({
    action: 'checkout.session_cancelled',
    resourceType: 'checkout_session',
    resourceId: row.id,
    companyId: ctx.companyId,
    metadata: { orderId: row.external_ref, apiKeyId: ctx.keyId },
  });
  return answer(data as unknown as Row, now);
}

/** Used by the hosted page: where to send the buyer back to. Nothing about the session is exposed except the two addresses. */
export async function storeReturnForLink(
  companyId: string,
  paymentLinkId: string,
): Promise<{ sessionId: string; orderId: string; successUrl: string; cancelUrl: string } | null> {
  const { data, error } = await getAdminSupabase()
    .from('checkout_sessions')
    .select('id, external_ref, success_url, cancel_url')
    .eq('company_id', companyId)
    .eq('payment_link_id', paymentLinkId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) return null;
  return {
    sessionId: String(data.id),
    orderId: String(data.external_ref),
    successUrl: String(data.success_url),
    cancelUrl: String(data.cancel_url),
  };
}
