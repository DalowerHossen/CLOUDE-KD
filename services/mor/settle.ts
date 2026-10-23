// path: services/mor/settle.ts
// From a captured payment to money in the wallet. The fee is taken, the rest is held for the hold period (a part of it
// longer, as reserve), and one settlement item records everything the owner sees. Every posting has a key made from
// the payment, so running this again for the same payment changes nothing.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError } from '@/lib/errors';
import { feeBreakdown } from '@/lib/payment/fee-calculator';
import {
  addDays,
  chargebackLegs,
  holdPlan,
  refundLegs,
  refundTakeBack,
  reserveLegs,
  scoreRisk,
  settlementLegs,
  splitReserve,
  type MorMode,
  type RiskResult,
} from '@/lib/payment/mor-engine';
import { createLogger } from '@/lib/logger';
import { Money } from '@/lib/utils/currency';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getFeeSchedule } from '@/services/wallet/fees';
import { post } from '@/services/wallet/ledger';
import { ensureWallet } from '@/services/wallet/wallet-service';
import { getMode } from './mode';
import { suspendCompany } from './settings';

const log = createLogger({ component: 'mor-settle' });
const DAY = 86_400_000;

export interface ItemView {
  id: string;
  paymentId: string;
  invoiceId: string | null;
  status: 'pending' | 'held' | 'released' | 'direct' | 'reversed' | 'charged_back';
  mode: MorMode;
  gross: string;
  fee: string;
  tax: string;
  net: string;
  reserve: string;
  refunded: string;
  holdReason: string;
  releaseAt: string | null;
  releasedAt: string | null;
  createdAt: string;
}

export const ITEM_COLUMNS =
  'id, payment_id, invoice_id, wallet_id, hold_id, reserve_hold_id, status, mode, processor_id, gross, fee, tax, net, reserve, refunded, fee_returned, charged_back, risk_score, hold_reason, release_at, released_at, created_at, version';

export interface ItemRow {
  id: string;
  payment_id: string;
  invoice_id: string | null;
  wallet_id: string | null;
  hold_id: string | null;
  reserve_hold_id: string | null;
  status: ItemView['status'];
  mode: MorMode;
  processor_id: string | null;
  gross: string | number;
  fee: string | number;
  tax: string | number;
  net: string | number;
  reserve: string | number;
  refunded: string | number;
  fee_returned: string | number;
  charged_back: string | number;
  risk_score: number;
  hold_reason: string;
  release_at: string | null;
  released_at: string | null;
  created_at: string;
  version: number;
}

const m = (v: string | number | null | undefined): Money =>
  v === null || v === undefined ? Money.zero() : Money.parseRounded(String(v));

export function toItemView(r: ItemRow): ItemView {
  return {
    id: r.id,
    paymentId: r.payment_id,
    invoiceId: r.invoice_id,
    status: r.status,
    mode: r.mode,
    gross: m(r.gross).toDbString(),
    fee: m(r.fee).toDbString(),
    tax: m(r.tax).toDbString(),
    net: m(r.net).toDbString(),
    reserve: m(r.reserve).toDbString(),
    refunded: m(r.refunded).toDbString(),
    holdReason: r.hold_reason,
    releaseAt: r.release_at,
    releasedAt: r.released_at,
    createdAt: r.created_at,
  };
}

interface PaymentRow {
  id: string;
  company_id: string;
  invoice_id: string | null;
  processor_id: string | null;
  status: string;
  captured_amount: string | number;
  captured_at: string | null;
}

