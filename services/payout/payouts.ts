// path: services/payout/payouts.ts
// Payout requests and their life: request (checks, the money leaves the available balance at once), approval, sending
// through the partner, paid, failed with retries and an automatic credit back, cancelled and reversed. Every money
// movement is a ledger posting with a key made from the payout, so a retry never moves money twice.
import 'server-only';
import { PAYOUT_STEP_UP_SECONDS } from '@/config/s14-payouts';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  IdempotencyConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import {
  approvalNeeded,
  canMove,
  checkAmount,
  creditBackLegs,
  localAmount,
  MAX_ATTEMPTS,
  paidLegs,
  payoutAmounts,
  periodStart,
  requestLegs,
  retryAt,
  reversedLegs,
  type PayoutAmounts,
  type PayoutStatus,
} from '@/lib/payment/payout';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { post } from '@/services/wallet/ledger';
import { getWallet } from '@/services/wallet/wallet-service';
import type { Actor } from '@/types/contracts';
import { getMethod } from './methods';
import { partnerFor } from './partners';
import { loadPayoutRules } from './settings';

const log = createLogger({ component: 'payouts' });

export interface PayoutView {
  id: string;
  methodId: string;
  partner: string;
  status: PayoutStatus;
  source: 'owner' | 'schedule';
  amount: string;
  fee: string;
  net: string;
  currency: string;
  fxRate: string | null;
  localAmount: string | null;
  note: string;
  reference: string | null;
  failureReason: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  createdAt: string;
  paidAt: string | null;
}

interface Row {
  id: string;
  company_id: string;
  wallet_id: string;
  method_id: string;
  partner: string;
  status: PayoutStatus;
  source: 'owner' | 'schedule';
  amount: string | number;
  fee: string | number;
  net: string | number;
  currency: string;
  fx_rate: string | number | null;
  local_amount: string | number | null;
  idempotency_key: string;
  approval_request_id: string | null;
  requested_by: string | null;
  note: string;
  reference: string | null;
  failure_reason: string | null;
  attempts: number;
  next_attempt_at: string | null;
  created_at: string;
  paid_at: string | null;
  version: number;
}

export const PAYOUT_COLUMNS =
  'id, company_id, wallet_id, method_id, partner, status, source, amount, fee, net, currency, fx_rate, local_amount, idempotency_key, approval_request_id, requested_by, note, reference, failure_reason, attempts, next_attempt_at, created_at, paid_at, version';

const m = (v: string | number | null | undefined): Money =>
  v === null || v === undefined ? Money.zero() : Money.parseRounded(String(v));

export function toPayoutView(r: Row): PayoutView {
  return {
    id: r.id,
    methodId: r.method_id,
    partner: r.partner,
    status: r.status,
    source: r.source,
    amount: m(r.amount).toDbString(),
    fee: m(r.fee).toDbString(),
    net: m(r.net).toDbString(),
    currency: r.currency,
    fxRate: r.fx_rate === null ? null : String(r.fx_rate),
    localAmount: r.local_amount === null ? null : m(r.local_amount).toDbString(),
    note: r.note,
    reference: r.reference,
    failureReason: r.failure_reason,
    attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  };
}

const amountsOf = (r: Row): PayoutAmounts => ({ amount: m(r.amount), fee: m(r.fee), net: m(r.net) });

const QUEUE_ROLES = ['super_admin', 'ceo', 'admin_staff'];
const queueOnly = (actor: Actor | null): void => {
  if (actor && !QUEUE_ROLES.includes(actor.role)) throw new ForbiddenError();
};

/* ---------------------------------------------------------------- reads */

async function rowById(payoutId: string, companyId: string | null): Promise<Row> {
  let q = getAdminSupabase().from('payouts').select(PAYOUT_COLUMNS).eq('id', payoutId).is('deleted_at', null);
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as unknown as Row;
}

