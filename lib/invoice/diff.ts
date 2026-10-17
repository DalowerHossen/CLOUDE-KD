// path: lib/invoice/diff.ts
// Compares two versions of an invoice input and lists what changed. Pure. Safe to import in the browser.
import type { InvoiceInput, InvoiceLineInput } from './input';

export interface DiffEntry {
  /** A short name of the field or "Line 3". */
  field: string;
  from: string;
  to: string;
}

const HEADER: { key: keyof InvoiceInput; label: string }[] = [
  { key: 'kind', label: 'Type' },
  { key: 'clientId', label: 'Client' },
  { key: 'walkInName', label: 'Customer name' },
  { key: 'issueDate', label: 'Issue date' },
  { key: 'paymentTerms', label: 'Payment terms' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'poNumber', label: 'Purchase order' },
  { key: 'notes', label: 'Notes' },
  { key: 'internalNotes', label: 'Internal notes' },
  { key: 'category', label: 'Category' },
  { key: 'paperSize', label: 'Paper' },
  { key: 'template', label: 'Layout' },
  { key: 'displayCurrency', label: 'Display currency' },
];

const text = (v: unknown): string =>
  v === null || v === undefined || v === '' ? '(empty)' : String(v);

function lineText(l: InvoiceLineInput): string {
  const discount =
    l.discountKind === 'none'
      ? ''
      : `, discount ${l.discountValue}${l.discountKind === 'percent' ? '%' : ''}`;
  const tax = l.taxExempt
    ? ', no tax'
    : l.taxCodes.length > 0
      ? `, tax ${l.taxCodes.join('+')}`
      : '';
  return `${l.description} - ${l.quantity} ${l.unit} x ${l.unitPrice}${discount}${tax}`;
}

export function diffInputs(before: InvoiceInput, after: InvoiceInput): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const { key, label } of HEADER) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b))
      out.push({ field: label, from: text(a), to: text(b) });
  }
  for (const [key, a] of Object.entries(before.options) as [string, unknown][]) {
    const b = (after.options as Record<string, unknown>)[key];
    if (JSON.stringify(a) !== JSON.stringify(b))
      out.push({ field: `Option ${key}`, from: text(a), to: text(b) });
  }
  if (JSON.stringify(before.billTo) !== JSON.stringify(after.billTo))
    out.push({ field: 'Bill to', from: text(before.billTo.name), to: text(after.billTo.name) });
  if (JSON.stringify(before.tags) !== JSON.stringify(after.tags))
    out.push({
      field: 'Tags',
      from: text(before.tags.join(', ')),
      to: text(after.tags.join(', ')),
    });
  const n = Math.max(before.lines.length, after.lines.length);
  for (let i = 0; i < n; i += 1) {
    const a = before.lines[i];
    const b = after.lines[i];
    if (a && b) {
      if (JSON.stringify(a) !== JSON.stringify(b))
        out.push({ field: `Line ${i + 1}`, from: lineText(a), to: lineText(b) });
    } else if (a) out.push({ field: `Line ${i + 1}`, from: lineText(a), to: '(removed)' });
    else if (b) out.push({ field: `Line ${i + 1}`, from: '(none)', to: lineText(b) });
  }
  return out;
}
