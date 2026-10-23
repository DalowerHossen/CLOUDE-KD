// path: lib/payment/adapters/custom/mapping.ts
// Mapping of a configured gateway's lookup and refund answers to the platform's transaction shape
// (docs/processors/custom.md sections 5 and 8).
import { buildTransaction, fromMinorUnits } from '@/lib/payment/adapters/base';
import { Money } from '@/lib/utils/currency';
import type { DeclineCategory, ProcessorTransaction } from '@/types/contracts';
import type { AdapterContext } from '@/types/contracts';
import { config, pathSetting, setting, textAt, words, type CustomConfig, type Json } from './api';

export function mapCustomDecline(_raw: {
  code: string | null;
  message: string | null;
}): DeclineCategory {
  return 'other';
}

/** Money from the text of a gateway amount in the configured format; null when it is not that. */
export function moneyFromText(cfg: CustomConfig, text: string | null): Money | null {
  if (text === null) return null;
  if (cfg.amountFormat === 'minor_number')
    return /^\d{1,15}$/.test(text) ? fromMinorUnits(text) : null;
  return /^\d{1,12}(\.\d{1,4})?$/.test(text) ? Money.parse(text) : null;
}

export interface LookupView {
  id: string | null;
  status: string;
  amount: Money | null;
  currency: string | null;
  reference: string | null;
  code: string | null;
}

/** Reads the lookup answer through the configured paths. */
export function readLookup(ctx: AdapterContext, body: Json | null): LookupView {
  const cfg = config(ctx);
  const amountPath = pathSetting(ctx, 'lookupAmountPath', 'amount');
  const currencyPath = setting(ctx, 'lookupCurrencyPath', 'currency');
  return {
    id: textAt(body, pathSetting(ctx, 'lookupIdPath', 'id')),
    status: (textAt(body, pathSetting(ctx, 'lookupStatusPath', 'status')) ?? '').toLowerCase(),
    amount: moneyFromText(cfg, textAt(body, amountPath)),
    currency:
      currencyPath === 'none'
        ? 'USD'
        : textAt(body, pathSetting(ctx, 'lookupCurrencyPath', 'currency')),
    reference: textAt(body, pathSetting(ctx, 'lookupReferencePath', 'reference')),
    code:
      setting(ctx, 'lookupCodePath') === ''
        ? null
        : textAt(body, pathSetting(ctx, 'lookupCodePath', 'error_code')),
  };
}

/** Builds the transaction from a lookup view and the configured status words. */
export function fromLookup(
  ctx: AdapterContext,
  view: LookupView,
  fallbackAmount: Money | null,
): ProcessorTransaction {
  const common = {
    amount: view.amount ?? fallbackAmount ?? Money.zero(),
    processorTransactionId: view.id,
    rawCode: view.code ?? (view.status === '' ? null : view.status),
  };
  if (words(ctx, 'statusRefunded', 'refunded').has(view.status))
    return buildTransaction({ status: 'refunded', ...common });
  if (words(ctx, 'statusPaid', 'paid,succeeded').has(view.status))
    return buildTransaction({ status: 'captured', ...common });
  if (words(ctx, 'statusVoided', 'canceled,voided').has(view.status))
    return buildTransaction({ status: 'voided', ...common });
  if (words(ctx, 'statusPending', 'pending,processing').has(view.status))
    return buildTransaction({ status: 'pending', ...common });
  return buildTransaction({
    status: 'declined',
    ...common,
    declineCategory: mapCustomDecline({ code: view.code, message: null }),
    message: 'The payment was not completed.',
  });
}

/** A refund answer as a transaction. */
export function fromRefundAnswer(
  ctx: AdapterContext,
  body: Json | null,
  requested: Money,
  paymentId: string,
): ProcessorTransaction {
  const state = (textAt(body, pathSetting(ctx, 'refundStatusPath', 'status')) ?? '').toLowerCase();
  const base = { amount: requested, processorTransactionId: paymentId, rawCode: state || null };
  if (words(ctx, 'refundDone', 'refunded,succeeded,completed').has(state))
    return buildTransaction({ status: 'refunded', ...base });
  if (words(ctx, 'refundPending', 'pending,processing').has(state))
    return buildTransaction({ status: 'pending', ...base });
  return buildTransaction({
    status: 'declined',
    ...base,
    declineCategory: 'other',
    message: 'The gateway did not complete this refund.',
  });
}

export function failure(amount: Money, code: string): ProcessorTransaction {
  return buildTransaction({
    status: 'declined',
    amount,
    declineCategory: 'other',
    rawCode: code,
    message: 'The gateway could not process this request.',
  });
}