export async function listPayouts(
  companyId: string,
  options: { status?: PayoutStatus; limit?: number } = {},
): Promise<PayoutView[]> {
  let q = getAdminSupabase()
    .from('payouts')
    .select(PAYOUT_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 50, 1), 200));
  if (options.status) q = q.eq('status', options.status);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map(toPayoutView);
}

/** The queue of the platform team: payouts in the given states across companies (oldest first). */
export async function listQueue(
  actor: Actor,
  statuses: readonly PayoutStatus[] = ['processing', 'approved', 'pending_approval'],
): Promise<(PayoutView & { companyId: string })[]> {
  queueOnly(actor);
  const { data, error } = await getAdminSupabase()
    .from('payouts')
    .select(PAYOUT_COLUMNS)
    .in('status', [...statuses])
    .is('deleted_at', null)
    .order('created_at')
    .limit(200);
  if (error) throw new InternalError(error);
  return ((data ?? []) as unknown as Row[]).map((r) => ({ ...toPayoutView(r), companyId: r.company_id }));
}

export async function getPayout(companyId: string, payoutId: string): Promise<PayoutView> {
  return toPayoutView(await rowById(payoutId, companyId));
}

export async function payoutHistory(
  companyId: string,
  payoutId: string,
): Promise<{ from: string | null; to: string; note: string; at: string }[]> {
  const { data, error } = await getAdminSupabase()
    .from('payout_events')
    .select('from_status, to_status, note, created_at')
    .eq('company_id', companyId)
    .eq('payout_id', payoutId)
    .order('created_at');
  if (error) throw new InternalError(error);
  return (data ?? []).map((e) => ({
    from: e.from_status ? String(e.from_status) : null,
    to: String(e.to_status),
    note: String(e.note),
    at: String(e.created_at),
  }));
}

/* ---------------------------------------------------------------- moves */

async function logMove(row: Row, from: PayoutStatus | null, to: PayoutStatus, actorId: string | null, note: string): Promise<void> {
  const { error } = await getAdminSupabase().from('payout_events').insert({
    company_id: row.company_id,
    payout_id: row.id,
    from_status: from,
    to_status: to,
    actor_id: actorId,
    note: note.slice(0, 300),
  });
  if (error) throw new InternalError(error);
}

/** Moves the payout to a new state if the move is allowed and nobody changed it meanwhile (version check). */
async function move(
  row: Row,
  to: PayoutStatus,
  actorId: string | null,
  note: string,
  patch: Record<string, unknown> = {},
): Promise<Row> {
  if (!canMove(row.status, to)) throw new ConflictError(`A payout that is ${row.status.replace('_', ' ')} cannot become ${to.replace('_', ' ')}.`);
  const { data, error } = await getAdminSupabase()
    .from('payouts')
    .update({ status: to, ...patch })
    .eq('id', row.id)
    .eq('version', row.version)
    .eq('status', row.status)
    .select(PAYOUT_COLUMNS)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new ConflictError('The payout was changed by someone else. Reload and try again.');
  await logMove(row, row.status, to, actorId, note);
  return data as unknown as Row;
}

async function announce(
  name: 'payout.requested' | 'payout.approved' | 'payout.paid' | 'payout.failed',
  row: Row,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await getService('events').publish({
      name,
      companyId: row.company_id,
      payload: { payoutId: row.id, amount: m(row.amount).toDbString(), net: m(row.net).toDbString(), methodId: row.method_id, ...extra },
    });
  } catch (error) {
    log.error('payout event not published', { name, payoutId: row.id, error: String(error) });
  }
}

async function tell(row: Row, type: string, title: string, body: string): Promise<void> {
  try {
    await getService('notification').notify({ companyId: row.company_id, type, title, body, href: '/wallet/payouts' });
  } catch (error) {
    log.error('payout notice not sent', { payoutId: row.id, error: String(error) });
  }
}

