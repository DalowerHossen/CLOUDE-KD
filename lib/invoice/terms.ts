// path: lib/invoice/terms.ts
// Payment terms and due dates. Dates are YYYY-MM-DD text; arithmetic is done on UTC midnights. Pure.
export const PAYMENT_TERMS = [
  'due_on_receipt',
  'net_15',
  'net_30',
  'net_60',
  'net_90',
  'custom',
] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const TERM_DAYS: Record<Exclude<PaymentTerms, 'custom'>, number> = {
  due_on_receipt: 0,
  net_15: 15,
  net_30: 30,
  net_60: 60,
  net_90: 90,
};

const DAY_MS = 86_400_000;

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
}

/** The due date for the terms; for custom terms the date the person chose (not before the issue date). */
export function dueDateFor(issueDate: string, terms: PaymentTerms, custom: string | null): string {
  if (terms === 'custom') return custom && custom >= issueDate ? custom : issueDate;
  return addDays(issueDate, TERM_DAYS[terms]);
}

/** Label such as "Net 30" or "Due on receipt" for the printed invoice. */
export function termsLabel(terms: PaymentTerms, issueDate: string, dueDate: string): string {
  if (terms === 'due_on_receipt') return 'Due on receipt';
  if (terms === 'custom') return `Due ${dueDate}`;
  return `Net ${TERM_DAYS[terms]}`.replace(/^Net 0$/, `Due ${issueDate}`);
}
