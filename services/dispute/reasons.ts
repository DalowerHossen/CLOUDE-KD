// path: services/dispute/reasons.ts
// Reason codes. Every processor has its own list, so each adapter can register a mapper for its own codes (the hook);
// until it does, the code text is sorted by plain keywords. A code that matches nothing is "general".
export const REASON_CATEGORIES = [
  'fraud',
  'product_not_received',
  'not_as_described',
  'duplicate',
  'subscription_canceled',
  'credit_not_processed',
  'general',
] as const;
export type ReasonCategory = (typeof REASON_CATEGORIES)[number];

export type ReasonMapper = (code: string) => ReasonCategory | null;

const KEY = Symbol.for('kd.solution.it.dispute.reason-mappers');
function mappers(): Map<string, ReasonMapper> {
  const holder = globalThis as unknown as Record<symbol, Map<string, ReasonMapper> | undefined>;
  const existing = holder[KEY];
  if (existing) return existing;
  const created = new Map<string, ReasonMapper>();
  holder[KEY] = created;
  return created;
}

/** An adapter (or any STEP) registers how the codes of one processor are sorted. */
export function registerReasonMapper(processorId: string, mapper: ReasonMapper): void {
  mappers().set(processorId, mapper);
}

function byKeyword(code: string): ReasonCategory {
  const text = code.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (/fraud|unauthori|unrecogni|stolen/.test(text)) return 'fraud';
  if (/not_received|no_delivery|not_delivered|never_received/.test(text))
    return 'product_not_received';
  if (/not_as_described|unacceptable|defective|not_as_desc|quality/.test(text))
    return 'not_as_described';
  if (/duplicate/.test(text)) return 'duplicate';
  if (/(subscription|recurring).*cancel|cancel.*(subscription|recurring)/.test(text))
    return 'subscription_canceled';
  if (/credit_not|refund_not|credit_pending/.test(text)) return 'credit_not_processed';
  return 'general';
}

export function categorize(processorId: string, code: string | null): ReasonCategory {
  if (!code || code.trim() === '') return 'general';
  const own = mappers().get(processorId)?.(code);
  return own ?? byKeyword(code);
}

/** What kind of proof helps most for a category (shown to the owner while gathering evidence). */
export const EVIDENCE_HINTS: Readonly<Record<ReasonCategory, string>> = {
  fraud:
    'Show that the payer agreed: consent record, network address and device, 3D Secure result, earlier paid invoices.',
  product_not_received:
    'Show delivery or completion: delivery proof, the client opening the document, messages after the work.',
  not_as_described:
    'Show what was agreed: the signed estimate or contract, the invoice lines, the client confirming the work.',
  duplicate: 'Show that the two charges are for different invoices, with both receipts.',
  subscription_canceled:
    'Show the terms the client accepted and the dates of use after any cancellation request.',
  credit_not_processed:
    'Show the refund policy the client accepted and whether a refund was or was not owed.',
  general:
    'Send the evidence pack: invoice, consent, delivery proof, timeline and the audit chain.',
};