async function audit(action: string, row: Row, metadata: Record<string, unknown> = {}): Promise<void> {
  await getService('audit').record({ action, resourceType: 'payout', resourceId: row.id, companyId: row.company_id, metadata });
}

/* ---------------------------------------------------------------- request */

export interface RequestInput {
  methodId: string;
  amount: Money;
  idempotencyKey: string;
  note?: string;
}

interface CreateOptions {
  companyId: string;
  actor: Actor | null;
  source: 'owner' | 'schedule';
  input: RequestInput;
}

async function findByKey(companyId: string, key: string): Promise<Row | null> {
  const { data, error } = await getAdminSupabase()
    .from('payouts')
    .select(PAYOUT_COLUMNS)
    .eq('company_id', companyId)
    .eq('idempotency_key', key)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return (data as unknown as Row | null) ?? null;
}

async function spentInPeriod(companyId: string, since: Date): Promise<Money> {
  const { data, error } = await getAdminSupabase()
    .from('payouts')
    .select('amount')
    .eq('company_id', companyId)
    .gte('created_at', since.toISOString())
    .in('status', ['requested', 'pending_approval', 'approved', 'processing', 'paid'])
    .is('deleted_at', null)
    .limit(5000);
  if (error) throw new InternalError(error);
  return Money.sum((data ?? []).map((r) => m(r.amount)));
}

async function createPayout(options: CreateOptions): Promise<PayoutView> {
  const { companyId, actor, source, input } = options;
  if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128)
    throw new ValidationError('The request key must have 8 to 128 characters.');
  const prior = await findByKey(companyId, input.idempotencyKey);
  if (prior) {
    if (prior.method_id !== input.methodId || !m(prior.amount).eq(input.amount)) throw new IdempotencyConflictError();
    return toPayoutView(prior);
  }
  if (!(await getService('kyc').isVerified(companyId)))
    throw new ForbiddenError('Verify your business before you take money out of the wallet.');
  const rules = await loadPayoutRules(companyId);
  const problem = checkAmount(input.amount, rules);
  if (problem) throw new ValidationError(problem);
  const method = await getMethod(companyId, input.methodId);
  if (method.status !== 'active') throw new ValidationError('This payout method is switched off.');
  const wallet = await getWallet(companyId);
  if (!wallet) throw new ValidationError('The company has no wallet yet.');
  if (wallet.status !== 'active') throw new ForbiddenError('The wallet is not active.');

  const amounts = payoutAmounts(input.amount, rules);
  const now = new Date();
  let fx: { rate: string; local: Money } | null = null;
  if (method.currency !== 'USD') {
    // The rate is frozen now, at the request; the partner pays this local amount whatever the rate does later.
    const rate = await getService('fx').rateAt(method.currency, now);
    fx = { rate, local: localAmount(amounts.net, rate, rules.fxFeePercent) };
  }
  const partner = await partnerFor(method.partner);

  const inserted = await getAdminSupabase()
    .from('payouts')
    .insert({
      company_id: companyId,
      wallet_id: wallet.id,
      method_id: method.id,
      partner: partner.id,
      source,
      amount: amounts.amount.toDbString(),
      fee: amounts.fee.toDbString(),
      net: amounts.net.toDbString(),
      currency: method.currency,
      fx_rate: fx?.rate ?? null,
      local_amount: fx?.local.toDbString() ?? null,
      idempotency_key: input.idempotencyKey,
      requested_by: actor?.userId ?? null,
      note: (input.note ?? '').slice(0, 300),
    })
    .select(PAYOUT_COLUMNS)
    .single();
  if (inserted.error) {
    if (inserted.error.code === '23505') {
      const first = await findByKey(companyId, input.idempotencyKey);
      if (first && first.method_id === input.methodId && m(first.amount).eq(input.amount)) return toPayoutView(first);
      throw new IdempotencyConflictError();
    }
    throw new InternalError(inserted.error);
  }
  let row = inserted.data as unknown as Row;
  await logMove(row, null, 'requested', actor?.userId ?? null, 'Payout requested');

  // The period limit counts this request too, so two requests at once cannot both pass it.
  const spent = await spentInPeriod(companyId, periodStart(now, rules.periodUnit));
  if (spent.gt(rules.periodLimit)) {
    await move(row, 'cancelled', actor?.userId ?? null, 'Over the payout limit', { failure_reason: 'Over the payout limit' });
    throw new ValidationError(`The payout limit of ${Money.parse(rules.periodLimit).toDbString()} USD per ${rules.periodUnit} would be passed.`);
  }

  // The money leaves the available balance now: two requests at once cannot spend the same money.
  try {
    await post({
      companyId,
      key: `payout:${row.id}:request`,
      reason: 'Payout requested',
      referenceType: 'payout',
      referenceId: row.id,
      legs: requestLegs(wallet.id, amounts),
      actorId: actor?.userId ?? null,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      await move(row, 'cancelled', actor?.userId ?? null, 'Not enough funds', { failure_reason: 'Not enough funds in the wallet' });
      throw new ValidationError('There is not enough available balance for this payout.');
    }
    throw error;
  }
  await audit('payout.requested', row, { amount: amounts.amount.toDbString(), fee: amounts.fee.toDbString(), source });
  await announce('payout.requested', row);

  const need = actor ? approvalNeeded(actor.role, amounts.amount, rules.largeThreshold) : null;
  if (actor && need) {
    const state = await getService('approval').request({
      action: need,
      payload: { payoutId: row.id, amount: amounts.amount.toDbString() },
      requesterId: actor.userId,
      companyId,
    });
    row = await move(row, 'pending_approval', actor.userId, `Waiting for ${need === 'payout.large' ? 'the CEO' : 'the owner'}`, {
      approval_request_id: state.requestId,
    });
    return toPayoutView(row);
  }
  row = await move(row, 'approved', actor?.userId ?? null, 'No approval needed', { approved_at: now.toISOString() });
  await announce('payout.approved', row);
  return toPayoutView(row);
}