async function loadPayment(paymentId: string): Promise<PaymentRow> {
  const { data, error } = await getAdminSupabase()
    .from('payments')
    .select('id, company_id, invoice_id, processor_id, status, captured_amount, captured_at')
    .eq('id', paymentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return data as PaymentRow;
}

export async function itemForPayment(paymentId: string): Promise<ItemRow | null> {
  const { data, error } = await getAdminSupabase()
    .from('settlement_items')
    .select(ITEM_COLUMNS)
    .eq('payment_id', paymentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return (data as ItemRow | null) ?? null;
}

async function riskFacts(
  companyId: string,
  amount: Money,
  now: Date,
): Promise<{ result: RiskResult; ageDays: number }> {
  const admin = getAdminSupabase();
  const since24 = new Date(now.getTime() - DAY).toISOString();
  const since90 = new Date(now.getTime() - 90 * DAY).toISOString();
  const [company, recent, disputes, refunds] = await Promise.all([
    admin.from('companies').select('created_at').eq('id', companyId).maybeSingle(),
    admin
      .from('payments')
      .select('captured_amount')
      .eq('company_id', companyId)
      .gt('captured_amount', 0)
      .gte('captured_at', since24)
      .is('deleted_at', null)
      .limit(5000),
    admin
      .from('disputes')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('opened_at', since90)
      .is('deleted_at', null),
    admin
      .from('settlement_items')
      .select('gross, refunded')
      .eq('company_id', companyId)
      .gte('created_at', since90)
      .is('deleted_at', null)
      .limit(5000),
  ]);
  if (company.error) throw new InternalError(company.error);
  if (recent.error) throw new InternalError(recent.error);
  if (disputes.error) throw new InternalError(disputes.error);
  if (refunds.error) throw new InternalError(refunds.error);
  const created = company.data?.created_at
    ? Date.parse(String(company.data.created_at))
    : now.getTime();
  const ageDays = toInt((now.getTime() - created) / DAY, 0);
  const rows = recent.data ?? [];
  const amount24h = Money.sum(rows.map((r) => m(r.captured_amount)));
  const grossSum = Money.sum((refunds.data ?? []).map((r) => m(r.gross)));
  const refundSum = Money.sum((refunds.data ?? []).map((r) => m(r.refunded)));
  const refundPercent = grossSum.isPositive()
    ? toInt(refundSum.mul('100').div(grossSum.toDbString()).toDbString(), 0)
    : 0;
  const { rules } = await getMode(companyId);
  const result = scoreRisk(rules, {
    amount,
    count24h: rows.length,
    amount24h,
    disputes90d: disputes.count ?? 0,
    refundPercent90d: refundPercent,
    merchantAgeDays: ageDays,
  });
  return { result, ageDays };
}

async function upsertItem(
  paymentId: string,
  companyId: string,
  values: Record<string, unknown>,
): Promise<ItemRow> {
  const admin = getAdminSupabase();
  const existing = await itemForPayment(paymentId);
  const written = existing
    ? await admin
        .from('settlement_items')
        .update(values)
        .eq('id', existing.id)
        .select(ITEM_COLUMNS)
        .single()
    : await admin
        .from('settlement_items')
        .insert({ company_id: companyId, payment_id: paymentId, ...values })
        .select(ITEM_COLUMNS)
        .single();
  if (written.error) {
    // Two workers made the item at once: take the one that won.
    if (written.error.code === '23505') {
      const won = await itemForPayment(paymentId);
      if (won) return won;
    }
    throw new InternalError(written.error);
  }
  return written.data as ItemRow;
}

/**
 * Settles one captured payment. Returns the settlement item. Safe to run again for the same payment: a payment that
 * is already settled is returned as it is, and a payment that waited (suspended) is settled when the mode allows.
 */
export async function settlePayment(
  paymentId: string,
  now: Date = new Date(),
): Promise<ItemRow | null> {
  const payment = await loadPayment(paymentId);
  const gross = m(payment.captured_amount);
  if (!gross.isPositive()) return null;
  const done = await itemForPayment(paymentId);
  if (done && done.status !== 'pending') return done;

  const companyId = payment.company_id;
  const mode = await getMode(companyId);
  const { schedule } = await getFeeSchedule(companyId);
  const fees = feeBreakdown(gross, schedule, payment.processor_id);
  const base = {
    invoice_id: payment.invoice_id,
    processor_id: payment.processor_id,
    gross: gross.toDbString(),
    fee: fees.platformFee.toDbString(),
    tax: fees.tax.toDbString(),
    net: fees.net.toDbString(),
  };

  if (mode.mode === 'direct') {
    return upsertItem(paymentId, companyId, {
      ...base,
      mode: 'direct',
      status: 'direct',
      hold_reason: mode.message.slice(0, 300),
    });
  }
  if (mode.mode === 'suspended') {
    return upsertItem(paymentId, companyId, {
      ...base,
      mode: 'suspended',
      status: 'pending',
      hold_reason: mode.message.slice(0, 300),
    });
  }

  const wallet = await ensureWallet(companyId);
  const captured = payment.captured_at ? new Date(payment.captured_at) : now;
  const { result: risk, ageDays } = await riskFacts(companyId, gross, now);
  const plan = holdPlan(mode.rules, { merchantAgeDays: ageDays, riskLevel: risk.level });
  const { main, reserve } = splitReserve(fees.net, mode.rules.reservePercent);
  const releaseAt = addDays(captured > now ? now : captured, plan.days);
  const reserveAt = addDays(releaseAt, mode.rules.reserveDays);
  const instant = plan.days === 0;
  const text = (
    reserve.isPositive()
      ? `${plan.text} ${reserve.toDbString()} USD is kept as reserve for ${mode.rules.reserveDays} more days.`
      : plan.text
  ).slice(0, 300);

  let holdId: string | null = null;
  let reserveHoldId: string | null = null;
  const totalFees = fees.totalFees;
  if (main.isPositive() || totalFees.isPositive()) {
    const legs = settlementLegs({ walletId: wallet.id, main, fees: totalFees, instant });
    const posted = await post({
      companyId,
      key: `settle:${paymentId}`,
      reason: 'Online payment settled',
      referenceType: 'payment',
      referenceId: paymentId,
      legs,
      actorId: null,
      ...(main.isPositive() && !instant
        ? {
            hold: {
              walletId: wallet.id,
              amount: main,
              reason: plan.text,
              source: 'settlement' as const,
              releaseAt,
            },
          }
        : {}),
    });
    holdId = posted.holdId;
  }
  if (reserve.isPositive()) {
    const posted = await post({
      companyId,
      key: `settle:${paymentId}:reserve`,
      reason: 'Reserve held for a payment',
      referenceType: 'payment',
      referenceId: paymentId,
      legs: reserveLegs(wallet.id, reserve),
      actorId: null,
      hold: {
        walletId: wallet.id,
        amount: reserve,
        reason: `Reserve for ${mode.rules.reserveDays} days after the hold.`,
        source: 'settlement',
        releaseAt: reserveAt,
      },
    });
    reserveHoldId = posted.holdId;
  }
  // `main` already left out the reserve, so the company received main + reserve in total.
  const item = await upsertItem(paymentId, companyId, {
    ...base,
    mode: 'mor',
    wallet_id: wallet.id,
    hold_id: holdId,
    reserve_hold_id: reserveHoldId,
    status: instant && !reserve.isPositive() ? 'released' : 'held',
    reserve: reserve.toDbString(),
    risk_score: risk.score,
    hold_reason: text,
    release_at: (reserve.isPositive() ? reserveAt : releaseAt).toISOString(),
    released_at: instant && !reserve.isPositive() ? now.toISOString() : null,
  });
  await getService('audit').record({
    action: 'mor.payment_settled',
    resourceType: 'payment',
    resourceId: paymentId,
    companyId,
    metadata: {
      net: fees.net.toDbString(),
      fee: totalFees.toDbString(),
      holdDays: plan.days,
      risk: risk.level,
    },
  });
  if (risk.level === 'high') await handleHighRisk(companyId, risk, mode.rules.autoSuspend);
  return item;
}

async function handleHighRisk(
  companyId: string,
  risk: RiskResult,
  autoSuspend: boolean,
): Promise<void> {
  log.warn('high risk payment', { companyId, score: risk.score });
  if (!autoSuspend) return;
  // A fraud alert pauses new settlement only; money already held stays where it is.
  await suspendCompany(null, companyId, `Automatic risk check: ${risk.reasons.join(', ')}`);
  await getService('notification').notify({
    companyId,
    type: 'mor.suspended',
    title: 'Wallet settlement is paused',
    body: 'An automatic risk check paused settlement of new payments. The platform team will review the account.',
    href: '/wallet',
  });
}

/**
 * Takes a refund back out of the wallet. The platform returns its fee in the same share. A refund may take the
 * available balance below zero: later payments pay that back first. Safe to run again with the same refund id.
 */
export async function reverseForRefund(
  paymentId: string,
  refundId: string,
  refundAmount: Money,
): Promise<ItemRow | null> {
  let item = await itemForPayment(paymentId);
  if (!item || item.status === 'pending') item = await settlePayment(paymentId);
  if (!item) return null;
  if (!refundAmount.isPositive()) return item;
  const payment = await loadPayment(paymentId);
  const gross = m(item.gross);
  const before = m(item.refunded);
  const left = gross.sub(before);
  const refund = refundAmount.gt(left) ? left : refundAmount;
  if (!refund.isPositive()) return item;
  const { companyDebit, feeBack } = refundTakeBack({
    gross,
    fee: m(item.fee).add(m(item.tax)),
    refundedBefore: before,
    feeReturnedBefore: m(item.fee_returned),
    refund,
  });
  if (item.mode === 'mor' && item.wallet_id) {
    const legs = refundLegs({ walletId: item.wallet_id, refund, companyDebit, feeBack });
    await post({
      companyId: payment.company_id,
      key: `refund:${refundId}`,
      reason: 'Refund taken back',
      referenceType: 'payment',
      referenceId: paymentId,
      legs,
      actorId: null,
    });
  }
  const total = before.add(refund);
  const updated = await upsertItem(paymentId, payment.company_id, {
    refunded: total.toDbString(),
    fee_returned: m(item.fee_returned).add(feeBack).toDbString(),
    status: total.gte(gross) ? 'reversed' : item.status,
  });
  await getService('audit').record({
    action: 'mor.refund_reversed',
    resourceType: 'payment',
    resourceId: paymentId,
    companyId: payment.company_id,
    metadata: {
      refundId,
      refund: refund.toDbString(),
      takenFromCompany: companyDebit.toDbString(),
    },
  });
  return updated;
}

/** A lost dispute takes the disputed amount (not the fee) out of the wallet; the balance may go below zero. */
export async function chargeBack(
  paymentId: string,
  disputeId: string,
  amount: Money,
): Promise<ItemRow | null> {
  let item = await itemForPayment(paymentId);
  if (!item || item.status === 'pending') item = await settlePayment(paymentId);
  if (!item) return null;
  const payment = await loadPayment(paymentId);
  const gross = m(item.gross);
  const room = gross.sub(m(item.refunded)).sub(m(item.charged_back));
  const taken = amount.gt(room) ? room : amount;
  if (!taken.isPositive()) return item;
  if (item.mode === 'mor' && item.wallet_id) {
    await post({
      companyId: payment.company_id,
      key: `chargeback:${disputeId}`,
      reason: 'Chargeback',
      referenceType: 'payment',
      referenceId: paymentId,
      legs: chargebackLegs(item.wallet_id, taken),
      actorId: null,
    });
  }
  return upsertItem(paymentId, payment.company_id, {
    charged_back: m(item.charged_back).add(taken).toDbString(),
    status: m(item.charged_back)
      .add(taken)
      .gte(gross.sub(m(item.refunded)))
      ? 'charged_back'
      : item.status,
  });
}

/** Settles payments that waited because the company could not be settled; run when a company becomes eligible. */
export async function settlePending(companyId: string): Promise<number> {
  const { data, error } = await getAdminSupabase()
    .from('settlement_items')
    .select('payment_id')
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('created_at')
    .limit(200);
  if (error) throw new InternalError(error);
  let done = 0;
  for (const row of data ?? []) {
    const item = await settlePayment(String(row.payment_id));
    if (item && item.status !== 'pending') done += 1;
  }
  return done;
}
