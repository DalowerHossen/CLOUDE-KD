// path: services/invoice/order-invoice.ts
// Invoices for orders of an outside store (the checkout sessions of STEP 16 call these through the `invoices` contract).
// The buyer becomes a client of the company, found by e-mail address so that repeat buyers share one client. The invoice has one
// line with the order total (tax is already inside it), is sent at once without an e-mail, and is paid through a payment link.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import type { InvoiceInput } from '@/lib/invoice/input';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { quickCreateClient } from '@/services/client/clients';
import type { Actor, OrderInvoiceInput } from '@/types/contracts';
import { createInvoice } from './invoices';
import { finalizeSend, voidInvoice } from './send';

/** The person the order is made for acts as an owner of the company; nothing here needs a browser session. */
function ownerActor(companyId: string, userId: string): Actor {
  return {
    userId,
    role: 'owner',
    subRole: null,
    companyId,
    email: '',
    sessionId: 'checkout-session',
    impersonatedBy: null,
    authenticatedAt: new Date().toISOString(),
    lastStepUpAt: null,
    mfaVerified: true,
  };
}

async function clientFor(actor: Actor, input: OrderInvoiceInput): Promise<string> {
  const email = input.customerEmail.trim().toLowerCase();
  const found = await getAdminSupabase()
    .from('clients')
    .select('id')
    .eq('company_id', input.companyId)
    .ilike(
      'email',
      email.replace(/[%_\\]/g, (c) => `\\${c}`),
    )
    .is('deleted_at', null)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (found.data) return String(found.data.id);
  const made = await quickCreateClient(actor, {
    name: input.customerName,
    email,
    postalCode: input.customerPostalCode ?? '-',
    country: input.customerCountry,
    confirmDuplicate: true,
  });
  return made.id;
}

export async function createOrderInvoice(
  input: OrderInvoiceInput,
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  if (!input.amount.gt('0')) throw new ValidationError('The order total must be above zero.');
  const actor = ownerActor(input.companyId, input.createdBy);
  const clientId = await clientFor(actor, input);
  const today = new Date().toISOString().slice(0, 10);
  const empty = {
    name: '',
    contactName: '',
    email: '',
    phone: '',
    taxLabel: '',
    taxId: '',
    line1: '',
    line2: '',
    city: '',
    region: '',
    postalCode: input.customerPostalCode ?? '',
    country: input.customerCountry,
  };
  const invoice: InvoiceInput = {
    kind: 'invoice',
    clientId,
    walkInName: '',
    billTo: { ...empty, name: input.customerName, email: input.customerEmail.trim().toLowerCase() },
    shipTo: null,
    issueDate: today,
    paymentTerms: 'due_on_receipt',
    dueDate: today,
    poNumber: input.reference.slice(0, 60),
    notes: '',
    internalNotes: 'Made by a checkout session.',
    tags: ['checkout'],
    category: '',
    projectId: null,
    paperSize: 'a4',
    template: 'classic',
    displayCurrency: null,
    options: {
      priceMode: 'exclusive',
      discountOrder: 'before_tax',
      roundingPolicy: 'per_line',
      roundingMode: 'half_up',
      precision: 2,
      cashRounding: '0',
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
        description: input.description || `Order ${input.reference}`,
        hsCode: '',
        quantity: '1',
        unit: 'order',
        unitPrice: input.amount.toDbString(),
        discountKind: 'none',
        discountValue: '0',
        taxExempt: true,
        taxCodes: [],
      },
    ],
  };
  const draft = await createInvoice(actor, invoice);
  const sent = await finalizeSend(input.companyId, draft.id, input.createdBy, input.createdBy);
  if (!sent.number) throw new InternalError(new Error('The order invoice has no number.'));
  getService('audit')
    .record({
      action: 'checkout.invoice_created',
      resourceType: 'invoice',
      resourceId: draft.id,
      companyId: input.companyId,
      metadata: { reference: input.reference },
    })
    .catch(() => undefined);
  return { invoiceId: draft.id, invoiceNumber: sent.number };
}

export async function voidOrderInvoice(input: {
  companyId: string;
  invoiceId: string;
  voidedBy: string;
  reason: string;
}): Promise<void> {
  await voidInvoice(ownerActor(input.companyId, input.voidedBy), input.invoiceId, input.reason);
}