/** An owner or staff member asks for a payout. Needs a fresh sign-in confirmation. */
export async function requestPayout(actor: Actor, input: RequestInput): Promise<PayoutView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ForbiddenError();
  if (!(await getService('permissions').can(actor, 'payout.request', { type: 'payout', id: null }))) throw new ForbiddenError();
  await getService('auth').requireStepUp(actor, { maxAgeSeconds: PAYOUT_STEP_UP_SECONDS });
  return createPayout({ companyId, actor, source: 'owner', input });
}

/** The schedule asks for a payout for a company (no person involved, never above the large threshold). */
export async function requestScheduledPayout(companyId: string, input: RequestInput): Promise<PayoutView> {
  return createPayout({ companyId, actor: null, source: 'schedule', input });
}

/* ---------------------------------------------------------------- approval */

async function postBack(row: Row, suffix: string, note: string): Promise<void> {
  await post({
    companyId: row.company_id,
    key: `payout:${row.id}:${suffix}`,
    reason: note,
    referenceType: 'payout',
    referenceId: row.id,
    legs: creditBackLegs(row.wallet_id, amountsOf(row)),
    actorId: null,
  });
}

/** Gives the money back to the available balance and ends the payout in `to`. Safe to run again. */
async function creditBackAndEnd(row: Row, to: 'cancelled' | 'failed', actorId: string | null, note: string): Promise<Row> {
  await postBack(row, 'back', 'Payout credited back');
  return move(row, to, actorId, note, {
    failure_reason: note.slice(0, 300),
    ...(to === 'failed' ? { failed_at: new Date().toISOString() } : {}),
  });
}

