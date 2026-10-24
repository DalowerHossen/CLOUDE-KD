// path: services/credit/adjustments.ts
// Deposit invoices (money asked for before the work) and debit notes (extra charges on an invoice already sent). Both
// are invoices of their own kind with their own number series (DEP, DN); the final invoice later takes a paid deposit
// off with `applyCredit` (source type "deposit").
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import type { DebitNoteCreate, DepositCreate } from '@/lib/credit/input';
import type { InvoiceInput } from '@/lib/invoice/input';
import { dueDateFor } from '@/lib/invoice/terms';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getEstimate } from '@/services/estimate/estimates';
import { logInvoiceEvent } from '@/services/invoice/events';
import { createInvoice, getInvoice, inputOf, type InvoiceView } from '@/services/invoice/invoices';
import type { Actor } from '@/types/contracts';

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

async function linkParent(companyId: string, invoiceId: string, parentId: string): Promise<void> {
  const r = await getAdminSupabase()
    .from('invoices')
    .update({ parent_invoice_id: parentId })
    .eq('id', invoiceId)
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .select('id');
  if (r.error) throw new InternalError(r.error);
}

function scaled(base: InvoiceInput, input: DepositCreate, label: string): InvoiceInput {
  const today = new Date().toISOString().slice(0, 10);
  const common = {
    ...base,
    kind: 'deposit' as const,
    issueDate: today,
    dueDate: dueDateFor(today, base.paymentTerms, base.paymentTerms === 'custom' ? today : null),
    notes: label,
    internalNotes: '',
    projectId: base.projectId,
  };
  if (input.mode === 'amount') {
    return {
      ...common,
      options: {
        ...base.options,
        documentDiscountKind: 'none',
        documentDiscountValue: '0',
        shippingAmount: '0',
        shippingTaxable: false,
        shippingTaxCodes: [],
        withholdingRate: '0',
      },
      lines: [
        {
          productId: null,
          variantId: null,
          sku: '',
          description: input.description || 'Deposit',
          hsCode: '',
          quantity: '1',
          unit: 'each',
          unitPrice: Money.parse(input.value).toDbString(),
          discountKind: 'none',
          discountValue: '0',
          taxExempt: true,
          taxCodes: [],
        },
      ],
    };
  }
  const pct = input.value;
  return {
    ...common,
    options: {
      ...base.options,
      shippingAmount: Money.parse(base.options.shippingAmount).percent(pct).toDbString(),
      documentDiscountValue:
        base.options.documentDiscountKind === 'fixed'
          ? Money.parse(base.options.documentDiscountValue).percent(pct).toDbString()
          : base.options.documentDiscountValue,
    },
    lines: base.lines.map((l) => ({
      ...l,
      unitPrice: Money.parse(l.unitPrice).percent(pct).toDbString(),
      discountValue:
        l.discountKind === 'fixed'
          ? Money.parse(l.discountValue).percent(pct).toDbString()
          : l.discountValue,
    })),
  };
}

/** A deposit invoice for an invoice (any status but void) or for an estimate that is not yet declined. */
export async function createDeposit(
  actor: Actor,
  source: { type: 'invoice' | 'estimate'; id: string },
  input: DepositCreate,
): Promise<InvoiceView> {
  const companyId = need(actor);
  let base: InvoiceInput;
  let label: string;
  if (source.type === 'invoice') {
    const inv = await getInvoice(companyId, source.id);
    if (inv.kind !== 'invoice' || inv.status === 'void')
      throw new ValidationError('A deposit can be asked for an invoice that is not void.');
    base = inputOf(inv);
    label = `Deposit for invoice ${inv.number ?? 'draft'}`;
  } else {
    const est = await getEstimate(companyId, source.id);
    if (est.status === 'declined' || est.status === 'void' || est.status === 'draft')
      throw new ValidationError('A deposit can be asked once the estimate was sent.');
    base = est.input;
    label = `Deposit for estimate ${est.number ?? ''}`.trim();
  }
  const deposit = await createInvoice(actor, scaled(base, input, label));
  if (source.type === 'invoice') await linkParent(companyId, deposit.id, source.id);
  await getService('audit').record({
    action: 'invoice.deposit_created',
    resourceType: 'invoice',
    resourceId: deposit.id,
    companyId,
    metadata: { sourceType: source.type, sourceId: source.id, by: actor.userId },
  });
  return getInvoice(companyId, deposit.id);
}

/** A debit note: extra lines charged against an invoice that was already sent. */
export async function createDebitNote(
  actor: Actor,
  parentId: string,
  input: DebitNoteCreate,
): Promise<InvoiceView> {
  const companyId = need(actor);
  const parent = await getInvoice(companyId, parentId);
  if (parent.kind !== 'invoice') throw new NotFoundError();
  if (parent.status === 'draft' || parent.status === 'pending_approval' || parent.status === 'void')
    throw new ValidationError('A debit note is written for an invoice that was sent.');
  const base = inputOf(parent);
  const today = new Date().toISOString().slice(0, 10);
  const note = await createInvoice(actor, {
    ...base,
    kind: 'debit_note',
    issueDate: today,
    dueDate: dueDateFor(today, base.paymentTerms, base.paymentTerms === 'custom' ? today : null),
    notes: `Debit note for invoice ${parent.number ?? ''}: ${input.reason}`,
    internalNotes: '',
    options: {
      ...base.options,
      documentDiscountKind: 'none',
      documentDiscountValue: '0',
      shippingAmount: '0',
      shippingTaxable: false,
      shippingTaxCodes: [],
    },
    lines: input.lines,
  });
  await linkParent(companyId, note.id, parentId);
  await logInvoiceEvent(
    companyId,
    parentId,
    'debit_note',
    `Debit note draft written`,
    actor.userId,
    {
      debitNoteId: note.id,
    },
  );
  await getService('audit').record({
    action: 'invoice.debit_note_created',
    resourceType: 'invoice',
    resourceId: note.id,
    companyId,
    metadata: { parentId, by: actor.userId },
  });
  return getInvoice(companyId, note.id);
}