export async function decidePayout(
  actor: Actor,
  payoutId: string,
  decision: 'approve' | 'reject',
  reason: string | null,
): Promise<PayoutView> {
  const row = await rowById(payoutId, actor.companyId);
  if (row.status !== 'pending_approval' || !row.approval_request_id)
    throw new ValidationError('This payout is not waiting for approval.');
  const state = await getService('approval').decide(row.approval_request_id, {
    approverId: actor.userId,
    decision,
    reason,
  });
  if (state.status === 'approved') {
    const next = await move(row, 'approved', actor.userId, 'Approved', { approved_at: new Date().toISOString() });
    await audit('payout.approved', next, { by: actor.userId });
    await announce('payout.approved', next);
    return toPayoutView(next);
  }
  if (state.status === 'rejected' || state.status === 'cancelled' || state.status === 'expired') {
    const next = await creditBackAndEnd(row, 'cancelled', actor.userId, 'The payout was not approved');
    await audit('payout.rejected', next, { by: actor.userId });
    await tell(next, 'payout.rejected', 'A payout was not approved', 'The money is back in your available balance.');
    return toPayoutView(next);
  }
  return toPayoutView(row);
}

/** The owner (or the person who asked) cancels a payout that has not been sent yet; the money comes back. */
export async function cancelPayout(actor: Actor, payoutId: string): Promise<PayoutView> {
  const row = await rowById(payoutId, actor.companyId);
  if (!actor.companyId) throw new ForbiddenError();
  const owner = actor.role === 'owner' || row.requested_by === actor.userId;
  if (!owner) throw new ForbiddenError();
  if (!['requested', 'pending_approval', 'approved'].includes(row.status))
    throw new ValidationError('This payout can no longer be cancelled.');
  const next = await creditBackAndEnd(row, 'cancelled', actor.userId, 'Cancelled by the requester');
  await audit('payout.cancelled', next, { by: actor.userId });
  return toPayoutView(next);
}

/* ---------------------------------------------------------------- sending */

/** Sends the payouts that are approved and due to their partner. Run by the hourly job. Returns how many were taken. */
export async function processDue(now: Date = new Date()): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('payouts')
    .select(PAYOUT_COLUMNS)
    .eq('status', 'approved')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}`)
    .is('deleted_at', null)
    .order('created_at')
    .limit(100);
  if (error) throw new InternalError(error);
  let taken = 0;
  for (const raw of (data ?? []) as unknown as Row[]) {
    try {
      if (await submitOne(raw, now)) taken += 1;
    } catch (thrown) {
      log.error('payout not sent', { payoutId: raw.id, error: String(thrown) });
    }
  }
  return taken;
}

async function submitOne(raw: Row, now: Date): Promise<boolean> {
  let row: Row;
  try {
    row = await move(raw, 'processing', null, `Attempt ${raw.attempts + 1}`, {
      attempts: raw.attempts + 1,
      processing_at: now.toISOString(),
      next_attempt_at: null,
    });
  } catch (thrown) {
    if (thrown instanceof ConflictError) return false; // another run took it
    throw thrown;
  }
  const partner = await partnerFor(row.partner);
  let answer;
  try {
    answer = await partner.submit({
      payoutId: row.id,
      net: m(row.net).toDbString(),
      currency: row.currency,
      localAmount: row.local_amount === null ? null : m(row.local_amount).toDbString(),
      methodId: row.method_id,
      attempt: row.attempts,
    });
  } catch {
    answer = { kind: 'rejected' as const, reason: 'The partner could not be reached.' };
  }
  if (answer.kind === 'rejected') {
    await failRow(row, null, answer.reason, false, now);
    return true;
  }
  if (answer.reference) await getAdminSupabase().from('payouts').update({ reference: answer.reference.slice(0, 120) }).eq('id', row.id);
  if (answer.completed) await completeRow(await rowById(row.id, null), null, answer.reference ?? 'partner', now);
  return true;
}

async function completeRow(row: Row, actorId: string | null, reference: string, now: Date): Promise<Row> {
  await post({
    companyId: row.company_id,
    key: `payout:${row.id}:paid`,
    reason: 'Payout sent',
    referenceType: 'payout',
    referenceId: row.id,
    legs: paidLegs(amountsOf(row)),
    actorId,
  });
  const next = await move(row, 'paid', actorId, 'Paid', { reference: reference.slice(0, 120), paid_at: now.toISOString() });
  await audit('payout.paid', next, { reference });
  await announce('payout.paid', next, { reference });
  await tell(next, 'payout.paid', 'Your payout was sent', `${m(next.net).toDbString()} USD was sent to your payout method.`);
  return next;
}

async function failRow(row: Row, actorId: string | null, reason: string, final: boolean, now: Date): Promise<Row> {
  const clean = reason.trim().slice(0, 300);
  const when = final ? null : retryAt(row.attempts, now);
  if (when && row.attempts < MAX_ATTEMPTS) {
    const next = await move(row, 'approved', actorId, `Failed: ${clean}. Trying again.`, {
      next_attempt_at: when.toISOString(),
      failure_reason: clean,
    });
    await audit('payout.attempt_failed', next, { reason: clean, nextAttemptAt: when.toISOString() });
    return next;
  }
  const next = await creditBackAndEnd(row, 'failed', actorId, clean || 'The payout failed');
  await audit('payout.failed', next, { reason: clean });
  await announce('payout.failed', next, { reason: clean });
  await tell(next, 'payout.failed', 'A payout failed', 'The money is back in your available balance.');
  return next;
}

/* ---------------------------------------------------------------- the queue (platform team) */

/** The platform team confirms that a payout in `processing` was sent (manual partner). */
export async function markPaid(actor: Actor, payoutId: string, reference: string): Promise<PayoutView> {
  queueOnly(actor);
  const clean = reference.trim();
  if (!/^[A-Za-z0-9 ._:/-]{3,120}$/.test(clean)) throw new ValidationError('Enter the bank reference (3 to 120 letters, digits or . _ : / -).');
  const row = await rowById(payoutId, null);
  if (row.status !== 'processing') throw new ValidationError('Only a payout that is being processed can be marked as paid.');
  return toPayoutView(await completeRow(row, actor.userId, clean, new Date()));
}

/** The platform team reports that a payout in `processing` did not go through. `final` stops the retries. */
export async function markFailed(actor: Actor, payoutId: string, reason: string, final: boolean): Promise<PayoutView> {
  queueOnly(actor);
  if (reason.trim().length < 3) throw new ValidationError('Give a reason of at least 3 letters.');
  const row = await rowById(payoutId, null);
  if (row.status !== 'processing') throw new ValidationError('Only a payout that is being processed can be marked as failed.');
  return toPayoutView(await failRow(row, actor.userId, reason, final, new Date()));
}

/** Money sent came back (the bank returned it): the amount goes back to the wallet. Super admin only. */
export async function reversePayout(actor: Actor, payoutId: string, reason: string): Promise<PayoutView> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  if (reason.trim().length < 3) throw new ValidationError('Give a reason of at least 3 letters.');
  const row = await rowById(payoutId, null);
  if (row.status !== 'paid') throw new ValidationError('Only a payout that was paid can be reversed.');
  await post({
    companyId: row.company_id,
    key: `payout:${row.id}:reversed`,
    reason: 'Payout reversed',
    referenceType: 'payout',
    referenceId: row.id,
    legs: reversedLegs(row.wallet_id, amountsOf(row)),
    actorId: actor.userId,
  });
  const next = await move(row, 'reversed', actor.userId, reason, { failure_reason: reason.trim().slice(0, 300) });
  await audit('payout.reversed', next, { reason: reason.trim() });
  await tell(next, 'payout.reversed', 'A payout came back', 'The money is back in your available balance.');
  return toPayoutView(next);
}
